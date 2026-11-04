require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  const plantas = fs.readFileSync(path.join(__dirname, '..', 'sql', 'plantas.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql.replace(/^BEGIN;\s*/i, '').replace(/COMMIT;\s*$/i, ''));
    await client.query(plantas);
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
  console.log('Schema "stock" creado/actualizado correctamente.');
  await pool.end();
}

main().catch((err) => {
  console.error('Error en la migración:', err.message);
  process.exit(1);
});
