require('dotenv').config();

const pool = require('../src/db');

const productos = [
  ['INS-COCO-PICH-5050', 'Coco Pich 50-50', 'sustratos', 'plantado', 'unidad', 120],
  ['INS-TURBA-120DM3', 'Turba 120 dm³', 'sustratos', 'plantado', 'unidad', 849],
  ['INS-PLANTACOTE-6M', 'Plantacote 6M', 'fertilizantes', 'plantado', 'unidad', 150],
  ['INS-BANDEJA-18-ALVEOLOS', 'Bandeja 18 alveolos (0,56 × 0,29)', 'bandejas', 'plantado', 'unidad', 12405],
  ['INS-MACETA-9X9X19-1L', 'Maceta 9×9×19 (1 litro)', 'macetas', 'plantado', 'unidad', 110846],
  ['INS-BANDEJA-25-150-FORESTALES', 'Bandeja 25 alveolos × 150 (forestales)', 'bandejas', 'plantado', 'unidad', 900],
  ['INS-BANDEJA-A54', 'Bandeja A54', 'bandejas', 'plantado', 'unidad', 0],
  ['INS-TUBETE-R250', 'Tubete R250', 'macetas', 'plantado', 'unidad', 0],
  ['INS-BANDEJA-117-MONEDA', 'Bandeja 117/moneda', 'bandejas', 'plantado', 'unidad', 1300],
  ['INS-JIFFY-MONEDA-TURBA', 'Jiffy moneda de turba', 'sustratos', 'plantado', 'unidad', 421227],
  ['INS-PREFORMADO-BANDEJA-200', 'Preformado / bandeja × 200', 'bandejas', 'picado', 'unidad', 2011],
  ['INS-CLORO', 'Cloro', 'limpieza', 'picado', 'litro', 350],
  ['INS-TIJERAS-PICADO', 'Tijeras de picado', 'herramientas', 'picado', 'unidad', 12],
  ['INS-AGUA-DESTILADA', 'Agua destilada', 'limpieza', 'picado', 'litro', 5],
  ['INS-HORMONA-GRANO', 'Hormona en grano', 'agroquimicos', 'picado', 'unidad', 126],
  ['INS-ALCOHOL', 'Alcohol', 'limpieza', 'picado', 'litro', 0],
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [codigo, nombre, categoria, area, unidad, stock] of productos) {
      const producto = await client.query(
        `INSERT INTO stock.productos (codigo, nombre, unidad, stock_minimo, categoria, area, datos)
         VALUES ($1, $2, $3, 0, $4, $5, $6)
         ON CONFLICT (codigo) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           unidad = EXCLUDED.unidad,
           categoria = EXCLUDED.categoria,
           area = EXCLUDED.area
         RETURNING id`,
        [codigo, nombre, unidad, categoria, area, JSON.stringify({ stock_pendiente: true })]
      );
      if (stock > 0) {
        await client.query(
          `INSERT INTO stock.movimientos (producto_id, tipo, cantidad, motivo)
           SELECT $1, 'entrada', $2, 'Carga inicial de insumos'
           WHERE NOT EXISTS (
             SELECT 1 FROM stock.movimientos
             WHERE producto_id = $1 AND motivo = 'Carga inicial de insumos'
           )`,
          [producto.rows[0].id, stock]
        );
      }
    }
    await client.query('COMMIT');
    console.log(`${productos.length} insumos procesados; las cantidades conocidas quedaron registradas como entradas.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('Error cargando insumos:', error.message);
  process.exit(1);
});
