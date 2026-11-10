// La ocupación se expresa en macetas. Equivalencia confirmada: 1 maceta = 1 planta.
async function montarFicha(actual, ubicaciones) {
  const datos = await api('/api/plantas/detalle/' + actual.id);
  const variedadesCargadas = actual.demostracion ? [...new Set(datos.existencias.map(e=>e.variedad))] : await api('/api/plantas/variedades');
  const contenedor = el('div'); $('contenido').append(contenedor);
  contenedor.className='ficha-plantas';
  const navegacion=el('nav','','ficha-pestanas');navegacion.setAttribute('aria-label','Vistas de la ubicación');contenedor.append(navegacion);
  const paneles=new Map();
  const panel=(nombre)=>{if(!paneles.has(nombre)){const n=el('div','','ficha-panel');n.hidden=nombre!=='Resumen';paneles.set(nombre,n);contenedor.append(n);}return paneles.get(nombre);};
  const nombreFila = id => {
    const fila=ubicaciones.find(u=>u.id===Number(id)); return fila ? codigo(fila) : String(id);
  };
  const grupos = new Map();
  datos.filas.forEach(f=>{
    const key=f.configuracion || 'Sin configuración';
    if(!grupos.has(key))grupos.set(key,{filas:0,pendientes:0,capacidad:0,ocupado:0,tutoradas:0,portamacetas:0,plantasPorPortamaceta:null});
    const g=grupos.get(key);g.filas++;g.ocupado+=f.ocupado;g.portamacetas+=Number(f.portamacetas)||0;g.plantasPorPortamaceta=g.plantasPorPortamaceta||f.plantas_por_portamaceta||null;
    if(f.capacidad===null)g.pendientes++;else g.capacidad+=f.capacidad;
    datos.existencias.filter(e=>e.fila_id===f.id).forEach(e=>{g.tutoradas+=Number(e.tutoradas)||0;});
  });
  const resumen=el('section');resumen.append(el('h2','Capacidad y ocupación'));
  resumen.append(el('p',datos.filas.length+' filas registradas.'));
  if(!grupos.size)resumen.append(el('span','Capacidad sin relevar','pendiente'));
  for(const [config,g] of grupos){
    resumen.append(el('h3',config));const cards=el('div','','resumen');
    for(const [titulo,valor] of [['Portamacetas',g.portamacetas||'Sin relevar'],['Plantas por portamaceta',g.plantasPorPortamaceta||'Sin relevar'],['Capacidad total',g.pendientes?'Sin relevar ('+g.capacidad+' relevadas)':g.capacidad],['Ocupación',g.ocupado],['Disponibles',g.pendientes?'Sin relevar':g.capacidad-g.ocupado]]){
      const card=el('div',titulo);card.append(el('strong',String(valor)));cards.append(card);
    }const primero=cards.firstElementChild;if(primero){primero.firstChild.textContent='Plantas por fila';primero.querySelector('strong').textContent=String(g.capacidad||'Sin relevar');}cards.children[1]?.remove();const tutoradas=el('div','Plantas tutoradas');tutoradas.append(el('strong',String(g.tutoradas)));cards.append(tutoradas);resumen.append(cards);
    if(g.pendientes)resumen.append(el('p',g.pendientes+' filas pendientes. El subtotal relevado no representa la capacidad total.'));
  }
  resumen.append(el('p','Bajas acumuladas: '+datos.bajas+' macetas. Ya están descontadas del stock actual.','nota-bajas'));panel('Resumen').append(resumen);

  const variedadesPorFila=el('div','','resumen-variedades');variedadesPorFila.append(el('h3','Variedad por fila'));
  datos.filas.forEach(f=>{const variedades=[...new Set(datos.existencias.filter(e=>e.fila_id===f.id).map(e=>e.variedad))];variedadesPorFila.append(el('p',codigo(f)+': '+(variedades.length?variedades.join(', '):'Sin plantas')));});
  resumen.append(variedadesPorFila);
  const grid=el('div','','grid');
  datos.filas.forEach(f=>{
    const estado=f.capacidad===null?'pendiente':f.ocupado===0?'vacia':f.ocupado===f.capacidad?'completa':'parcial';
    const card=el('article','','tarjeta estado '+estado);const a=el('a',codigo(f));a.href=f.ruta;card.append(a);
    card.append(el('p',f.configuracion||'Sin configuración'),el('p',f.capacidad===null?'Capacidad sin relevar':(f.portamacetas||0)+' portamacetas × '+(f.plantas_por_portamaceta||1)+' plantas = '+f.capacidad+' plantas · Ocupación: '+f.ocupado+' · Disponibles: '+(f.capacidad-f.ocupado)),el('strong',({pendiente:'Pendiente de relevamiento',vacia:'Vacía',completa:'Completa',parcial:'Parcialmente ocupada'})[estado]));
    datos.existencias.filter(e=>e.fila_id===f.id).forEach(e=>card.append(el('p',e.variedad+(e.lote?' · Lote '+e.lote:'')+': '+e.cantidad+' macetas')));
    datos.existencias.filter(e=>e.fila_id===f.id).forEach(e=>card.append(el('p','Plantas tutoradas: '+e.tutoradas+'/'+e.cantidad)));
    grid.append(card);
  });
  const detalleFilas=el('section');detalleFilas.append(el('h2','Detalle por fila'),el('p','Consultá la capacidad, las variedades y los lotes de cada ubicación.','muted'),grid);panel('Filas').append(detalleFilas);
  function campo(form,nombre,tipo='text',opciones=[]){
    const label=el('label',nombre),input=el(opciones.length?'select':'input');
    if(opciones.length)opciones.forEach(([v,t])=>input.add(new Option(t,v)));else input.type=tipo;
    label.append(input);form.append(label);return input;
  }
  function seccion(titulo){const s=el('section');s.append(el('h2',titulo));const vista=titulo.startsWith('Relevar')?'Capacidades':titulo.startsWith('Registrar movimiento')?'Movimientos':titulo.toLowerCase().includes('tutor')?'Tutorado':titulo.includes('altura')||titulo.includes('Alturas')?'Alturas':'Historial';panel(vista).append(s);return s;}
  function tabla(titulo,cabecera,filas){
    const s=seccion(titulo);if(!filas.length){s.append(el('p','Sin registros.'));return;}
    const wrap=el('div','','tabla'),table=el('table'),head=el('tr');cabecera.forEach(c=>head.append(el('th',c)));const thead=el('thead');thead.append(head);table.append(thead);
    const body=el('tbody');filas.forEach(f=>{const tr=el('tr');f.forEach(c=>tr.append(el('td',String(c??''))));body.append(tr);});table.append(body);wrap.append(table);s.append(wrap);
  }
  async function confirmar(resumen,guardar){
    const dialog=el('dialog');dialog.append(el('h2','Confirmar operación'),el('pre',resumen));
    const acciones=el('div','','barra'),cancelar=el('button','Volver a editar'),ok=el('button','Confirmar y guardar'),error=el('p');error.setAttribute('role','alert');
    acciones.append(cancelar,ok);dialog.append(error,acciones);document.body.append(dialog);
    cancelar.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    ok.onclick=async()=>{ok.disabled=true;cancelar.disabled=true;try{await guardar();dialog.close();location.reload();}catch(err){error.textContent=err.message;ok.disabled=false;cancelar.disabled=false;}};
    dialog.showModal();
  }
  if(actual.tipo==='cantero'){
    const section=seccion('Relevar capacidades');section.append(el('p','Esta carga crea o actualiza filas; no elimina las existentes. No cambia las existencias. Una configuración diferente requiere vaciar primero la fila.'));
    const form=el('form');section.append(form);
    const cantidad=campo(form,'Cantidad de filas','number');cantidad.min=1;cantidad.max=999;cantidad.value=datos.filas.length||'';cantidad.required=true;
    const modo=campo(form,'Capacidades','text',[['igual','Igual para todas'],['individual','Por fila']]);
    const config=campo(form,'Tipo de portamaceta (nombre o código)');config.required=true;config.maxLength=150;
    const comun=campo(form,'Plantas por fila','number');comun.min=0;comun.required=true;
    const plantas=campo(form,'Plantas por portamaceta','number');plantas.min=1;plantas.required=true;plantas.value=1;plantas.parentElement.hidden=true;
    const individuales=el('div','','ancho');form.append(individuales);
    const editar=()=>{
      individuales.replaceChildren();comun.parentElement.hidden=modo.value!=='igual';comun.required=modo.value==='igual';
      if(modo.value==='individual'){
        const n=Number(cantidad.value);if(!Number.isInteger(n)||n<1||n>999)return;
        for(let i=1;i<=n;i++){
          const previa=datos.filas.find(f=>f.codigo==='F'+String(i).padStart(2,'0'));
          const div=el('div','','fila-capacidad');div.append(el('span','Fila '+i));
          const c=campo(div,'Plantas por fila','number');c.min=0;c.required=true;c.dataset.numero=i;if(previa)c.value=previa.capacidad;
          const cfg=campo(div,'Configuración');cfg.required=true;cfg.maxLength=150;cfg.dataset.config=i;cfg.value=previa?.configuracion||config.value;
          individuales.append(div);
        }
      }
    };modo.onchange=editar;cantidad.onchange=editar;config.onchange=()=>{if(modo.value==='individual')editar();};editar();
    const guardar=el('button','Revisar capacidades');form.append(guardar);
    form.onsubmit=event=>{event.preventDefault();const n=Number(cantidad.value);if(!Number.isInteger(n)||n<1||n>999)return;
      const filas=Array.from({length:n},(_,i)=>({numero:i+1,portamacetas:Number(modo.value==='igual'?comun.value:individuales.querySelector('[data-numero="'+(i+1)+'"]').value),plantas_por_portamaceta:Number(plantas.value),configuracion:modo.value==='igual'?config.value.trim():individuales.querySelector('[data-config="'+(i+1)+'"]').value.trim()}));
      confirmar('Actualizar portamacetas de '+codigo(actual)+'\n'+filas.map(f=>'Fila '+f.numero+': '+f.portamacetas+' portamacetas · '+f.plantas_por_portamaceta+' plantas por portamaceta · total '+(f.portamacetas*f.plantas_por_portamaceta)+' plantas · '+f.configuracion).join('\n'),()=>api('/api/plantas/canteros/'+actual.id+'/capacidades',{method:'PUT',body:JSON.stringify({filas})}));
    };
  }
  if(['cantero','fila'].includes(actual.tipo)&&datos.filas.length){
    const tutoradoSection=seccion('Registrar tutorado'),tutoradoForm=el('form');tutoradoSection.append(tutoradoForm);
    tutoradoSection.append(el('p','Cargá cuántas plantas de cada variedad ya fueron tutoradas. La cantidad no puede superar las existencias actuales.','muted'));
    const tutoradoRegistro=campo(tutoradoForm,'Fila y variedad','text',datos.existencias.map(e=>[e.fila_id+':'+e.lote_id,nombreFila(e.fila_id)+' · '+e.variedad+' · '+(e.lote||'Sin lote')+' · '+e.cantidad+' macetas']));
    const tutoradoCantidad=campo(tutoradoForm,'Cantidad de plantas tutoradas','number');tutoradoCantidad.min=0;tutoradoCantidad.step=1;tutoradoCantidad.required=true;
    const actualizarTutorado=()=>{const e=datos.existencias.find(x=>x.fila_id+':'+x.lote_id===tutoradoRegistro.value);if(e){tutoradoCantidad.value=e.tutoradas;tutoradoCantidad.max=e.cantidad;}};
    tutoradoRegistro.onchange=actualizarTutorado;actualizarTutorado();
    const guardarTutorado=el('button','Revisar tutorado');tutoradoForm.append(guardarTutorado);
    tutoradoForm.onsubmit=event=>{event.preventDefault();const [fila_id,lote_id]=tutoradoRegistro.value.split(':').map(Number);const e=datos.existencias.find(x=>x.fila_id===fila_id&&x.lote_id===lote_id);confirmar(nombreFila(fila_id)+' · '+e.variedad+'\nCantidad tutorada: '+tutoradoCantidad.value+' de '+e.cantidad+' macetas',()=>api('/api/plantas/tutorados',{method:'PUT',body:JSON.stringify({fila_id,lote_id,cantidad:Number(tutoradoCantidad.value)})}));};
    const section=seccion('Registrar movimiento'),form=el('form');section.append(form);
    section.append(el('p','Cantidades enteras en macetas. Escanear el QR nunca confirma una operación.'));
    section.append(el('p','El borrador se conserva en este navegador hasta confirmarlo o descartarlo. No es un movimiento registrado ni se sincroniza automáticamente. Para consultar datos y confirmar hace falta Internet.','muted'));
    const tipo=campo(form,'Operación','text',[['ingreso','Ingreso'],['salida','Salida'],['baja','Baja'],['traslado','Traslado']]);
    const fila=campo(form,'Fila de esta ubicación','text',datos.filas.map(f=>[f.id,codigo(f)]));
    const variedad=campo(form,'Planta o variedad');variedad.maxLength=150;
    const opcionesVariedad=el('datalist');opcionesVariedad.id='variedades-olivo';
    const sugerencias=[...new Set([...variedadesCargadas,...VARIEDADES_OLIVO.map(v=>v.nombre)])];
    sugerencias.forEach(nombre=>{const opcion=el('option');opcion.value=nombre;opcionesVariedad.append(opcion);});
    variedad.setAttribute('list',opcionesVariedad.id);form.append(opcionesVariedad);
    variedad.addEventListener('change',()=>{const conocida=buscarVariedadOlivo(variedad.value);if(conocida)variedad.value=conocida.nombre;});
    const lote=campo(form,'Identificación del lote (opcional)');lote.maxLength=150;
    const configuracion=campo(form,'Configuración de maceta');configuracion.maxLength=150;
    const loteExistente=campo(form,'Lote disponible','text',[['','Seleccioná un lote']]);
    const cantidad=campo(form,'Cantidad de macetas','number');cantidad.min=1;cantidad.step=1;cantidad.required=true;
    const fecha=campo(form,'Fecha y hora','datetime-local');fecha.required=true;fecha.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    const razonesBaja=[['','Seleccioná una razón'],['Planta muerta','Planta muerta'],['Planta dañada','Planta dañada'],['Planta enferma','Planta enferma'],['Descartada por calidad','Descartada por calidad'],['Pérdida o faltante','Pérdida o faltante'],['Otra','Otra']];
    const razonBaja=campo(form,'Razón de baja','text',razonesBaja);
    const motivo=campo(form,'Detalle adicional');motivo.maxLength=1000;
    const destinosPlantas=[['','Seleccioná una ubicación'],...Array.from({length:16},(_,i)=>['Invernadero '+(i+1),'Invernadero '+(i+1)]),...['1A','1B','1C','2A','2B','2C','2D','2E','2F'].map(c=>['Rusticadero '+c,'Rusticadero '+c])];
    const origenDetalle=campo(form,'De dónde vienen','text',destinosPlantas);
    const destinoDetalle=campo(form,'A dónde las llevan','text',destinosPlantas);
    // También permite traslados entre filas del mismo cantero.
    const destino=campo(form,'Fila de destino','text',[['','Seleccioná el destino'],...ubicaciones.filter(u=>u.tipo==='fila').map(f=>[f.id,codigo(f)])]);
    const desdeQR=campo(form,'Enlace del QR de destino (opcional)');desdeQR.placeholder='https://stock.viverolosaromos.com.ar/canteros/I01-C01/';
    const aplicar=el('button','Usar enlace de destino');aplicar.type='button';form.append(aplicar);
    const escanear=el('button','Escanear QR del destino');escanear.type='button';form.append(escanear);
    escanear.onclick=async()=>{
      if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia){
        $('mensaje').textContent='Este navegador no permite leer QR desde la ficha. Guardá el borrador, abrí el QR con la cámara del teléfono en este mismo navegador o pegá el enlace del destino.';return;
      }
      const dialog=el('dialog'),video=el('video'),cerrar=el('button','Cerrar cámara');
      video.style.width='100%';video.setAttribute('playsinline','');dialog.append(el('h2','Escanear destino'),video,cerrar);document.body.append(dialog);
      let stream,activo=true;const detener=()=>{activo=false;stream?.getTracks().forEach(t=>t.stop());dialog.remove();};
      cerrar.onclick=()=>dialog.close();dialog.addEventListener('close',detener,{once:true});dialog.showModal();
      try{
        guardarBorrador();stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
        if(!activo){stream.getTracks().forEach(t=>t.stop());return;}video.srcObject=stream;await video.play();
        const detector=new BarcodeDetector({formats:['qr_code']});
        const buscar=async()=>{if(!activo)return;try{const encontrados=await detector.detect(video);if(encontrados.length){desdeQR.value=encontrados[0].rawValue;dialog.close();aplicar.click();return;}setTimeout(buscar,250);}catch(err){dialog.close();$('mensaje').textContent=err.message;}};buscar();
      }catch(err){dialog.close();$('mensaje').textContent='No se pudo usar la cámara. Podés pegar el enlace del QR. '+err.message;}
    };
    const borradorKey=actual.demostracion?'plantas-demostracion-borrador':'plantas-movimiento-borrador';
    function cambiar(){
      const ingreso=tipo.value==='ingreso',traslado=tipo.value==='traslado';
      [variedad,configuracion,lote].forEach(e=>{e.parentElement.hidden=!ingreso;e.required=ingreso&&e!==lote;});
      loteExistente.parentElement.hidden=ingreso;loteExistente.required=!ingreso;
      [destino,desdeQR].forEach(e=>e.parentElement.hidden=!traslado);aplicar.hidden=!traslado;escanear.hidden=!traslado;destino.required=traslado;
      razonBaja.parentElement.hidden=tipo.value!=='baja';razonBaja.required=tipo.value==='baja';
      motivo.required=false;
      origenDetalle.parentElement.hidden=!ingreso;
      destinoDetalle.parentElement.hidden=ingreso||traslado;
      loteExistente.replaceChildren(new Option('Seleccioná un lote',''));
      datos.existencias.filter(e=>e.fila_id===Number(fila.value)).forEach(e=>loteExistente.add(new Option(e.variedad+' · '+(e.lote||'Sin lote')+' · '+e.cantidad+' disponibles',e.lote_id)));
      configuracion.value=datos.filas.find(f=>f.id===Number(fila.value))?.configuracion||'';
    }tipo.onchange=cambiar;fila.onchange=cambiar;cambiar();
    const campos={tipo,fila,variedad,lote,configuracion,loteExistente,cantidad,fecha,razonBaja,motivo,origenDetalle,destinoDetalle,destino};
    let operacion=crypto.randomUUID();
    const guardarBorrador=()=>{
      const valores=Object.fromEntries(Object.entries(campos).map(([k,e])=>[k,e.value]));
      localStorage.setItem(borradorKey,JSON.stringify({origenRuta:actual.ruta,valores,operacion}));
    };
    form.addEventListener('input',()=>{operacion=crypto.randomUUID();guardarBorrador();});
    let borrador=null;try{borrador=JSON.parse(localStorage.getItem(borradorKey)||'null');}catch{localStorage.removeItem(borradorKey);}
    if(borrador){
      if(borrador.origenRuta===actual.ruta){
        tipo.value=borrador.valores.tipo;fila.value=borrador.valores.fila;cambiar();Object.entries(campos).forEach(([k,e])=>{e.value=borrador.valores[k]||e.value;});operacion=borrador.operacion;
      }else if(borrador.valores.tipo==='traslado' && new URLSearchParams(location.search).get('destino')!=='no'){
        const banner=el('section');banner.append(el('p','Tenés un traslado sin confirmar. Podés usar este cantero como destino y volver al origen.'));
        const elegir=campo(banner,'Fila de destino','text',datos.filas.map(f=>[f.id,codigo(f)]));const volver=el('button','Usar destino y continuar traslado');
        volver.onclick=()=>{borrador.valores.destino=elegir.value;localStorage.setItem(borradorKey,JSON.stringify(borrador));location.href=borrador.origenRuta;};banner.append(volver);section.prepend(banner);
      }
    }
    aplicar.onclick=()=>{
      try{const url=new URL(desdeQR.value);let ruta=url.pathname;const m=ruta.match(/^\/canteros\/(I\d+)-(C\d+)\/?$/);if(m)ruta='/invernaderos/'+m[1]+'/canteros/'+m[2]+'/';
        const ubicacion=ubicaciones.find(u=>u.ruta===ruta);if(!ubicacion)throw new Error('El enlace no corresponde a una ubicación registrada');
        if(ubicacion.tipo==='fila'){destino.value=ubicacion.id;guardarBorrador();}
        else{guardarBorrador();location.href=ubicacion.ruta;}
      }catch(err){$('mensaje').textContent=err.message;}
    };
    const borrar=el('button','Descartar borrador');borrar.type='button';borrar.onclick=()=>{localStorage.removeItem(borradorKey);form.reset();cambiar();operacion=crypto.randomUUID();};form.append(borrar);
    const enviar=el('button','Revisar movimiento');form.append(enviar);
    form.onsubmit=event=>{
      event.preventDefault();guardarBorrador();const ingreso=tipo.value==='ingreso';const payload={operacion,tipo:tipo.value,cantidad:Number(cantidad.value),fecha:new Date(fecha.value).toISOString(),motivo:tipo.value==='baja'?[razonBaja.value,motivo.value].filter(Boolean).join(' · '):motivo.value,origen_detalle:origenDetalle.value,destino_detalle:destinoDetalle.value};
      if(tipo.value==='baja')motivo.value=payload.motivo;
      if(ingreso)Object.assign(payload,{destino_id:Number(fila.value),variedad:variedad.value,lote:lote.value,configuracion:configuracion.value});
      else Object.assign(payload,{origen_id:Number(fila.value),lote_id:Number(loteExistente.value)});
      if(tipo.value==='traslado')payload.destino_id=Number(destino.value);
      confirmar('Operación: '+tipo.selectedOptions[0].text+'\nUbicación: '+nombreFila(fila.value)+'\nPlanta/lote: '+(ingreso?variedad.value+' / '+lote.value:loteExistente.selectedOptions[0].text)+'\nCantidad: '+cantidad.value+' macetas\nFecha: '+new Date(fecha.value).toLocaleString('es-AR')+'\nMotivo: '+(motivo.value||'—')+(tipo.value==='traslado'?'\nDestino: '+nombreFila(destino.value):''),async()=>{
        await api('/api/plantas/movimientos',{method:'POST',body:JSON.stringify(payload)});localStorage.removeItem(borradorKey);
      });
    };
    if(datos.existencias.length){
      const alturaSection=seccion('Registrar altura de plantas'),alturaForm=el('form');alturaSection.append(alturaForm);
      const registro=campo(alturaForm,'Fila y lote','text',datos.existencias.map(e=>[e.fila_id+':'+e.lote_id,nombreFila(e.fila_id)+' · '+e.variedad+' · '+(e.lote||'Sin lote')]));
      const altura=campo(alturaForm,'Altura','number');altura.min=.001;altura.step='any';altura.required=true;
      const unidad=campo(alturaForm,'Unidad','text',[['cm','cm'],['m','m']]);const guardar=el('button','Revisar altura');alturaForm.append(guardar);
      alturaForm.onsubmit=e=>{e.preventDefault();const [fila_id,lote_id]=registro.value.split(':').map(Number);const payload={fila_id,lote_id,altura:Number(altura.value),unidad:unidad.value,fecha:new Date().toISOString()};confirmar(registro.selectedOptions[0].text+'\nAltura: '+altura.value+' '+unidad.value,()=>api('/api/plantas/alturas',{method:'POST',body:JSON.stringify(payload)}));};
    }
  }
  tabla('Alturas registradas',['Fecha','Fila','Planta / lote','Altura'],datos.alturas.map(a=>[new Date(a.fecha).toLocaleString('es-AR'),nombreFila(a.fila_id),a.variedad+' / '+a.lote,a.altura+' '+a.unidad]));
  tabla('Historial (últimos 100 movimientos)',['Fecha','Tipo','Planta / lote','Cantidad','Origen','Destino','Motivo'],datos.movimientos.map(m=>[new Date(m.fecha).toLocaleString('es-AR'),m.tipo,m.variedad+' / '+m.lote,m.cantidad+' macetas',m.origen||'—',m.destino||'—',m.motivo]));
  tabla('Bajas registradas',['Fecha','Fila','Planta / lote','Cantidad','Motivo'],(datos.bajasDetalle||[]).map(b=>[new Date(b.fecha).toLocaleString('es-AR'),b.origen||'—',b.variedad+' / '+(b.lote||'Sin lote'),b.cantidad+' macetas',b.motivo||'—']));
  const botones=[];
  for(const [nombre,nodo] of paneles){
    const boton=el('button',nombre);boton.type='button';if(nombre==='Resumen')boton.setAttribute('aria-current','page');
    boton.onclick=()=>{for(const [titulo,p] of paneles)p.hidden=titulo!==nombre;botones.forEach(b=>{if(b===boton)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});};
    botones.push(boton);navegacion.append(boton);
  }
}
