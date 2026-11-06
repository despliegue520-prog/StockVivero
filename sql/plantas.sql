ALTER TABLE stock.ubicaciones ADD COLUMN IF NOT EXISTS capacidad INTEGER CHECK (capacidad >= 0);
ALTER TABLE stock.ubicaciones ADD COLUMN IF NOT EXISTS portamacetas INTEGER CHECK (portamacetas >= 0);
ALTER TABLE stock.ubicaciones ADD COLUMN IF NOT EXISTS plantas_por_portamaceta INTEGER CHECK (plantas_por_portamaceta > 0);
ALTER TABLE stock.ubicaciones ALTER COLUMN plantas_por_portamaceta SET DEFAULT 18;
ALTER TABLE stock.ubicaciones ADD COLUMN IF NOT EXISTS configuracion TEXT;
ALTER TABLE stock.ubicaciones ADD COLUMN IF NOT EXISTS relevado_en TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS stock.planta_lotes (
  id SERIAL PRIMARY KEY,
  variedad TEXT NOT NULL,
  lote TEXT NOT NULL DEFAULT '',
  configuracion TEXT NOT NULL,
  UNIQUE(variedad,lote,configuracion)
);
CREATE TABLE IF NOT EXISTS stock.planta_movimientos (
  id BIGSERIAL PRIMARY KEY,
  operacion UUID NOT NULL UNIQUE,
  solicitud JSONB NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('ingreso','salida','baja','traslado')),
  lote_id INT NOT NULL REFERENCES stock.planta_lotes(id),
  cantidad INTEGER NOT NULL CHECK(cantidad > 0),
  unidad TEXT NOT NULL DEFAULT 'maceta' CHECK(unidad='maceta'),
  origen_id INT REFERENCES stock.ubicaciones(id),
  destino_id INT REFERENCES stock.ubicaciones(id),
  fecha TIMESTAMPTZ NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (tipo='ingreso' AND origen_id IS NULL AND destino_id IS NOT NULL) OR
    (tipo IN ('salida','baja') AND origen_id IS NOT NULL AND destino_id IS NULL) OR
    (tipo='traslado' AND origen_id IS NOT NULL AND destino_id IS NOT NULL AND origen_id<>destino_id)
  ),
  CHECK(tipo<>'baja' OR length(trim(motivo))>0)
);
CREATE INDEX IF NOT EXISTS planta_mov_origen ON stock.planta_movimientos(origen_id,lote_id);
CREATE INDEX IF NOT EXISTS planta_mov_destino ON stock.planta_movimientos(destino_id,lote_id);
CREATE TABLE IF NOT EXISTS stock.planta_alturas (
  id BIGSERIAL PRIMARY KEY,
  fila_id INT NOT NULL REFERENCES stock.ubicaciones(id),
  lote_id INT NOT NULL REFERENCES stock.planta_lotes(id),
  altura NUMERIC NOT NULL CHECK(altura>0),
  unidad TEXT NOT NULL CHECK(unidad IN ('cm','m')),
  fecha TIMESTAMPTZ NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stock.planta_tutorados (
  fila_id INT NOT NULL REFERENCES stock.ubicaciones(id),
  lote_id INT NOT NULL REFERENCES stock.planta_lotes(id),
  cantidad INTEGER NOT NULL CHECK(cantidad >= 0),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fila_id, lote_id)
);
CREATE INDEX IF NOT EXISTS planta_tutorados_lote ON stock.planta_tutorados(lote_id);
CREATE OR REPLACE VIEW stock.planta_saldos AS
SELECT fila_id,lote_id,SUM(delta)::bigint AS cantidad FROM (
  SELECT destino_id AS fila_id,lote_id,cantidad AS delta FROM stock.planta_movimientos WHERE destino_id IS NOT NULL
  UNION ALL
  SELECT origen_id,lote_id,-cantidad FROM stock.planta_movimientos WHERE origen_id IS NOT NULL
) x GROUP BY fila_id,lote_id;
