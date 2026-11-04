const express = require('express');
const pool = require('../db');
const categorias = require('../categorias');

const router = express.Router();

router.use((req, res, next) => {
  const categoria = req.method === 'GET'
    ? req.query.categoria
    : req.body.categoria;

  if (
    categoria !== undefined &&
    !categorias.some(c => c.slug === categoria)
  ) {
    return res.status(400).json({
      error: 'Categoría inválida',
    });
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    for (const campo of ['codigo', 'nombre', 'unidad']) {
      const valor = req.body[campo];

      if (
        valor !== undefined &&
        (typeof valor !== 'string' || !valor.trim())
      ) {
        return res.status(400).json({
          error: `${campo} debe ser un texto no vacío`,
        });
      }

      if (typeof valor === 'string') {
        req.body[campo] = valor.trim();
      }
    }

    const minimo = req.body.stock_minimo;

    if (
      minimo !== undefined &&
      (
        minimo === null ||
        minimo === '' ||
        !Number.isFinite(Number(minimo)) ||
        Number(minimo) < 0
      )
    ) {
      return res.status(400).json({
        error: 'El stock mínimo debe ser un número mayor o igual a cero',
      });
    }
  }

  if (req.body && req.body.datos !== undefined &&
      (!req.body.datos || Array.isArray(req.body.datos) || typeof req.body.datos !== 'object' ||
       Object.values(req.body.datos).some(v => typeof v !== 'string' || v.length > 1000))) {
    return res.status(400).json({ error: 'Datos del producto invalidos' });
  }
  next();
});

// Todos los productos o los de una categoría.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, p.datos
       FROM stock.stock_actual s JOIN stock.productos p USING (id)
       WHERE ($1::text IS NULL OR s.categoria = $1)
       ORDER BY s.nombre`,
      [req.query.categoria || null]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Productos con stock bajo.
router.get('/alertas/bajo-stock', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, p.datos
       FROM stock.stock_actual s JOIN stock.productos p USING (id)
       WHERE s.activo
         AND s.stock <= s.stock_minimo
         AND ($1::text IS NULL OR categoria = $1)
       ORDER BY nombre`,
      [req.query.categoria || null]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Consultar un producto.
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT s.*, p.datos FROM stock.stock_actual s JOIN stock.productos p USING (id) WHERE s.id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Producto no encontrado',
      });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Crear un producto.
router.post('/', async (req, res, next) => {
  try {
    const {
      codigo,
      nombre,
      unidad = 'unidad',
      stock_minimo = 0,
      categoria = 'general',
      datos = {},
    } = req.body;

    if (!codigo || !nombre) {
      return res.status(400).json({
        error: 'codigo y nombre son obligatorios',
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO stock.productos (
         codigo,
         nombre,
         unidad,
         stock_minimo,
         categoria,
         datos
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [codigo, nombre, unidad, stock_minimo, categoria, JSON.stringify(datos)]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Ya existe un producto con ese código',
      });
    }

    next(err);
  }
});

// Editar o reclasificar un producto.
router.put('/:id', async (req, res, next) => {
  try {
    const {
      nombre,
      unidad,
      stock_minimo,
      activo,
      categoria,
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE stock.productos SET
         nombre       = COALESCE($1, nombre),
         unidad       = COALESCE($2, unidad),
         stock_minimo = COALESCE($3, stock_minimo),
         activo       = COALESCE($4, activo),
         categoria    = COALESCE($5, categoria),
         datos        = COALESCE($7::jsonb, datos)
       WHERE id = $6
       RETURNING *`,
      [
        nombre,
        unidad,
        stock_minimo,
        activo,
        categoria,
        req.params.id,
        req.body.datos === undefined ? null : JSON.stringify(req.body.datos),
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Producto no encontrado',
      });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
