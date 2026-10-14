CREATE SCHEMA IF NOT EXISTS stock;

CREATE TABLE IF NOT EXISTS stock.productos (
  id           SERIAL PRIMARY KEY,
  codigo       VARCHAR(50)  NOT NULL UNIQUE,
  nombre       VARCHAR(150) NOT NULL,
  unidad       VARCHAR(20)  NOT NULL DEFAULT 'unidad',
  stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
  activo       BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- cantidad con signo: entrada (+), salida (-), ajuste (+ o -)
CREATE TABLE IF NOT EXISTS stock.movimientos (
  id          SERIAL PRIMARY KEY,
  producto_id INT          NOT NULL REFERENCES stock.productos(id),
  tipo        VARCHAR(10)  NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad    NUMERIC(12,3) NOT NULL CHECK (cantidad <> 0),
  motivo      TEXT,
  tarea_id    INT,
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mov_producto ON stock.movimientos (producto_id);
CREATE INDEX IF NOT EXISTS idx_mov_tarea    ON stock.movimientos (tarea_id);

CREATE OR REPLACE VIEW stock.stock_actual AS
SELECT
  p.id,
  p.codigo,
  p.nombre,
  p.unidad,
  p.stock_minimo,
  p.activo,
  COALESCE(SUM(m.cantidad), 0) AS stock
FROM stock.productos p
LEFT JOIN stock.movimientos m ON m.producto_id = p.id
GROUP BY p.id;
