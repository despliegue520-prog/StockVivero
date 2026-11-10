require('dotenv').config();
const assert = require('node:assert/strict');
const express = require('express');
const pool = require('../src/db');
const producto = { id: 1, codigo: 'TEST', nombre: 'Ejemplo', activo: true };
pool.query = async (sql, args) => {
  assert.ok(!/DELETE FROM/i.test(sql), 'No debe borrar el historial ni el producto físicamente');
  if (sql.includes('SET activo=false')) {
    if (Number(args[0]) !== 1) return { rows: [] };
    producto.activo = false;
    return { rows: [{ ...producto }] };
  }
  assert.match(sql, /WHERE s.activo AND/);
  return { rows: producto.activo ? [{ ...producto }] : [] };
};
const app = express(); app.use(express.json()); app.use('/productos', require('../src/routes/productos'));
app.use((err,req,res,next)=>res.status(500).json({error:err.message}));
const server = app.listen(0, '127.0.0.1', async () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/productos';
  try {
    assert.equal((await (await fetch(url)).json()).length,1);
    assert.equal((await fetch(url+'/1',{method:'DELETE'})).status,200);
    assert.equal((await (await fetch(url)).json()).length,0);
    assert.equal((await fetch(url+'/1',{method:'DELETE'})).status,200);
    assert.equal((await fetch(url+'/2',{method:'DELETE'})).status,404);
    assert.equal((await fetch(url+'/incorrecto',{method:'DELETE'})).status,400);
    console.log('OK: eliminación lógica, ocultación del listado, reintento seguro e IDs inválidos.');
  } catch(err) {console.error(err);process.exitCode=1;}
  finally {server.close();await pool.end();}
});
