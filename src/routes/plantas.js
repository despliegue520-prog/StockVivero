const router=require('express').Router();
const pool=require('../db');
const servicio=require('../services/plantas');
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.post('/movimientos',async(req,res,next)=>{try{res.status(201).json(await servicio.registrar(req.body));}catch(err){next(err);}});
router.put('/canteros/:id/capacidades',async(req,res,next)=>{try{res.json(await servicio.capacidades(Number(req.params.id),req.body));}catch(err){next(err);}});
router.put('/tutorados',async(req,res,next)=>{
  try{
    const fila=servicio.entero(req.body.fila_id,'Fila'),lote=servicio.entero(req.body.lote_id,'Lote'),cantidad=servicio.entero(req.body.cantidad,'Cantidad tutorada',true);
    res.json(await servicio.transaccion(async db=>{
      await db.query('SELECT id FROM stock.ubicaciones WHERE id=$1 FOR UPDATE',[fila]);
      if(cantidad>await servicio.saldo(db,fila,lote))throw servicio.error('La cantidad tutorada no puede superar las existencias de la fila',409);
      return (await db.query(`INSERT INTO stock.planta_tutorados(fila_id,lote_id,cantidad,actualizado_en) VALUES($1,$2,$3,now())
        ON CONFLICT(fila_id,lote_id) DO UPDATE SET cantidad=EXCLUDED.cantidad,actualizado_en=now() RETURNING *`,[fila,lote,cantidad])).rows[0];
    }));
  }catch(err){next(err);}
});
router.get('/variedades',async(req,res,next)=>{
  try{
    const {rows}=await pool.query("SELECT DISTINCT variedad FROM stock.planta_lotes WHERE variedad IS NOT NULL AND btrim(variedad)<>'' ORDER BY variedad");
    res.json(rows.map(r=>r.variedad));
  }catch(err){next(err);}
});
router.get('/detalle/:id',async(req,res,next)=>{
  try{
    const id=servicio.entero(Number(req.params.id),'Ubicación');
    const ubicacion=(await pool.query('SELECT * FROM stock.ubicaciones WHERE id=$1',[id])).rows[0];
    if(!ubicacion)return res.status(404).json({error:'Ubicación no encontrada'});
    const filas=(await pool.query(`WITH RECURSIVE arbol AS (
      SELECT * FROM stock.ubicaciones WHERE id=$1 UNION ALL
      SELECT u.* FROM stock.ubicaciones u JOIN arbol a ON u.padre_id=a.id)
      SELECT a.*, COALESCE(s.ocupado,0)::int AS ocupado FROM arbol a
      LEFT JOIN (SELECT fila_id,SUM(cantidad) AS ocupado FROM stock.planta_saldos GROUP BY fila_id) s ON s.fila_id=a.id
      WHERE a.tipo='fila' ORDER BY a.ruta`,[id])).rows;
    const ids=filas.map(f=>f.id);
    const existencias=(await pool.query(`SELECT s.*,l.variedad,l.lote,l.configuracion,COALESCE(t.cantidad,0)::int AS tutoradas FROM stock.planta_saldos s
      JOIN stock.planta_lotes l ON l.id=s.lote_id LEFT JOIN stock.planta_tutorados t ON t.fila_id=s.fila_id AND t.lote_id=s.lote_id
      WHERE s.fila_id=ANY($1::int[]) AND s.cantidad>0 ORDER BY s.fila_id,l.variedad`,[ids])).rows;
    const movimientos=(await pool.query(`SELECT m.*,l.variedad,l.lote,l.configuracion,o.ruta AS origen,d.ruta AS destino FROM stock.planta_movimientos m
      JOIN stock.planta_lotes l ON l.id=m.lote_id LEFT JOIN stock.ubicaciones o ON o.id=m.origen_id LEFT JOIN stock.ubicaciones d ON d.id=m.destino_id
      WHERE origen_id=ANY($1::int[]) OR destino_id=ANY($1::int[]) ORDER BY creado_en DESC,id DESC LIMIT 100`,[ids])).rows;
    const bajas=(await pool.query("SELECT COALESCE(SUM(cantidad),0) AS cantidad FROM stock.planta_movimientos WHERE tipo='baja' AND origen_id=ANY($1::int[])",[ids])).rows[0].cantidad;
    const bajasDetalle=(await pool.query(`SELECT m.fecha,m.cantidad,m.motivo,l.variedad,l.lote,o.ruta AS origen
      FROM stock.planta_movimientos m JOIN stock.planta_lotes l ON l.id=m.lote_id
      LEFT JOIN stock.ubicaciones o ON o.id=m.origen_id
      WHERE m.tipo='baja' AND m.origen_id=ANY($1::int[])
      ORDER BY m.fecha DESC,m.id DESC LIMIT 100`,[ids])).rows;
    const alturas=(await pool.query('SELECT a.*,l.variedad,l.lote FROM stock.planta_alturas a JOIN stock.planta_lotes l ON l.id=a.lote_id WHERE fila_id=ANY($1::int[]) ORDER BY fecha DESC LIMIT 100',[ids])).rows;
    res.json({ubicacion,filas,existencias,movimientos,bajas,bajasDetalle,alturas});
  }catch(err){next(err);}
});
router.post('/alturas',async(req,res,next)=>{
  try{
    const fila=servicio.entero(req.body.fila_id,'Fila'),lote=servicio.entero(req.body.lote_id,'Lote');
    const {altura,unidad,fecha}=req.body;
    if(typeof altura!=='number'||!Number.isFinite(altura)||altura<=0||!['cm','m'].includes(unidad)||typeof fecha!=='string'||!Number.isFinite(Date.parse(fecha)))throw servicio.error('Indicá altura positiva, unidad cm o m y fecha válida');
    res.status(201).json(await servicio.transaccion(async db=>{
      await db.query('SELECT id FROM stock.ubicaciones WHERE id=$1 FOR UPDATE',[fila]);
      if(await servicio.saldo(db,fila,lote)<=0)throw servicio.error('El lote no tiene existencias en esta fila',409);
      return (await db.query('INSERT INTO stock.planta_alturas(fila_id,lote_id,altura,unidad,fecha) VALUES($1,$2,$3,$4,$5) RETURNING *',[fila,lote,altura,unidad,fecha])).rows[0];
    }));
  }catch(err){next(err);}
});
module.exports=router;
