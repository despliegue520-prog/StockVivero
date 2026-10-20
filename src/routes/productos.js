const express = require('express');
const pool = require('../db');

const router = express.Router();

const MAX_NUMERIC_12_3 = 999999999.999;

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function idValido(valor) {
  return Number.isInteger(Number(valor)) && Number(valor) > 0;
}

function textoValido(valor, maximo) {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= maximo;
}

function stockMinimoValido(valor) {
  if (valor === '' || valor === null || valor === undefined) return false;
  const numero = Number(valor);
  return Number.isFinite(numero)
    && numero >= 0
    && numero <= MAX_NUMERIC_12_3
    && Number(numero.toFixed(3)) === numero;
}

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
  if (!idValido(req.params.id)) {
    return res.status(400).json({ error: 'El id debe ser un entero positivo' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM stock.stock_actual WHERE id = $1',
      [Number(req.params.id)]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  if (!esObjeto(req.body)) {
    return res.status(400).json({ error: 'El cuerpo de la solicitud debe ser un objeto JSON' });
  }

  try {
    const { codigo, nombre, unidad = 'unidad', stock_minimo = 0 } = req.body;

    if (!textoValido(codigo, 50) || !textoValido(nombre, 150)) {
      return res.status(400).json({
        error: 'codigo (máximo 50 caracteres) y nombre (máximo 150) son obligatorios'
      });
    }
    if (!textoValido(unidad, 20)) {
      return res.status(400).json({ error: 'unidad debe contener entre 1 y 20 caracteres' });
    }
    if (!stockMinimoValido(stock_minimo)) {
      return res.status(400).json({
        error: 'stock_minimo debe ser un número entre 0 y 999999999.999 con hasta 3 decimales'
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO stock.productos (codigo, nombre, unidad, stock_minimo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [codigo.trim(), nombre.trim(), unidad.trim(), Number(stock_minimo)]
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
  if (!idValido(req.params.id)) {
    return res.status(400).json({ error: 'El id debe ser un entero positivo' });
  }
  if (!esObjeto(req.body) || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Indicá al menos un campo para actualizar' });
  }

  const { nombre, unidad, stock_minimo, activo } = req.body;

  if (nombre !== undefined && !textoValido(nombre, 150)) {
    return res.status(400).json({ error: 'nombre debe contener entre 1 y 150 caracteres' });
  }
  if (unidad !== undefined && !textoValido(unidad, 20)) {
    return res.status(400).json({ error: 'unidad debe contener entre 1 y 20 caracteres' });
  }
  if (stock_minimo !== undefined && !stockMinimoValido(stock_minimo)) {
    return res.status(400).json({
      error: 'stock_minimo debe ser un número entre 0 y 999999999.999 con hasta 3 decimales'
    });
  }
  if (activo !== undefined && typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'activo debe ser true o false' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE stock.productos SET
         nombre       = COALESCE($1, nombre),
         unidad       = COALESCE($2, unidad),
         stock_minimo = COALESCE($3, stock_minimo),
         activo       = COALESCE($4, activo)
       WHERE id = $5
       RETURNING *`,
      [
        nombre === undefined ? null : nombre.trim(),
        unidad === undefined ? null : unidad.trim(),
        stock_minimo === undefined ? null : Number(stock_minimo),
        activo === undefined ? null : activo,
        Number(req.params.id)
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
