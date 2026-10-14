const express = require('express');
const pool = require('../db');
const { registrarMovimiento } = require('../services/stock');

const router = express.Router();

// Historial. Filtros opcionales: ?producto_id=1&tarea_id=5
router.get('/', async (req, res, next) => {
  try {
    const { producto_id, tarea_id } = req.query;
    const { rows } = await pool.query(
      `SELECT m.*, p.codigo, p.nombre
       FROM stock.movimientos m
       JOIN stock.productos p ON p.id = m.producto_id
       WHERE ($1::int IS NULL OR m.producto_id = $1)
         AND ($2::int IS NULL OR m.tarea_id = $2)
       ORDER BY m.creado_en DESC, m.id DESC
       LIMIT 500`,
      [producto_id || null, tarea_id || null]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Registra un movimiento
router.post('/', async (req, res, next) => {
  try {
    const mov = await registrarMovimiento(req.body);
    res.status(201).json(mov);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
