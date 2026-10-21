const express = require('express');
const pool = require('../db');

const router = express.Router();

// Lista todos los productos con su stock actual
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM stock.stock_actual ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Resumen de stock agrupado por unidad.
// Esta ruta debe declararse antes de '/:id' para que "totales" no se interprete como un ID.
router.get('/totales', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         'General'::text AS categoria,
         '-'::text AS subcategoria,
         '-'::text AS marca,
         unidad,
         COALESCE(SUM(stock), 0) AS total_stock
       FROM stock.stock_actual
       WHERE activo = TRUE
       GROUP BY unidad
       ORDER BY unidad`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Productos por debajo del stock mínimo
router.get('/alertas/bajo-stock', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM stock.stock_actual
       WHERE activo AND stock <= stock_minimo
       ORDER BY nombre`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'El id debe ser un entero positivo' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM stock.stock_actual WHERE id = $1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { codigo, nombre, unidad = 'unidad', stock_minimo = 0 } = req.body;
    if (!codigo || !nombre) {
      return res.status(400).json({ error: 'codigo y nombre son obligatorios' });
    }
    const { rows } = await pool.query(
      `INSERT INTO stock.productos (codigo, nombre, unidad, stock_minimo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [codigo, nombre, unidad, stock_minimo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese código' });
    }
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { nombre, unidad, stock_minimo, activo } = req.body;
    const { rows } = await pool.query(
      `UPDATE stock.productos SET
         nombre       = COALESCE($1, nombre),
         unidad       = COALESCE($2, unidad),
         stock_minimo = COALESCE($3, stock_minimo),
         activo       = COALESCE($4, activo)
       WHERE id = $5
       RETURNING *`,
      [nombre, unidad, stock_minimo, activo, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
