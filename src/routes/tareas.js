const express = require('express');
const router = express.Router();
const pool = require('../db');

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

module.exports = router;