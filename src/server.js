require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');

const pool = require('./db');
const productos = require('./routes/productos');
const movimientos = require('./routes/movimientos');
const tareas = require('./routes/tareas');
const categorias = require('./categorias');
const areas = require('./areas');
const { buscarUsuario, validarPassword, crearToken, autenticar } = require('./auth');

const ubicaciones = require('./routes/ubicaciones');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json());

app.use(express.static(publicDir));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(publicDir, 'logo.png')));
app.get('/ejemplo-cantero-qr.svg', async (req, res, next) => {
  try {
    const base = process.env.PUBLIC_BASE_URL || 'https://controldestock.viverolosaromos.com.ar';
    const destino = new URL('/ejemplo-cantero.html', base).toString();
    res.type('image/svg+xml').send(await QRCode.toString(destino, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }));
  } catch (err) { next(err); }
});
app.get(/^\/canteros\/(I[0-9]{2,3})-(C[0-9]{2,3})\/?$/, async (req,res,next) => {
  try {
    const ruta='/invernaderos/'+req.params[0]+'/canteros/'+req.params[1]+'/';
    if (!(await pool.query('SELECT 1 FROM stock.ubicaciones WHERE ruta=$1',[ruta])).rowCount) return res.status(404).send('Cantero no encontrado');
    res.sendFile(path.join(publicDir,'ubicaciones.html'));
  } catch(err){next(err);}
});
app.get(['/etiquetas/', '/invernaderos/', /^\/invernaderos\/I[0-9]{2,3}\/(?:canteros\/C[0-9]{2,3}\/(?:filas\/F[0-9]{2,3}\/?)?)?$/], async (req, res, next) => {
  try {
    if (!['/etiquetas', '/etiquetas/', '/invernaderos', '/invernaderos/'].includes(req.path)) {
      const ruta = req.path.endsWith('/') ? req.path : req.path + '/';
      if (!(await pool.query('SELECT 1 FROM stock.ubicaciones WHERE ruta=$1', [ruta])).rowCount) return res.status(404).send('Ubicacion no encontrada');
    }
    res.sendFile(path.join(publicDir, 'ubicaciones.html'));
  } catch (err) { next(err); }
});

// Cada categoría abre la interfaz del stock.
app.get(
  categorias.map(c => '/' + c.slug + '/'),
  (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  }
);

// Comprobación del servicio para Render.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

app.post('/auth/login', async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'Indicá usuario y contraseña' });
    const usuario = await buscarUsuario(username);
    if (!usuario || !usuario.activo || !(await validarPassword(password, usuario.password_hash))) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    res.json({
      token: crearToken(usuario),
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        nombre_usuario: usuario.nombre_usuario,
        rol: usuario.rol,
      },
    });
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ error: 'La tabla usuario del planificador no está disponible en esta base de datos' });
    next(err);
  }
});

app.post('/auth/logout', (req, res) => res.status(204).end());
app.get('/auth/me', autenticar, (req, res) => res.json({ usuario: req.user }));

// Conservamos la protección actual por API key.
app.use((req, res, next) => {
  // El login por usuarios es el mecanismo principal; la API key queda como compatibilidad.
  autenticar(req, res, next);
});

app.get('/categorias', (req, res) => {
  res.json(categorias);
});
app.get('/areas', (req, res) => {
  res.json(areas);
});

app.use('/api/ubicaciones', ubicaciones);
app.use('/api/plantas', require('./routes/plantas'));
app.use('/productos', productos);
app.use('/movimientos', movimientos);
app.use('/tareas', tareas);

// Interpreta consultas de producción para la calculadora de stock.
app.post('/api/produccion/interpretar', async (req, res) => {
  const consulta = typeof req.body?.consulta === 'string'
    ? req.body.consulta.trim()
    : '';

  if (!consulta || consulta.length > 500) {
    return res.status(400).json({ error: 'Escribí una consulta de hasta 500 caracteres.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'La consulta con IA todavía no está configurada.' });
  }

  const properties = {
    variedad: { type: ['string', 'null'] },
    etapa: { type: ['string', 'null'] },
    cantidad_plantas: { type: ['integer', 'null'] },
    maceta_litros: { type: ['number', 'null'] },
  };

  try {
    const modelo = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const solicitud = {
      systemInstruction: {
        parts: [{ text: 'Extraé los datos de la consulta de producción. Usá null si un dato falta o es ambiguo. Convertí el volumen de la maceta a litros.' }],
      },
      contents: [{ parts: [{ text: consulta }] }],
      generationConfig: {
        responseFormat: {
          text: {
            mimeType: 'APPLICATION_JSON',
            schema: { type: 'object', properties, required: Object.keys(properties) },
          },
        },
      },
    };
    let respuesta;
    for (let intento = 1; intento <= 2; intento++) {
      respuesta = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify(solicitud),
        }
      );
      if (respuesta.ok) break;
      const detalle = await respuesta.text();
      console.error(`Gemini respondió HTTP ${respuesta.status} (intento ${intento}): ${detalle.slice(0, 500)}`);
      if (![429, 500, 502, 503, 504].includes(respuesta.status) || intento === 2) {
        return res.status(502).json({ error: 'Gemini no pudo procesar la consulta.' });
      }
    }

    const datos = await respuesta.json();
    const texto = datos.candidates?.[0]?.content?.parts?.find(
      parte => typeof parte.text === 'string' && !parte.thought
    )?.text;

    if (!texto) throw new Error('Gemini no devolvió una respuesta estructurada');

    return res.json(JSON.parse(texto));
  } catch (error) {
    console.error('Error interpretando producción con Gemini:', error.message);
    return res.status(502).json({ error: 'No se pudo interpretar la consulta. Intentá nuevamente.' });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
  });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;

  if (status === 500) {
    console.error(err);
  }

  res.status(status).json({
    error: status === 500
      ? 'Error interno'
      : err.message,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Stock API escuchando en el puerto ${PORT}`);
});
