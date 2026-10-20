const express = require('express');
const pool = require('../db');
const { registrarMovimiento } = require('../services/stock');

const router = express.Router();

function idOpcionalValido(valor) {
  if (valor === undefined || valor === null || valor === '') return true;
  return /^\\d+$/.test(String(valor)) && Number.isSafeInteger(Number(valor)) && Number(valor) > 0;
}

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

// Historial. Filtros opcionales: ?producto_id=1&tarea_id=5
router.get('/', async (req, res, next) => {
  const { producto_id, tarea_id } = req.query;

  if (!idOpcionalValido(producto_id)) {
    return res.status(400).json({ error: 'producto_id debe ser un entero positivo' });
  }
  if (!idOpcionalValido(tarea_id)) {
    return res.status(400).json({ error: 'tarea_id debe ser un entero positivo' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT m.*, p.codigo, p.nombre
       FROM stock.movimientos m
       JOIN stock.productos p ON p.id = m.producto_id
       WHERE ($1::int IS NULL OR m.producto_id = $1)
         AND ($2::int IS NULL OR m.tarea_id = $2)
       ORDER BY m.creado_en DESC, m.id DESC
       LIMIT 500`,
      [
        producto_id ? Number(producto_id) : null,
        tarea_id ? Number(tarea_id) : null
      ]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Registra un movimiento
router.post('/', async (req, res, next) => {
  if (!esObjeto(req.body)) {
    return res.status(400).json({ error: 'El cuerpo de la solicitud debe ser un objeto JSON' });
  }

  try {
    const mov = await registrarMovimiento(req.body);
    res.status(201).json(mov);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
