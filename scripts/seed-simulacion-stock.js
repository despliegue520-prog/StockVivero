require('dotenv').config();

const pool = require('../src/db');

const productos = [
  {
    codigo: 'SIM-SUSTRATO-3L',
    nombre: 'Sustrato premium 3 L',
    unidad: 'kg',
    categoria: 'general',
    stock_minimo: 25,
    datos: { simulacion: true, uso: 'produccion', consumo_por_planta: 1.2, consumo_unidad: 'kg' },
  },
  {
    codigo: 'SIM-FERT-RAIZ',
    nombre: 'Fertilizante enraizante',
    unidad: 'kg',
    categoria: 'agroquimicos',
    stock_minimo: 5,
    datos: { simulacion: true, uso: 'produccion', consumo_por_planta: 0.03, consumo_unidad: 'kg' },
  },
  {
    codigo: 'SIM-FERT-CREC',
    nombre: 'Fertilizante crecimiento',
    unidad: 'kg',
    categoria: 'agroquimicos',
    stock_minimo: 8,
    datos: { simulacion: true, uso: 'produccion', consumo_por_planta: 0.02, consumo_unidad: 'kg' },
  },
  {
    codigo: 'SIM-TRICHODERMA',
    nombre: 'Trichoderma',
    unidad: 'kg',
    categoria: 'agroquimicos',
    stock_minimo: 2,
    datos: { simulacion: true, uso: 'produccion', consumo_por_planta: 0.005, consumo_unidad: 'kg' },
  },
  {
    codigo: 'SIM-MACETA-3L',
    nombre: 'Maceta para producción 3 L',
    unidad: 'unidad',
    categoria: 'macetas',
    stock_minimo: 50,
    datos: { simulacion: true, uso: 'produccion', maceta_litros: 3, consumo_por_planta: 1, consumo_unidad: 'unidad' },
  },
  {
    codigo: 'SIM-MACETA-5L',
    nombre: 'Maceta para producción 5 L',
    unidad: 'unidad',
    categoria: 'macetas',
    stock_minimo: 40,
    datos: { simulacion: true, uso: 'produccion', maceta_litros: 5, consumo_por_planta: 1, consumo_unidad: 'unidad' },
  },
  {
    codigo: 'SIM-ABONO-ORGANICO',
    nombre: 'Abono orgánico',
    unidad: 'kg',
    categoria: 'fertilizantes',
    stock_minimo: 20,
    datos: { simulacion: true, uso: 'produccion', consumo_por_planta: 0.4, consumo_unidad: 'kg' },
  },
  {
    codigo: 'SIM-HORMONA-RAIZ',
    nombre: 'Hormona de enraizamiento',
    unidad: 'kg',
    categoria: 'agroquimicos',
    stock_minimo: 1,
    datos: { simulacion: true, uso: 'produccion', consumo_por_planta: 0.01, consumo_unidad: 'kg' },
  },
  {
    codigo: 'SIM-BANDEJA-72',
    nombre: 'Bandeja de germinación 72 celdas',
    unidad: 'unidad',
    categoria: 'bandejas',
    stock_minimo: 10,
    datos: { simulacion: true, uso: 'produccion', consumo_por_planta: 0.02, consumo_unidad: 'unidad' },
  },
  {
    codigo: 'SIM-ETIQUETA-VIVERO',
    nombre: 'Etiqueta identificadora de vivero',
    unidad: 'unidad',
    categoria: 'general',
    stock_minimo: 100,
    datos: { simulacion: true, uso: 'produccion', consumo_por_planta: 1, consumo_unidad: 'unidad' },
  },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = [];

    for (const producto of productos) {
      const result = await client.query(
        `INSERT INTO stock.productos (codigo, nombre, unidad, stock_minimo, categoria, datos)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (codigo) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           unidad = EXCLUDED.unidad,
           stock_minimo = EXCLUDED.stock_minimo,
           categoria = EXCLUDED.categoria,
           datos = EXCLUDED.datos
         RETURNING id`,
        [producto.codigo, producto.nombre, producto.unidad, producto.stock_minimo, producto.categoria, JSON.stringify(producto.datos)]
      );
      ids.push({ id: result.rows[0].id, codigo: producto.codigo });
    }

    const cantidades = new Map([
      ['SIM-SUSTRATO-3L', 180],
      ['SIM-FERT-RAIZ', 9],
      ['SIM-FERT-CREC', 14],
      ['SIM-TRICHODERMA', 4],
      ['SIM-MACETA-3L', 240],
      ['SIM-MACETA-5L', 30],
      ['SIM-ABONO-ORGANICO', 35],
      ['SIM-HORMONA-RAIZ', 1.5],
      ['SIM-BANDEJA-72', 18],
      ['SIM-ETIQUETA-VIVERO', 420],
    ]);

    for (const { id, codigo } of ids) {
      const motivo = 'SIMULACIÓN - stock inicial de producción';
      const existe = await client.query(
        'SELECT 1 FROM stock.movimientos WHERE producto_id=$1 AND motivo=$2 LIMIT 1',
        [id, motivo]
      );
      if (!existe.rowCount) {
        await client.query(
          `INSERT INTO stock.movimientos (producto_id, tipo, cantidad, motivo)
           VALUES ($1, 'entrada', $2, $3)`,
          [id, cantidades.get(codigo), motivo]
        );
      }
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, productos: ids.length, mensaje: 'Datos de simulación cargados.' }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('No se pudieron cargar los datos de simulación:', error.message);
  process.exitCode = 1;
});
