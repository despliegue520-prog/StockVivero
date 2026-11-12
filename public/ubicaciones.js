const $ = id => document.getElementById(id);
let apiKey = sessionStorage.getItem('apiKey') || '';
const blobs = [];
async function api(path, options = {}, binary = false) {
  const headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey };
  let response = await window.stockOffline.request(path, { ...options, headers });
  if (response.status === 401) {
    const key = await window.solicitarClave();
    if (!key) throw new Error('Se requiere autorización para consultar los datos.');
    apiKey = key; sessionStorage.setItem('apiKey', key); headers['x-api-key'] = key;
    response = await window.stockOffline.request(path, { ...options, headers });
  }
  if (!response.ok) throw new Error((await response.json()).error || 'No se pudo completar la solicitud');
  return binary ? response.blob() : response.json();
}
function el(tag, text, className) {
  const node = document.createElement(tag); if (text) node.textContent = text;
  if (className) node.className = className; return node;
}
function codigo(item) {
  return item.slug || item.ruta.split('/').filter(p => /^[ICF]\d+$/.test(p)).map(p => p.startsWith('I') ? p.replace(/^I/, 'INV') : p).join(' - ');
}
function contexto(item) {
  return item.slug ? 'Categoría: ' + item.nombre : item.ruta.split('/').filter(p => /^[ICF]\d+$/.test(p)).map(p => ({ I: 'Invernadero ', C: 'Cantero ', F: 'Fila ' }[p[0]] + p.slice(1))).join(' · ');
}
let elegibles = [];
let catalogoUbicaciones = [];
function tarjetaInvernadero(item, canteros) {
  const card = tarjeta(item);
  card.classList.add('tarjeta-invernadero');
  const toggle = el('button', `Ver ${canteros.length} canteros`, 'boton-canteros');
  toggle.type = 'button';
  const hijos = el('div', '', 'canteros-hijos');
  hijos.hidden = true;
  canteros.forEach(cantero => hijos.append(tarjeta(cantero, true)));
  toggle.onclick = () => {
    hijos.hidden = !hijos.hidden;
    toggle.textContent = hijos.hidden ? `Ver ${canteros.length} canteros` : 'Ocultar canteros';
    card.classList.toggle('abierto', !hijos.hidden);
  };
  card.append(toggle, hijos);
  return card;
}
function tarjeta(item, seleccion = false) {
  const card = el('article', '', 'tarjeta');
  const a = el('a', item.tipo === 'invernadero' ? codigo(item) + ' · ' + item.nombre : item.nombre); a.href = item.ruta; card.append(a);
  card.append(el('p', codigo(item), 'muted'));
  if (!item.slug) {
    const filas = catalogoUbicaciones.filter(u=>u.tipo==='fila' && u.ruta.startsWith(item.ruta));
    const pendientes = !filas.length || filas.some(f=>f.capacidad===null);
    const ocupado = filas.some(f=>Number(f.ocupado)>0);
    const completa = !pendientes && filas.every(f=>Number(f.ocupado)===f.capacidad);
    card.className += ' estado ' + (pendientes?'pendiente':!ocupado?'vacia':completa?'completa':'parcial');
    card.append(el('span',pendientes?'Capacidad sin relevar':!ocupado?'Vacía':completa?'Completa':'Parcialmente ocupada'));
    const grupos = new Map();
    filas.forEach(f=>{const key=f.configuracion||'Sin configuración';if(!grupos.has(key))grupos.set(key,{ocupado:0,capacidad:0,pendiente:false});const g=grupos.get(key);g.ocupado+=Number(f.ocupado)||0;if(f.capacidad===null)g.pendiente=true;else g.capacidad+=f.capacidad;});
    grupos.forEach((g,key)=>card.append(el('p',key+': '+g.ocupado+' ocupadas · '+(g.pendiente?'disponibilidad sin relevar':(g.capacidad-g.ocupado)+' disponibles'))));
  }
  if (seleccion) {
    const label = el('label', 'Incluir en etiquetas'); const input = el('input');
    input.type = 'checkbox'; input.dataset.ruta = item.ruta; label.prepend(input); card.append(label);
  }
  return card;
}
async function iniciar() {
  const { ubicaciones, categorias } = await api('/api/ubicaciones');
  catalogoUbicaciones = ubicaciones;
  const ruta = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
  const etiquetas = ruta === '/etiquetas/';
  const corto = ruta.match(/^\/canteros\/(I[0-9]{2,3})-(C[0-9]{2,3})\/$/);
  const buscada = corto ? '/invernaderos/'+corto[1]+'/canteros/'+corto[2]+'/' : ruta;
  const actual = ubicaciones.find(u => u.ruta === buscada);
  if (actual && (actual.tipo === 'cantero' || actual.tipo === 'fila')) {
    document.getElementById('nav-ubicaciones')?.remove();
    document.querySelector('.encabezado-seccion')?.remove();
  }
  if (!etiquetas && ruta !== '/invernaderos/' && !actual) throw new Error('Ubicación no encontrada. El código debe registrarse antes de imprimir su QR.');
  $('titulo').textContent = etiquetas ? 'Etiquetas QR' : actual ? actual.nombre : 'Invernaderos';
  if (etiquetas) {
    const aviso = el('p', 'Seleccioná hasta 100 etiquetas. Los QR abren la ficha y nunca registran movimientos. Se necesita conexión a Internet.');
    $('contenido').append(aviso);
    const filtro = el('input'); filtro.type = 'search'; filtro.placeholder = 'Buscar ubicación o categoría'; filtro.setAttribute('aria-label', filtro.placeholder);
    $('contenido').append(filtro); const grid = el('div', '', 'grid'); $('contenido').append(grid);
    const invernaderos = ubicaciones.filter(item => item.tipo === 'invernadero');
    elegibles = ubicaciones;
    invernaderos.forEach(invernadero => {
      const canteros = ubicaciones.filter(item => item.tipo === 'cantero' && item.padre_id === invernadero.id);
      grid.append(tarjetaInvernadero(invernadero, canteros));
    });
    filtro.addEventListener('input', () => [...grid.children].forEach(card => { card.hidden = !card.textContent.toLocaleLowerCase('es').includes(filtro.value.toLocaleLowerCase('es')); }));
    $('acciones').hidden = false;
  } else {
    if (actual) {
      const ficha = el('section'); ficha.append(el('p', contexto(actual)), el('span', 'Sin relevar', 'pendiente'), el('p', 'Capacidad, ocupación, disponibilidad, plantas y movimientos: pendientes de implementar y relevar. No se asume que la ubicación esté vacía.', 'muted'));
      const qr = el('a', 'Preparar etiqueta QR de esta ubicación'); qr.href = '/etiquetas/?ruta=' + encodeURIComponent(actual.ruta); ficha.append(qr);
      if (actual.padre_id) { const padre = ubicaciones.find(u => u.id === actual.padre_id); const volver = el('p'); const link = el('a', 'Volver a ' + padre.nombre); link.href = padre.ruta; volver.append(link); ficha.append(volver); }
      const renombrar = el('button', 'Cambiar nombre visible'); renombrar.type = 'button';
      renombrar.onclick = async () => { const nombre = await window.solicitarTexto({ titulo: 'Cambiar nombre', etiqueta: 'Nombre visible (el código y el QR no cambian)', valor: actual.nombre }); if (!nombre) return; try { await api('/api/ubicaciones/' + actual.id, { method: 'PATCH', body: JSON.stringify({ nombre }) }); location.reload(); } catch (err) { $('mensaje').textContent = err.message; } };
      ficha.append(renombrar); $('contenido').append(ficha);
      await montarFicha(actual, ubicaciones);
      ficha.querySelector('.pendiente')?.remove();
      ficha.querySelector('.muted')?.remove();
    }
    const hijos = ubicaciones.filter(u => actual ? u.padre_id === actual.id : u.tipo === 'invernadero');
    const grid = el('div', '', 'grid'); hijos.forEach(u => grid.append(tarjeta(u))); $('contenido').append(grid);
    if (actual && actual.tipo !== 'fila') {
      if (!hijos.length) $('contenido').append(el('p', 'Todavía no hay ' + (actual.tipo === 'invernadero' ? 'canteros' : 'filas') + ' registrados.'));
      const section = el('section'); section.append(el('h2', actual.tipo === 'invernadero' ? 'Crear cantero' : 'Crear fila'));
      const form = el('form'); const nLabel = el('label', 'Número permanente'); const numero = el('input'); numero.type = 'number'; numero.min = 1; numero.max = 999; numero.required = true; nLabel.append(numero);
      const label = el('label', 'Nombre visible'); const nombre = el('input'); nombre.required = true; nombre.maxLength = 150; label.append(nombre);
      const button = el('button', 'Crear ubicación'); form.append(nLabel, label, button); section.append(form); $('contenido').append(section);
      form.onsubmit = async event => { event.preventDefault(); button.disabled = true; try { await api('/api/ubicaciones', { method: 'POST', body: JSON.stringify({ padre_id: actual.id, numero: Number(numero.value), nombre: nombre.value }) }); location.reload(); } catch (err) { $('mensaje').textContent = err.message; button.disabled = false; } };
    }
  }
  const seleccionada = new URLSearchParams(location.search).get('ruta');
  if (etiquetas && seleccionada) {
    const input = [...document.querySelectorAll('[data-ruta]')].find(e => e.dataset.ruta === seleccionada);
    if (input) { input.checked = true; await generar(); }
  }
}
async function generar() {
  $('mensaje').textContent = ''; $('generar').disabled = true; $('imprimir').disabled = true;
  try {
    const rutas = [...document.querySelectorAll('[data-ruta]:checked')].map(input => input.dataset.ruta);
    if (!rutas.length || rutas.length > 100) throw new Error('Seleccioná entre 1 y 100 etiquetas.');
    const { base_url } = await api('/api/ubicaciones/config');
    $('etiquetas').replaceChildren(); blobs.splice(0).forEach(url => URL.revokeObjectURL(url));
    for (const ruta of rutas) {
      const item = elegibles.find(i => i.ruta === ruta);
      const qrRuta = item.tipo === 'cantero' ? '/canteros/' + item.ruta.split('/').filter(p => /^[ICF]\d+$/.test(p)).join('-') + '/' : ruta;
      const blob = await api('/api/ubicaciones/qr?ruta=' + encodeURIComponent(qrRuta), {}, true);
      const url = URL.createObjectURL(blob); blobs.push(url);
      const etiqueta = el('article', '', 'etiqueta'); const img = el('img'); img.src = url; img.alt = 'QR de ' + codigo(item);
      await img.decode();
      etiqueta.append(el('strong', 'Vivero Los Aromos'), el('span', contexto(item)), el('strong', codigo(item)), img);
      const a = el('a', base_url + qrRuta); a.href = base_url + ruta; etiqueta.append(a);
      const descarga = el('a', 'Descargar QR SVG'); descarga.href = url; descarga.download = codigo(item) + '.svg'; descarga.className = 'no-imprimir'; etiqueta.append(descarga);
      const individual = el('button', 'Imprimir esta etiqueta'); individual.onclick = () => {
        const otras = [...$('etiquetas').children].filter(e => e !== etiqueta); otras.forEach(e => { e.hidden = true; });
        window.print(); otras.forEach(e => { e.hidden = false; });
      }; etiqueta.append(individual); $('etiquetas').append(etiqueta);
    }
    $('imprimir').disabled = false;
  } catch (err) { $('mensaje').textContent = err.message; $('etiquetas').replaceChildren(); }
  finally { $('generar').disabled = false; }
}
$('generar').onclick = generar; $('imprimir').onclick = () => window.print();
window.addEventListener('offline', () => { $('mensaje').textContent = 'Sin conexión. Los movimientos no se guardan ni se sincronizan sin Internet.'; });
iniciar().catch(err => { $('titulo').textContent = 'No se pudo abrir la ficha'; $('mensaje').textContent = err.message; });
