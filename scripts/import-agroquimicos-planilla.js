require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function codigoBase(nombre) {
  const slug = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36);
  return `AQ-${slug || 'SIN-NOMBRE'}`;
}

async function main() {
  await client.connect();
  await client.query("SET statement_timeout='15000'");
  await client.query("SET lock_timeout='5000'");
  try {
    const nombresOrdenes = (await client.query(`
      SELECT DISTINCT btrim(nombre_producto) AS nombre
      FROM orden_trabajo_productos
      WHERE nombre_producto IS NOT NULL AND btrim(nombre_producto) <> ''
      ORDER BY nombre
    `)).rows.map(row => row.nombre);
    
    const nombresCatalogo = (await client.query(`
      SELECT nombre,tipo,banda_toxicidad
      FROM producto_quimico
      WHERE nombre IS NOT NULL
    `)).rows.map(row => String(row.nombre).trim()).filter(Boolean);
    const nombres = [...new Set([...nombresOrdenes, ...nombresCatalogo])].sort((a, b) => a.localeCompare(b, 'es'));
    await client.query('BEGIN');

    let creados = 0;
    let vinculados = 0;
    let sinVincular = 0;

    for (const nombre of nombres) {
      let producto = (await client.query(`
        SELECT id FROM stock.productos
        WHERE categoria='agroquimicos' AND lower(btrim(nombre))=lower($1)
        ORDER BY id LIMIT 1
      `, [nombre])).rows[0];

      if (!producto) {
        let codigo = codigoBase(nombre);
        let numero = 2;
        while ((await client.query('SELECT 1 FROM stock.productos WHERE codigo=$1', [codigo])).rowCount) {
          codigo = `${codigoBase(nombre)}-${numero++}`;
        }
        producto = (await client.query(`
          INSERT INTO stock.productos(codigo,nombre,unidad,stock_minimo,categoria,datos)
          VALUES($1,$2,'unidad',0,'agroquimicos',$3)
          RETURNING id
        `, [codigo, nombre, JSON.stringify({ origen: 'planilla-obra', pendiente_completar: true })])).rows[0];
        creados++;
      }

      const actualizado = await client.query(`
        UPDATE orden_trabajo_productos
        SET stock_producto_id=$1
        WHERE stock_producto_id IS NULL
          AND lower(btrim(nombre_producto))=lower($2)
      `, [producto.id, nombre]);
      vinculados += actualizado.rowCount;
    }

    const pendientes = await client.query(`
      SELECT count(*)::int AS cantidad
      FROM orden_trabajo_productos
      WHERE stock_producto_id IS NULL
        AND nombre_producto IS NOT NULL AND btrim(nombre_producto) <> ''
    `);
    sinVincular = pendientes.rows[0].cantidad;

    const invalidos = await client.query(`
      SELECT count(*)::int AS cantidad
      FROM orden_trabajo_productos otp
      LEFT JOIN stock.productos p ON p.id = otp.stock_producto_id
      WHERE otp.stock_producto_id IS NOT NULL
        AND (p.id IS NULL OR p.categoria <> 'agroquimicos')
    `);
    if (invalidos.rows[0].cantidad > 0) {
      throw new Error(`Hay ${invalidos.rows[0].cantidad} vínculos stock_producto_id inválidos`);
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ nombres: nombres.length, creados, vinculados, sinVincular }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
