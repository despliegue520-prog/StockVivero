// Pruebas HTTP aisladas: no crean ubicaciones ni modifican la base real.
require('dotenv').config();
const assert = require('node:assert/strict');
const express = require('express');
const pool = require('../src/db');
const fixtures = [{ id: 1, tipo: 'invernadero', codigo: 'I01', nombre: 'Uno', ruta: '/invernaderos/I01/' }, { id: 2, tipo: 'cantero', codigo: 'C01', nombre: 'Cantero', ruta: '/invernaderos/I01/canteros/C01/' }];
pool.query = async (sql, values) => {
  if (sql.startsWith('UPDATE')) return { rows: [{ ...fixtures[0], nombre: values[0] }], rowCount: 1 };
  if (sql.includes('WHERE ruta=')) return { rows: [], rowCount: fixtures.some(u => u.ruta === values[0]) ? 1 : 0 };
  if (sql.includes('WHERE id=')) return { rows: fixtures.filter(u => u.id === values[0]), rowCount: 1 };
  return { rows: fixtures, rowCount: fixtures.length };
};
const app = express();
app.use(express.json());
app.use((req, res, next) => req.header('x-api-key') === 'test-only' ? next() : res.sendStatus(401));
app.use('/api/ubicaciones', require('../src/routes/ubicaciones'));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/ubicaciones`;
  const call = (path, options = {}) => fetch(base + path, { ...options, headers: { 'x-api-key': 'test-only', 'Content-Type': 'application/json' } });
  try {
    process.env.PUBLIC_BASE_URL = 'https://controldestock.viverolosaromos.com.ar';
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await call('')).status, 200);
    const config = await (await call('/config')).json();
    assert.equal(config.base_url, process.env.PUBLIC_BASE_URL);
    const svg = await call('/qr?ruta=' + encodeURIComponent('/invernaderos/I01/'));
    assert.equal(svg.status, 200); assert.match(await svg.text(), /<svg/);
    assert.equal((await call('/qr?ruta=%2Fcanteros%2FI01-C01%2F')).status,200);
    const png = await call('/qr?ruta=%2Fmacetas%2F&formato=png');
    assert.equal(png.status, 200); assert.equal(png.headers.get('content-type'), 'image/png');
    assert.equal((await call('/qr?ruta=https://evil.example/')).status, 404);
    assert.equal((await call('/qr?ruta=%2Finvernaderos%2FI99%2F')).status, 404);
    const rename = await (await call('/1', { method: 'PATCH', body: JSON.stringify({ nombre: 'Nombre nuevo', codigo: 'I99' }) })).json();
    assert.equal(rename.nombre, 'Nombre nuevo'); assert.equal(rename.ruta, fixtures[0].ruta); assert.equal(rename.codigo, 'I01');
    assert.equal((await call('', { method: 'POST', body: JSON.stringify({ padre_id: 1, numero: -1, nombre: 'Inválido' }) })).status, 400);
    process.env.PUBLIC_BASE_URL = 'http://localhost:3001';
    assert.equal((await call('/qr?ruta=%2Fmacetas%2F')).status, 503);
    delete process.env.PUBLIC_BASE_URL;
    assert.equal((await call('/config')).status, 503);
    console.log('OK: API key, QR SVG/PNG, dominio propio, rutas registradas y renombrado permanente.');
  } catch (err) { console.error(err); process.exitCode = 1; }
  finally { server.close(); await pool.end(); }
});
