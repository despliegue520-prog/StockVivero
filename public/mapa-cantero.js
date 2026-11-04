const VARIEDADES_OLIVO = Object.freeze([
  { nombre: 'ARAUCO', codigo: 'ARA', color: '#218442' },
  { nombre: 'ARBEQUINA', codigo: 'AQ', color: '#f2b8cf' },
  { nombre: 'ARBOSANA', codigo: 'AB', color: '#f2ce28' },
  { nombre: 'BARNEA', codigo: 'BAR', color: '#2856c5' },
  { nombre: 'CORATINA', codigo: 'CO', color: '#00c9d9' },
  { nombre: 'CHANGLOT', codigo: 'CHA', color: '#92999f' },
  { nombre: 'HOJIBLANCA', codigo: 'HJB', color: '#ed7c24' },
  { nombre: 'KORONEIKI', codigo: 'KK', color: '#8c49bb' },
  { nombre: 'PICUAL', codigo: 'PI', color: '#a4d76a' },
  { nombre: 'I-18', codigo: 'I18', color: '#f2b8cf' },
  { nombre: 'MANZANILLA', codigo: 'MNZ', color: '#abd8ee' },
  { nombre: 'NABALI', codigo: 'NA', color: '#db333b' }
].map(v => Object.freeze(v)));
function buscarVariedadOlivo(valor) {
  const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const clave = normalizar(valor);
  return VARIEDADES_OLIVO.find(v => [v.nombre, v.codigo, v.nombre + v.codigo].some(alias => normalizar(alias) === clave));
}
function etiquetaVariedad(valor) {
  const variedad = buscarVariedadOlivo(valor);
  return variedad ? variedad.nombre + ' (' + variedad.codigo + ')' : valor;
}
function dibujarCanteroMacetas(filas, existencias) {
  const dibujo = el('div', '', 'cantero-dibujo');
  dibujo.append(el('h3', 'Vista del cantero con macetas'));
  dibujo.append(el('p', 'Macetas de color: ocupadas. Contornos verdes con +: lugares disponibles para colocar macetas. La distribución es ilustrativa; no indica posiciones reales.', 'muted'));
  const terreno = el('div', '', 'cantero-terreno');
  filas.forEach(fila => {
    const filaVisual = el('div', '', 'cantero-renglon');
    const titulo = el('a', fila.codigo || fila.nombre); titulo.href = fila.ruta; filaVisual.append(titulo);
    if (fila.capacidad === null) {
      filaVisual.append(el('p', 'Sin relevar · ' + (Number(fila.ocupado) || 0) + ' ocupadas · disponibilidad desconocida', 'pendiente'));
      terreno.append(filaVisual); return;
    }
    const macetas = el('div', '', 'cantero-macetas');
    const capacidad = Math.max(0, Number(fila.capacidad));
    const ocupado = Math.max(0, Number(fila.ocupado) || 0);
    const disponibles = Math.max(0, capacidad - ocupado);
    const grupo = 1;
    const agregar = (cantidad, nombre, color, libre) => {
      for (let restantes = cantidad; restantes > 0; restantes -= grupo) {
        const numero = Math.min(grupo, restantes);
        const variedad = buscarVariedadOlivo(nombre);
        const identificador = variedad?.codigo || String(nombre || '').slice(0, 3).toUpperCase();
        const maceta = el('span', libre ? '+' : numero > 1 ? String(numero) : identificador, 'cantero-maceta' + (libre ? ' disponible' : ' ocupada'));
        if (!libre) maceta.setAttribute('style', '--color-maceta:' + color);
        const texto = libre ? numero + ' lugares disponibles' : nombre + ': ' + numero + ' macetas ocupadas';
        maceta.setAttribute('title', texto); maceta.setAttribute('aria-label', texto); maceta.setAttribute('role', 'img');
        macetas.append(maceta);
      }
    };
    const lotes = existencias.filter(e => e.fila_id === fila.id && Number(e.cantidad) > 0);
    const variedades = el('div', '', 'cantero-variedades');
    lotes.forEach(lote => {
      const item = el('span');
      const punto = el('i');
      punto.setAttribute('style', 'background:' + (buscarVariedadOlivo(lote.variedad)?.color || '#64748b'));
      item.append(punto, el('span', etiquetaVariedad(lote.variedad) + ': ' + lote.cantidad));
      variedades.append(item);
    });
    if (lotes.length) filaVisual.append(variedades);
    lotes.forEach(lote => agregar(Number(lote.cantidad), etiquetaVariedad(lote.variedad) + (lote.lote ? ' · ' + lote.lote : ''), buscarVariedadOlivo(lote.variedad)?.color || '#64748b', false));
    const sinDetalle = Math.max(0, ocupado - lotes.reduce((s, l) => s + Number(l.cantidad), 0));
    agregar(sinDetalle, 'Variedad sin detalle', '#64748b', false);
    agregar(disponibles, '', '', true);
    filaVisual.append(el('p', ocupado + ' ocupadas · ' + disponibles + ' lugares disponibles · capacidad ' + capacidad, 'cantero-conteo'));
    if (grupo > 1) filaVisual.append(el('p', 'Vista agrupada: cada símbolo representa hasta ' + grupo + ' macetas o lugares. Consultá su detalle para ver la cantidad exacta.', 'muted'));
    if (!capacidad) filaVisual.append(el('p', 'Capacidad relevada: cero.'));
    filaVisual.append(macetas); terreno.append(filaVisual);
  });
  if (!filas.length) terreno.append(el('p', 'Creá las filas para dibujar el cantero.'));
  dibujo.append(terreno); return dibujo;
}
function dibujarMapaCantero(filas, existencias) {
  const section = el('section', '', 'mapa-cantero');
  section.dataset.vista = 'ocupacion-por-fila';
  section.append(el('h2', 'Mapa de ocupación del cantero'));
  section.append(el('p', 'Cada barra representa una fila. Los colores muestran variedades o lotes; la zona clara indica lugares libres. Es un esquema de cantidades, no de posiciones físicas.', 'muted'));
  const encabezadoMapa = section.querySelector('h2');
  if (encabezadoMapa) encabezadoMapa.textContent = 'Ocupación por fila';
  const colores = new Map();
  existencias.forEach(e => colores.set(e.lote_id, buscarVariedadOlivo(e.variedad)?.color || '#64748b'));
  const referencias = el('details', '', 'mapa-referencias');
  referencias.append(el('summary', 'Referencias de variedades y colores'));
  const claves = el('div', '', 'mapa-leyenda');
  VARIEDADES_OLIVO.forEach(v => {
    const item = el('span'); const punto = el('i'); punto.setAttribute('style', 'background:' + v.color);
    item.append(punto, el('span', v.nombre + ' (' + v.codigo + ')')); claves.append(item);
  });
  referencias.append(claves, el('p', 'ARBEQUINA (AQ) e I-18 (I18) comparten rosa pastel. Los códigos distinguen ambas variedades. Otras variedades: color neutro.', 'muted'));
  section.append(referencias);
  const pestañas = el('nav', '', 'graficos-pestanas');
  const botonMapa = el('button', 'Ocupación por fila');
  const botonOcupacion = el('button', 'Estadísticas por fila');
  const panelMapa = el('div', '', 'grafico-panel');
  const panelOcupacion = el('div', '', 'grafico-panel');
  botonMapa.type = 'button'; botonOcupacion.type = 'button';
  botonMapa.setAttribute('aria-current', 'page');
  panelMapa.append(dibujarCanteroMacetas(filas, existencias));
  pestañas.append(botonMapa, botonOcupacion);
  section.append(pestañas, panelMapa, panelOcupacion);
  const mostrarGrafico = (activo, panelActivo, panelOculto) => {
    botonMapa.toggleAttribute('aria-current', activo === botonMapa);
    botonOcupacion.toggleAttribute('aria-current', activo === botonOcupacion);
    panelActivo.hidden = false; panelOculto.hidden = true;
  };
  botonMapa.onclick = () => mostrarGrafico(botonMapa, panelMapa, panelOcupacion);
  botonOcupacion.onclick = () => mostrarGrafico(botonOcupacion, panelOcupacion, panelMapa);
  panelOcupacion.hidden = true;
  if (!filas.length) section.append(el('p', 'Creá las filas y completá el relevamiento para ver el mapa.', 'pendiente'));
  filas.forEach(f => {
    const row = el('article', '', 'mapa-fila');
    const encabezado = el('div', '', 'mapa-encabezado');
    const enlace = el('a', f.codigo || f.nombre); enlace.href = f.ruta; encabezado.append(enlace);
    const capacidad = f.capacidad;
    const ocupado = Number(f.ocupado) || 0;
    const estado = capacidad === null ? 'Sin relevar' : ocupado > capacidad ? 'Conflicto de capacidad' : ocupado === 0 ? 'Vacía' : ocupado === capacidad ? 'Completa' : 'Parcialmente ocupada';
    encabezado.append(el('span', estado, 'mapa-estado')); row.append(encabezado);
    row.append(el('p', f.configuracion || 'Configuración pendiente', 'muted'));
    const lotes = existencias.filter(e => e.fila_id === f.id && Number(e.cantidad) > 0);
    const barra = el('div', '', 'mapa-barra' + (capacidad === null ? ' mapa-sin-relevar' : ''));
    barra.setAttribute('role', 'img');
    barra.setAttribute('aria-label', (f.codigo || 'Fila') + ': ' + ocupado + ' macetas ocupadas; ' + (capacidad === null ? 'capacidad sin relevar' : 'capacidad ' + capacidad + ', disponibles ' + Math.max(0, capacidad - ocupado)));
    if (capacidad !== null && capacidad > 0) {
      let restante = capacidad;
      lotes.forEach(lote => {
        const cantidad = Math.min(Number(lote.cantidad), restante); restante -= cantidad;
        const parte = el('span', '', 'mapa-segmento');
        parte.setAttribute('style', 'width:' + (cantidad / capacidad * 100) + '%;background:' + colores.get(lote.lote_id));
        parte.setAttribute('title', etiquetaVariedad(lote.variedad) + (lote.lote ? ' · ' + lote.lote : '') + ': ' + lote.cantidad + ' macetas');
        barra.append(parte);
      });
      const sinDetalle = Math.min(restante, Math.max(0, ocupado - lotes.reduce((s,l)=>s+Number(l.cantidad),0)));
      if (sinDetalle) { const parte = el('span', '', 'mapa-segmento'); parte.setAttribute('style', 'width:' + (sinDetalle / capacidad * 100) + '%;background:#778477'); barra.append(parte); }
    }
    row.append(barra);
    row.append(el('p', ocupado + ' ocupadas · ' + (capacidad === null ? 'capacidad y disponibilidad sin relevar' : capacidad + ' de capacidad · ' + Math.max(0, capacidad - ocupado) + ' disponibles') + (capacidad > 0 ? ' · ' + Math.round(ocupado / capacidad * 100) + '%' : ''), 'mapa-cifras'));
    const leyenda = el('div', '', 'mapa-leyenda');
    lotes.forEach(lote => {
      const item = el('span'); const punto = el('i'); punto.setAttribute('style', 'background:' + colores.get(lote.lote_id));
      item.append(punto, el('span', etiquetaVariedad(lote.variedad) + (lote.lote ? ' · ' + lote.lote : '') + ': ' + lote.cantidad)); leyenda.append(item);
    });
    if (capacidad !== null) { const libre = el('span'); const punto = el('i', '', 'mapa-libre'); libre.append(punto, el('span', 'Libres: ' + Math.max(0, capacidad - ocupado))); leyenda.append(libre); }
    row.append(leyenda); panelOcupacion.append(row);
  });
  return section;
}
