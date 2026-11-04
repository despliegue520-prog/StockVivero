const express = require('express');
const pool = require('../db');
const categorias = require('../categorias');
const { registrarMovimiento } = require('../services/stock');

const router = express.Router();

// Historial con filtros opcionales.
router.get('/', async (req, res, next) => {
  try {
    const {
      producto_id,
      tarea_id,
      categoria,
    } = req.query;

    if (
      categoria !== undefined &&
      !categorias.some(c => c.slug === categoria)
    ) {
      return res.status(400).json({
        error: 'Categoría inválida',
      });
    }

    const { rows } = await pool.query(
      `SELECT m.*, p.codigo, p.nombre
       FROM stock.movimientos m
       JOIN stock.productos p
         ON p.id = m.producto_id
       WHERE ($1::int IS NULL OR m.producto_id = $1)
         AND ($2::int IS NULL OR m.tarea_id = $2)
         AND ($3::text IS NULL OR p.categoria = $3)
       ORDER BY m.creado_en DESC, m.id DESC
       LIMIT 500`,
      [
        producto_id || null,
        tarea_id || null,
        categoria || null,
      ]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Registrar entrada, salida o ajuste.
router.post('/', async (req, res, next) => {
  try {
    const movimiento = await registrarMovimiento(req.body);
    res.status(201).json(movimiento);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
