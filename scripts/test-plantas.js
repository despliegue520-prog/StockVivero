// Integración PostgreSQL: esquema aislado, todo se revierte al finalizar.
require('dotenv').config();
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const pool=require('../src/db');
const servicio=require('../src/services/plantas');
async function main(){
  const db=await pool.connect();
  const schema='test_plantas_'+randomUUID().replaceAll('-','');
  try{
    await db.query('BEGIN');
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`CREATE TABLE ${schema}.ubicaciones(id SERIAL PRIMARY KEY,padre_id INT REFERENCES ${schema}.ubicaciones(id),tipo TEXT,codigo TEXT,nombre TEXT,ruta TEXT UNIQUE,UNIQUE(padre_id,codigo))`);
    const reemplazar=sql=>sql.replaceAll('stock.',schema+'.');
    await db.query(reemplazar(fs.readFileSync(path.join(__dirname,'../sql/plantas.sql'),'utf8')));
    const proxy={connect:async()=>({
      query:async(sql,values)=>{
        if(sql==='BEGIN')return db.query('SAVEPOINT operacion_test');
        if(sql==='COMMIT')return db.query('RELEASE SAVEPOINT operacion_test');
        if(sql==='ROLLBACK')return db.query('ROLLBACK TO SAVEPOINT operacion_test');
        return db.query(reemplazar(sql),values);
      },release(){}
    })};
    const q=(sql,v)=>db.query(reemplazar(sql),v);
    const i=(await q("INSERT INTO stock.ubicaciones(tipo,codigo,nombre,ruta) VALUES('invernadero','I01','Uno','/invernaderos/I01/') RETURNING id")).rows[0].id;
    const c=(await q("INSERT INTO stock.ubicaciones(padre_id,tipo,codigo,nombre,ruta) VALUES($1,'cantero','C01','Uno','/invernaderos/I01/canteros/C01/') RETURNING id",[i])).rows[0].id;
    await servicio.capacidades(c,{filas:[{numero:1,capacidad:10,configuracion:'A'},{numero:2,capacidad:5,configuracion:'A'},{numero:3,capacidad:10,configuracion:'B'}]},proxy);
    const f=(await q("SELECT * FROM stock.ubicaciones WHERE tipo='fila' ORDER BY codigo")).rows;
    const fecha=new Date().toISOString();
    const entrada={operacion:randomUUID(),tipo:'ingreso',destino_id:f[0].id,variedad:'Lavanda',lote:'L1',configuracion:'A',cantidad:8,fecha};
    const registrado=await servicio.registrar(entrada,proxy);
    const reintento=await servicio.registrar(entrada,proxy);assert.equal(reintento.id,registrado.id);
    await assert.rejects(()=>servicio.registrar({...entrada,cantidad:7},proxy),/identificador/);
    await assert.rejects(()=>servicio.registrar({...entrada,operacion:randomUUID(),cantidad:3},proxy),/capacidad disponible/);
    const mover=(tipo,cantidad,extra={})=>servicio.registrar({operacion:randomUUID(),tipo,origen_id:f[0].id,lote_id:registrado.lote_id,cantidad,fecha,...extra},proxy);
    await assert.rejects(()=>mover('salida',9),/insuficientes/);
    await assert.rejects(()=>mover('baja',1),/requiere motivo/);
    await assert.rejects(()=>mover('traslado',6,{destino_id:f[1].id}),/capacidad disponible/);
    await assert.rejects(()=>mover('traslado',1,{destino_id:f[2].id}),/configuración/);
    await mover('traslado',3,{destino_id:f[1].id});
    await mover('baja',2,{motivo:'Daño'});
    const saldos=(await q('SELECT fila_id,cantidad FROM stock.planta_saldos ORDER BY fila_id')).rows;
    assert.equal(Number(saldos[0].cantidad),3);assert.equal(Number(saldos[1].cantidad),3);
    const bajas=(await q("SELECT SUM(cantidad) AS cantidad FROM stock.planta_movimientos WHERE tipo='baja'")).rows[0];assert.equal(Number(bajas.cantidad),2);
    await assert.rejects(()=>servicio.capacidades(c,{filas:[{numero:1,capacidad:2,configuracion:'A'}]},proxy),/menor que la ocupación/);
    await assert.rejects(()=>servicio.capacidades(c,{filas:[{numero:1,capacidad:10,configuracion:'B'}]},proxy),/vaciá/);
    await q('UPDATE stock.ubicaciones SET capacidad=NULL WHERE id=$1',[f[1].id]);
    await assert.rejects(()=>mover('traslado',1,{destino_id:f[1].id}),/Completá la capacidad/);
    const final=(await q('SELECT cantidad FROM stock.planta_saldos WHERE fila_id=$1',[f[0].id])).rows[0];assert.equal(Number(final.cantidad),3);
    assert.equal(Number((await q('SELECT COUNT(*) AS n FROM stock.planta_movimientos')).rows[0].n),3);
    console.log('OK PostgreSQL: ingresos, traslado atómico, bajas, idempotencia, capacidad, configuración, saldos y rollback ante errores.');
  }finally{await db.query('ROLLBACK');db.release();await pool.end();}
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
