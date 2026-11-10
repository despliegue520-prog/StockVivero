const express = require('express');
const router = express.Router();
const pool = require('../db');
const { registrarMovimiento } = require('../services/stock');

router.get('/', async (req, res, next) => {
  try {
    const query = `
      SELECT * FROM stock.tareas 
      ORDER BY 
        CASE estado 
          WHEN 'En Progreso' THEN 1 
          WHEN 'Pendiente' THEN 2 
          WHEN 'Completada' THEN 3 
        END, 
        fecha_programada ASC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  const { titulo, descripcion, fecha_programada } = req.body;
  try {
    const query = `
      INSERT INTO stock.tareas (titulo, descripcion, fecha_programada)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await pool.query(query, [titulo, descripcion, fecha_programada || null]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:id/estado', async (req, res, next) => {
  const { id } = req.params;
  const { estado } = req.body;
  try {
    const query = `
      UPDATE stock.tareas 
      SET estado = $1 
      WHERE id = $2 
      RETURNING *;
    `;
    const result = await pool.query(query, [estado, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/consumos', async (req, res, next) => {
  try {
    const tareaId = Number(req.params.id);
    if (!Number.isSafeInteger(tareaId) || tareaId < 1) return res.status(400).json({ error: 'Tarea inválida' });
    const { rows } = await pool.query(
      `SELECT m.*,p.codigo,p.nombre,p.unidad,p.categoria
       FROM stock.movimientos m JOIN stock.productos p ON p.id=m.producto_id
       WHERE m.tarea_id=$1 AND p.categoria='agroquimicos'
       ORDER BY m.creado_en DESC,m.id DESC`, [tareaId]
    );
    res.json(rows);
  } catch (error) { next(error); }
});

router.post('/:id/consumos', async (req, res, next) => {
  const tareaId = Number(req.params.id);
  const productoId = Number(req.body.producto_id);
  const cantidad = Number(req.body.cantidad);
  if (!Number.isSafeInteger(tareaId) || tareaId < 1 || !Number.isSafeInteger(productoId) || productoId < 1 || !Number.isFinite(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: 'Tarea, producto y cantidad positiva son obligatorios' });
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const tarea = await db.query('SELECT id FROM stock.tareas WHERE id=$1 FOR UPDATE', [tareaId]);
    if (!tarea.rowCount) throw Object.assign(new Error('Tarea no encontrada'), { status: 404 });
    const producto = await db.query('SELECT id,categoria FROM stock.productos WHERE id=$1 FOR UPDATE', [productoId]);
    if (!producto.rowCount) throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
    if (producto.rows[0].categoria !== 'agroquimicos') throw Object.assign(new Error('La tarea solo puede consumir productos agroquímicos'), { status: 400 });
    const movimiento = await registrarMovimiento({ producto_id: productoId, tipo: 'salida', cantidad, motivo: req.body.motivo || 'Consumo en orden de trabajo', tarea_id: tareaId }, db);
    await db.query('COMMIT');
    res.status(201).json(movimiento);
  } catch (error) {
    await db.query('ROLLBACK');
    next(error);
  } finally { db.release(); }
});

module.exports = router;
