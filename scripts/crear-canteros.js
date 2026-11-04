require('dotenv').config();
const pool = require('../src/db');

async function main() {
  const cantidad = Number(process.argv[2] || 28);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 999) throw new Error('La cantidad debe ser un entero entre 1 y 999');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO stock.ubicaciones (padre_id,tipo,codigo,nombre,ruta)
      SELECT i.id,'cantero','C'||lpad(n::text,2,'0'),'Cantero '||n,
             i.ruta||'canteros/C'||lpad(n::text,2,'0')||'/'
      FROM stock.ubicaciones i CROSS JOIN generate_series(1,$1::int) n
      WHERE i.tipo='invernadero'
      ON CONFLICT DO NOTHING
      RETURNING id`, [cantidad]);
    const resumen = await client.query(`
      SELECT i.codigo,COUNT(c.id)::int AS canteros
      FROM stock.ubicaciones i LEFT JOIN stock.ubicaciones c
        ON c.padre_id=i.id AND c.tipo='cantero'
      WHERE i.tipo='invernadero' GROUP BY i.id ORDER BY i.codigo`);
    await client.query('COMMIT');
    console.log(`Canteros nuevos: ${result.rowCount}. Los existentes se conservaron.`);
    resumen.rows.forEach(r => console.log(`${r.codigo.replace(/^I/, 'INV')}: ${r.canteros} canteros`));
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => pool.end());
