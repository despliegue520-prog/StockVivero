require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const pool = require('./db');
const productos = require('./routes/productos');
const movimientos = require('./routes/movimientos');
const categorias = require('./categorias');
const { buscarUsuario, validarPassword, crearToken, autenticar } = require('./auth');

const ubicaciones = require('./routes/ubicaciones');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json());

app.use(express.static(publicDir));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(publicDir, 'logo.png')));
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

app.use('/api/ubicaciones', ubicaciones);
app.use('/api/plantas', require('./routes/plantas'));
app.use('/productos', productos);
app.use('/movimientos', movimientos);

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
