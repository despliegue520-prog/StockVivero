const router = require('express').Router();
const pool = require('../db');
const QRCode = require('qrcode');
const categorias = require('../categorias');
const { isIP } = require('node:net');

function baseUrl() {
  const raw = process.env.PUBLIC_BASE_URL;
  if (!raw) throw Object.assign(new Error('Configurá PUBLIC_BASE_URL para generar QR'), { status: 503 });
  const url = new URL(raw);
  if (url.protocol !== 'https:' || isIP(url.hostname.replace(/^\[|\]$/g, '')) || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') || url.hostname.endsWith('.onrender.com') || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw Object.assign(new Error('PUBLIC_BASE_URL debe ser el dominio propio HTTPS, sin rutas ni credenciales'), { status: 503 });
  }
  return url.origin;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT u.*, COALESCE(s.ocupado,0)::int AS ocupado
      FROM stock.ubicaciones u LEFT JOIN (
        SELECT fila_id,SUM(cantidad) AS ocupado FROM stock.planta_saldos GROUP BY fila_id
      ) s ON s.fila_id=u.id ORDER BY u.ruta`);
    res.json({ ubicaciones: rows, categorias: categorias.map(c => ({ ...c, ruta: `/${c.slug}/` })) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { padre_id, numero, nombre } = req.body;
    if (!Number.isInteger(numero) || numero < 1 || numero > 999 || !Number.isInteger(padre_id) || padre_id < 1 || typeof nombre !== 'string' || !nombre.trim() || nombre.length > 150) {
      return res.status(400).json({ error: 'Indicá padre, número entero entre 1 y 999 y nombre (hasta 150 caracteres)' });
    }
    const padre = (await pool.query('SELECT * FROM stock.ubicaciones WHERE id=$1', [padre_id])).rows[0];
    if (!padre || padre.tipo === 'fila') return res.status(400).json({ error: 'El padre debe ser un invernadero o cantero' });
    const tipo = padre.tipo === 'invernadero' ? 'cantero' : 'fila';
    const codigo = (tipo === 'cantero' ? 'C' : 'F') + String(numero).padStart(2, '0');
    const ruta = padre.ruta + (tipo === 'cantero' ? 'canteros/' : 'filas/') + codigo + '/';
    const { rows } = await pool.query('INSERT INTO stock.ubicaciones (padre_id,tipo,codigo,nombre,ruta) VALUES ($1,$2,$3,$4,$5) RETURNING *', [padre_id,tipo,codigo,nombre.trim(),ruta]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese código ya existe en esta ubicación' });
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id) || typeof req.body.nombre !== 'string' || !req.body.nombre.trim() || req.body.nombre.length > 150) return res.status(400).json({ error: 'Nombre o identificador inválido' });
    const { rows } = await pool.query('UPDATE stock.ubicaciones SET nombre=$1 WHERE id=$2 RETURNING *', [req.body.nombre.trim(), req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ubicación no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/qr', async (req, res, next) => {
  try {
    let ruta = req.query.ruta;
    const corto = typeof ruta === 'string' && ruta.match(/^\/canteros\/(I[0-9]{2,3})-(C[0-9]{2,3})\/$/);
    const consulta = corto ? '/invernaderos/'+corto[1]+'/canteros/'+corto[2]+'/' : ruta;
    if (typeof ruta !== 'string' || ruta.length > 200) return res.status(400).json({ error: 'Ruta inválida' });
    const categoria = categorias.some(c => ruta === `/${c.slug}/`);
    if (!categoria && !(await pool.query('SELECT 1 FROM stock.ubicaciones WHERE ruta=$1', [consulta])).rowCount) return res.status(404).json({ error: 'Ubicación no encontrada' });
    const url = baseUrl() + ruta;
    const formato = req.query.formato || 'svg';
    if (!['svg', 'png'].includes(formato)) return res.status(400).json({ error: 'Formato inválido' });
    res.set('Cache-Control', 'no-store');
    if (formato === 'png') res.type('png').send(await QRCode.toBuffer(url, { width: 600, margin: 4, errorCorrectionLevel: 'M' }));
    else res.type('svg').send(await QRCode.toString(url, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' }));
  } catch (err) { next(err); }
});

router.get('/config', (req, res, next) => {
  try { res.json({ base_url: baseUrl() }); } catch (err) { next(err); }
});

module.exports = router;
