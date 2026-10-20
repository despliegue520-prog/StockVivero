const pool = require('../db');

class StockError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_CANTIDAD = 999999999.999;

/**
 * Registra un movimiento dentro de una transacción.
 * Si le pasás un `client` (por ejemplo desde el planificador),
 * se une a la transacción existente; si no, crea la suya.
 *
 * tipo 'entrada' -> cantidad positiva, suma
 * tipo 'salida'  -> cantidad positiva, resta
 * tipo 'ajuste'  -> cantidad con signo (+ suma, - resta)
 */
async function registrarMovimiento(
  { producto_id, tipo, cantidad, motivo = null, tarea_id = null } = {},
  client = null
) {
  const own = !client;
  const db = client || (await pool.connect());

  try {
    if (own) await db.query('BEGIN');

    if (!Number.isSafeInteger(Number(producto_id)) || Number(producto_id) <= 0) {
      throw new StockError('producto_id debe ser un entero positivo');
    }

    const cant = Number(cantidad);
    if (
      cantidad === '' ||
      cantidad === null ||
      cantidad === undefined ||
      !Number.isFinite(cant) ||
      cant === 0 ||
      Math.abs(cant) > MAX_CANTIDAD ||
      Number(cant.toFixed(3)) !== cant
    ) {
      throw new StockError('La cantidad debe ser distinta de cero, tener hasta 3 decimales y no superar 999999999.999');
    }

    if (!['entrada', 'salida', 'ajuste'].includes(tipo)) {
      throw new StockError('El tipo debe ser entrada, salida o ajuste');
    }
    if (tipo !== 'ajuste' && cant < 0) {
      throw new StockError('En entradas y salidas la cantidad debe ser positiva');
    }
    if (motivo !== null && (typeof motivo !== 'string' || motivo.length > 1000)) {
      throw new StockError('El motivo debe ser texto de hasta 1000 caracteres');
    }
    if (
      tarea_id !== null &&
      tarea_id !== '' &&
      (!Number.isSafeInteger(Number(tarea_id)) || Number(tarea_id) <= 0)
    ) {
      throw new StockError('tarea_id debe ser un entero positivo');
    }

    // Bloquea el producto para evitar que dos descuentos simultáneos se pisen
    const prod = await db.query(
      'SELECT id, activo FROM stock.productos WHERE id = $1 FOR UPDATE',
      [Number(producto_id)]
    );
    if (prod.rowCount === 0) throw new StockError('Producto no encontrado', 404);
    if (!prod.rows[0].activo) throw new StockError('El producto está inactivo');

    const delta = tipo === 'salida' ? -cant : cant;

    if (delta < 0 && process.env.ALLOW_NEGATIVE !== 'true') {
      const actual = await db.query(
        'SELECT COALESCE(SUM(cantidad), 0) AS stock FROM stock.movimientos WHERE producto_id = $1',
        [Number(producto_id)]
      );
      if (Number(actual.rows[0].stock) + delta < 0) {
        throw new StockError(
          `Stock insuficiente (disponible: ${actual.rows[0].stock})`,
          409
        );
      }
    }

    const res = await db.query(
      `INSERT INTO stock.movimientos (producto_id, tipo, cantidad, motivo, tarea_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        Number(producto_id),
        tipo,
        delta,
        motivo === null ? null : motivo.trim(),
        tarea_id === '' ? null : tarea_id
      ]
    );

    if (own) await db.query('COMMIT');
    return res.rows[0];
  } catch (err) {
    if (own) await db.query('ROLLBACK');
    throw err;
  } finally {
    if (own) db.release();
  }
}

module.exports = { registrarMovimiento, StockError };
