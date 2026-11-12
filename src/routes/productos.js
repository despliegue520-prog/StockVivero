const express = require('express');
const pool = require('../db');
const categorias = require('../categorias');
const areas = require('../areas');

const router = express.Router();

router.use((req, res, next) => {
  const categoria = req.method === 'GET'
    ? req.query.categoria
    : req.body?.categoria;
  const area = req.method === 'GET' ? req.query.area : req.body?.area;

  if (
    categoria !== undefined &&
    !categorias.some(c => c.slug === categoria)
  ) {
    return res.status(400).json({
      error: 'Categoría inválida',
    });
  }
  if (area !== undefined && !areas.some(a => a.slug === area)) {
    return res.status(400).json({ error: 'Área inválida' });
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
       WHERE s.activo AND ($1::text IS NULL OR s.categoria = $1)
         AND ($2::text IS NULL OR s.area = $2)
       ORDER BY s.nombre`,
      [req.query.categoria || null, req.query.area || null]
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
         AND s.stock_minimo > 0
         AND s.stock <= s.stock_minimo
         AND ($1::text IS NULL OR categoria = $1)
         AND ($2::text IS NULL OR area = $2)
       ORDER BY nombre`,
      [req.query.categoria || null, req.query.area || null]
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
      area = 'general',
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
         area,
         datos
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [codigo, nombre, unidad, stock_minimo, categoria, area, JSON.stringify(datos)]
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
      codigo,
      nombre,
      unidad,
      stock_minimo,
      activo,
      categoria,
      area,
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE stock.productos SET
         codigo       = COALESCE($1, codigo),
         nombre       = COALESCE($2, nombre),
         unidad       = COALESCE($3, unidad),
         stock_minimo = COALESCE($4, stock_minimo),
         activo       = COALESCE($5, activo),
         categoria    = COALESCE($6, categoria),
         area         = COALESCE($7, area),
         datos        = COALESCE($9::jsonb, datos)
       WHERE id = $8
       RETURNING *`,
      [
        codigo,
        nombre,
        unidad,
        stock_minimo,
        activo,
        categoria,
        area,
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

router.delete('/:id', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id)) || Number(req.params.id) < 1 || Number(req.params.id) > 2147483647) {
      return res.status(400).json({ error: 'Identificador de producto inválido' });
    }
    const { rows } = await pool.query(
      `UPDATE stock.productos SET activo=false WHERE id=$1 RETURNING id,codigo,nombre,activo`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ message: 'Producto desactivado del catálogo', producto: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
