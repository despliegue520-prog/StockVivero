const pool = require('../db');
function error(message, status = 400) { return Object.assign(new Error(message), { status }); }
function entero(value, nombre, cero = false) {
  if (!Number.isSafeInteger(value) || value < (cero ? 0 : 1) || value > 2147483647) throw error(`${nombre}: indicá un entero ${cero ? 'no negativo' : 'positivo'}`);
  return value;
}
function texto(value, nombre) {
  if (typeof value !== 'string' || !value.trim() || value.length > 150) throw error(`${nombre}: texto obligatorio de hasta 150 caracteres`);
  return value.trim();
}
async function transaccion(fn, dbPool = pool) {
  const db = await dbPool.connect();
  try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
  catch (err) { await db.query('ROLLBACK'); throw err; } finally { db.release(); }
}
async function saldo(db, fila, lote = null) {
  return Number((await db.query('SELECT COALESCE(SUM(cantidad),0) AS cantidad FROM stock.planta_saldos WHERE fila_id=$1 AND ($2::int IS NULL OR lote_id=$2)', [fila,lote])).rows[0].cantidad);
}
async function registrar(input, dbPool = pool) {
  const { operacion, tipo } = input;
  if (typeof operacion !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operacion)) throw error('Identificador de operación inválido');
  if (!['ingreso','salida','baja','traslado'].includes(tipo)) throw error('Tipo inválido');
  const cantidad = entero(input.cantidad,'Cantidad');
  const origen = tipo === 'ingreso' ? null : entero(input.origen_id,'Fila de origen');
  const destino = ['ingreso','traslado'].includes(tipo) ? entero(input.destino_id,'Fila de destino') : null;
  if (origen && origen === destino) throw error('El destino debe ser diferente del origen');
  if (typeof input.fecha !== 'string' || !Number.isFinite(Date.parse(input.fecha))) throw error('Fecha inválida');
  const motivo = input.motivo === undefined ? '' : input.motivo;
  if (typeof motivo !== 'string' || motivo.length > 1000 || (tipo === 'baja' && !motivo.trim())) throw error('La baja requiere motivo (hasta 1000 caracteres)');
  const origenDetalle = input.origen_detalle === undefined ? '' : input.origen_detalle;
  const destinoDetalle = input.destino_detalle === undefined ? '' : input.destino_detalle;
  if (typeof origenDetalle !== 'string' || origenDetalle.length > 150 || typeof destinoDetalle !== 'string' || destinoDetalle.length > 150) throw error('El origen y destino deben tener hasta 150 caracteres');
  const solicitud = { tipo,cantidad,origen_id:origen,destino_id:destino,origen_detalle:origenDetalle.trim(),destino_detalle:destinoDetalle.trim(),fecha:new Date(input.fecha).toISOString(),motivo:motivo.trim() };
  if (tipo === 'ingreso') {
    solicitud.variedad = texto(input.variedad,'Planta o variedad');
    solicitud.configuracion = texto(input.configuracion,'Configuración de maceta');
    solicitud.lote = input.lote ? texto(input.lote,'Lote') : '';
  } else solicitud.lote_id = entero(input.lote_id,'Lote');
  return transaccion(async db => {
    // Serializa los reintentos de una misma operación antes de consultar el historial.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [operacion]);
    const previa = (await db.query('SELECT * FROM stock.planta_movimientos WHERE operacion=$1', [operacion])).rows[0];
    if (previa) {
      const igual = (await db.query('SELECT $1::jsonb=$2::jsonb AS igual',[previa.solicitud,solicitud])).rows[0].igual;
      if (!igual) throw error('Este identificador ya se usó para otra operación',409);
      return previa;
    }
    const ids = [origen,destino].filter(Boolean).sort((a,b)=>a-b);
    const filas = (await db.query('SELECT * FROM stock.ubicaciones WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE', [ids])).rows;
    if (filas.length !== ids.length || filas.some(f=>f.tipo!=='fila')) throw error('Fila no encontrada',404);
    let lote;
    if (tipo === 'ingreso') lote = (await db.query(`INSERT INTO stock.planta_lotes(variedad,lote,configuracion) VALUES($1,$2,$3)
      ON CONFLICT(variedad,lote,configuracion) DO UPDATE SET variedad=EXCLUDED.variedad RETURNING *`,[solicitud.variedad,solicitud.lote,solicitud.configuracion])).rows[0];
    else lote = (await db.query('SELECT * FROM stock.planta_lotes WHERE id=$1',[solicitud.lote_id])).rows[0];
    if (!lote) throw error('Lote no encontrado',404);
    if (origen && await saldo(db,origen,lote.id) < cantidad) throw error('Existencias insuficientes en la fila de origen',409);
    if (destino) {
      const fila = filas.find(f=>f.id===destino);
      if (fila.capacidad === null || !fila.configuracion) throw error('Completá la capacidad y configuración del destino antes de ingresar macetas',409);
      if (fila.configuracion !== lote.configuracion) throw error('La configuración de maceta no coincide con la del destino',409);
      if (await saldo(db,destino) + cantidad > fila.capacidad) throw error('La operación supera la capacidad disponible del destino',409);
    }
    return (await db.query(`INSERT INTO stock.planta_movimientos(operacion,solicitud,tipo,lote_id,cantidad,origen_id,destino_id,origen_detalle,destino_detalle,fecha,motivo)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[operacion,solicitud,tipo,lote.id,cantidad,origen,destino,solicitud.origen_detalle,solicitud.destino_detalle,solicitud.fecha,solicitud.motivo])).rows[0];
  },dbPool);
}
async function capacidades(cantero, input, dbPool = pool) {
  entero(cantero,'Cantero');
  if (!Array.isArray(input.filas) || !input.filas.length || input.filas.length > 999) throw error('Indicá entre 1 y 999 filas');
  const numeros = new Set();
  const filas = input.filas.map(f=>{
    const numero = entero(f.numero,'Número de fila');
    if (numero>999 || numeros.has(numero)) throw error('Números de fila repetidos o fuera de rango'); numeros.add(numero);
    const plantas_por_fila=entero(f.plantas_por_fila ?? ((f.portamacetas ?? f.capacidad) * (f.plantas_por_portamaceta ?? 1)),'Plantas por fila',true);
    const portamacetas=plantas_por_fila;
    const plantas_por_portamaceta=1;
    const capacidad=plantas_por_fila;
    if(!Number.isSafeInteger(capacidad)||capacidad>2147483647)throw error('La capacidad total supera el límite permitido');
    return {numero,capacidad,portamacetas,plantas_por_portamaceta,configuracion:texto(f.configuracion,'Configuración de portamaceta')};
  });
  return transaccion(async db=>{
    const padre=(await db.query("SELECT * FROM stock.ubicaciones WHERE id=$1 AND tipo='cantero' FOR UPDATE",[cantero])).rows[0];
    if(!padre)throw error('Cantero no encontrado',404);
    // Mismo orden de bloqueo que en los movimientos; no elimina filas existentes.
    const existentes=(await db.query("SELECT * FROM stock.ubicaciones WHERE padre_id=$1 ORDER BY id FOR UPDATE",[cantero])).rows;
    for(const f of filas){
      const codigo='F'+String(f.numero).padStart(2,'0');
      const previa=existentes.find(e=>e.codigo===codigo);
      if(previa){
        const ocupado=await saldo(db,previa.id);
        if(f.capacidad<ocupado)throw error(`${codigo}: capacidad menor que la ocupación actual (${ocupado})`,409);
        if(ocupado>0 && previa.configuracion!==f.configuracion)throw error(`${codigo}: vaciá la fila antes de cambiar su configuración`,409);
        await db.query('UPDATE stock.ubicaciones SET capacidad=$1,portamacetas=$2,plantas_por_portamaceta=$3,configuracion=$4,relevado_en=now() WHERE id=$5',[f.capacidad,f.portamacetas,f.plantas_por_portamaceta,f.configuracion,previa.id]);
      }else await db.query(`INSERT INTO stock.ubicaciones(padre_id,tipo,codigo,nombre,ruta,capacidad,portamacetas,plantas_por_portamaceta,configuracion,relevado_en)
        VALUES($1,'fila',$2,$3,$4,$5,$6,$7,$8,now())`,[cantero,codigo,'Fila '+f.numero,padre.ruta+'filas/'+codigo+'/',f.capacidad,f.portamacetas,f.plantas_por_portamaceta,f.configuracion]);
    }
    return {ok:true};
  },dbPool);
}
module.exports={registrar,capacidades,transaccion,entero,texto,error,saldo};
