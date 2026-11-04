// Verifica el flujo de confirmación con DOM mínimo, sin navegador ni escrituras reales.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
class Node {
  constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.dataset={};this.hidden=false;this.listeners={};this._value='';this.required=false;}
  append(...nodes){this.children.push(...nodes);}
  prepend(...nodes){this.children.unshift(...nodes);}
  add(option){this.children.push(option);}
  replaceChildren(...nodes){this.children=nodes;this._value='';}
  get value(){return this._value || (this.tag==='select'?this.children[0]?.value:'') || '';}
  set value(v){this._value=String(v);}
  get selectedOptions(){return this.children.filter(n=>n.value===this.value);}
  setAttribute(k,v){this[k]=v;}
  addEventListener(k,fn){this.listeners[k]=fn;}
  get parentElement(){return this.parent;}
  showModal(){this.open=true;}
  close(){this.open=false;this.listeners.close?.();}
  remove(){}
}
const append=Node.prototype.append;
Node.prototype.append=function(...nodes){nodes.forEach(n=>{if(n&&typeof n==='object')n.parent=this;});append.apply(this,nodes);};
class Option extends Node {constructor(text,value){super('option',text);this.value=value;this.text=text;}}
const contenido=new Node('div'),mensaje=new Node('p'),body=new Node('body');
const actual={id:2,tipo:'cantero',codigo:'C01',ruta:'/invernaderos/I01/canteros/C01/'};
const filas=[{id:3,tipo:'fila',padre_id:2,codigo:'F01',ruta:actual.ruta+'filas/F01/',configuracion:'A',capacidad:10,ocupado:5},{id:4,tipo:'fila',padre_id:2,codigo:'F02',ruta:actual.ruta+'filas/F02/',configuracion:'A',capacidad:10,ocupado:0}];
const datos={filas,existencias:[{fila_id:3,lote_id:1,variedad:'Lavanda',lote:'L1',configuracion:'A',cantidad:5}],bajas:0,alturas:[],movimientos:[]};
const storage=new Map(),writes=[];let recargas=0;
const context={console,Date,Map,Number,JSON,URL,URLSearchParams,setTimeout,Option,crypto:{randomUUID},window:{},navigator:{},
  document:{body,createElement:tag=>new Node(tag)},
  location:{search:'',reload:()=>recargas++},
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  $:id=>id==='contenido'?contenido:mensaje,
  el:(tag,text='',clase)=>{const n=new Node(tag,text);n.className=clase;return n;},
  codigo:u=>u.ruta.split('/').filter(p=>/^[ICF]\d+$/.test(p)).join('-'),
  api:async(path,options)=>{if(options){writes.push({path,...options});return {ok:true};}return datos;}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../public/mapa-cantero.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../public/plantas-ficha.js'),'utf8'),context);
function all(node,tag){return [...(node.tag===tag?[node]:[]),...node.children.flatMap(n=>typeof n==='object'?all(n,tag):[])];}
(async()=>{
  assert.equal(vm.runInContext('VARIEDADES_OLIVO.length',context),12);
  for(const nombre of ['AQ','arbequina','ARBEQUINA (AQ)']) assert.equal(context.buscarVariedadOlivo(nombre).codigo,'AQ');
  assert.equal(context.buscarVariedadOlivo('I-18').color,context.buscarVariedadOlivo('AQ').color);
  assert.equal(context.buscarVariedadOlivo('ARA').color,'#218442');
  assert.equal(context.buscarVariedadOlivo('otra variedad'),undefined);
  await context.montarFicha(actual,[actual,...filas]);
  const mapa=all(contenido,'section').find(n=>n.className==='mapa-cantero');assert.ok(mapa);
  assert.equal(all(mapa,'span').filter(n=>n.className==='cantero-maceta ocupada').length,5);
  assert.equal(all(mapa,'span').filter(n=>n.className==='cantero-maceta disponible').length,15);
  const barras=all(mapa,'div').filter(n=>n.className==='mapa-barra');assert.equal(barras.length,2);
  assert.match(barras[0]['aria-label'],/5 macetas ocupadas/);
  assert.match(barras[0].children[0].style,/width:50%/);
  const pendiente=context.dibujarMapaCantero([{id:9,codigo:'F09',capacidad:null,ocupado:0}],[]);
  assert.ok(all(pendiente,'div').some(n=>n.className==='mapa-barra mapa-sin-relevar'));
  const cero=context.dibujarMapaCantero([{id:9,codigo:'F09',capacidad:0,ocupado:0}],[]);
  assert.ok(!JSON.stringify(cero,(k,v)=>k==='parent'?undefined:v).includes('NaN'));
  const forms=all(contenido,'form');assert.equal(forms.length,3);
  const movimiento=forms[1],selects=all(movimiento,'select');
  const [tipo,fila,lote,destino]=selects;
  assert.equal(tipo.value,'ingreso');assert.equal(lote.parentElement.hidden,true);
  tipo.value='traslado';tipo.onchange();assert.equal(lote.parentElement.hidden,false);assert.equal(destino.parentElement.hidden,false);
  lote.value='1';destino.value='4';
  const inputs=all(movimiento,'input');inputs.find(i=>i.type==='number').value='2';
  movimiento.onsubmit({preventDefault(){}});
  assert.equal(writes.length,0,'Revisar no debe escribir stock');
  const dialog=body.children.at(-1);assert.equal(dialog.open,true);
  const confirm=all(dialog,'button').find(b=>b.textContent==='Confirmar y guardar');await confirm.onclick();
  assert.equal(writes.length,1);const payload=JSON.parse(writes[0].body);
  assert.equal(payload.tipo,'traslado');assert.equal(payload.origen_id,3);assert.equal(payload.destino_id,4);assert.equal(payload.cantidad,2);assert.equal(recargas,1);
  console.log('OK ficha: montaje, campos por operación, traslado preseleccionado y ninguna escritura antes de confirmar.');
})().catch(err=>{console.error(err);process.exitCode=1;});
