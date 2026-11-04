BEGIN;

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

ALTER TABLE stock.productos
  ADD COLUMN IF NOT EXISTS categoria
  VARCHAR(40) NOT NULL DEFAULT 'general';

ALTER TABLE stock.productos ADD COLUMN IF NOT EXISTS datos JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_productos_categoria
  ON stock.productos (categoria);

-- Entrada: positiva.
-- Salida: negativa.
-- Ajuste: positivo o negativo.
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

-- Conservar columnas adicionales de instalaciones existentes.
DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'stock'
    AND table_name = 'stock_actual'
    AND column_name = 'categoria'
) THEN
EXECUTE $view$
CREATE OR REPLACE VIEW stock.stock_actual AS
SELECT
  p.id,
  p.codigo,
  p.nombre,
  p.unidad,
  p.stock_minimo,
  p.activo,
  COALESCE(SUM(m.cantidad), 0) AS stock,
  p.categoria
FROM stock.productos p
LEFT JOIN stock.movimientos m ON m.producto_id = p.id
GROUP BY p.id
$view$;
END IF;
END;
$$;

-- Identificadores de ubicacion permanentes: no se renombran ni eliminan.
CREATE TABLE IF NOT EXISTS stock.ubicaciones (
  id SERIAL PRIMARY KEY,
  padre_id INT REFERENCES stock.ubicaciones(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('invernadero','cantero','fila')),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  ruta TEXT NOT NULL UNIQUE,
  UNIQUE (padre_id, codigo)
);
INSERT INTO stock.ubicaciones (tipo,codigo,nombre,ruta)
SELECT 'invernadero', 'I' || lpad(n::text,2,'0'), 'Invernadero ' || n,
       '/invernaderos/I' || lpad(n::text,2,'0') || '/'
FROM generate_series(1,17) n ON CONFLICT (ruta) DO NOTHING;
COMMIT;
