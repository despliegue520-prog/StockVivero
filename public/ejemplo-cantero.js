// Datos exclusivamente de presentación. Este archivo nunca llama al servidor.
const $ = id => document.getElementById(id);
function el(tag, text = '', className = '') {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
function codigo(item) { return item.codigoVisible || item.codigo; }
const actual = { id: 1000, tipo: 'cantero', codigo: 'C01', codigoVisible: 'INV01 - C01', ruta: '/ejemplo-cantero.html', nombre: 'Cantero de ejemplo' };
const filas = [
  { id: 1001, codigo: 'F01', capacidad: 108, portamacetas: 6, plantas_por_portamaceta: 18, ocupado: 70, configuracion: 'Configuración A (ejemplo)' },
  { id: 1002, codigo: 'F02', capacidad: 90, portamacetas: 5, plantas_por_portamaceta: 18, ocupado: 80, configuracion: 'Configuración A (ejemplo)' },
  { id: 1003, codigo: 'F03', capacidad: 72, portamacetas: 4, plantas_por_portamaceta: 18, ocupado: 0, configuracion: 'Configuración B (ejemplo)' },
  { id: 1004, codigo: 'F04', capacidad: null, ocupado: 0, configuracion: null }
].map(f => ({ ...f, tipo: 'fila', padre_id: actual.id, codigoVisible: 'INV01 - C01 - ' + f.codigo, ruta: '#' + f.codigo }));
const datos = {
  ubicacion: actual, filas, bajas: 5,
  existencias: [
    { fila_id: 1001, lote_id: 101, variedad: 'ARAUCO', lote: 'ARA-EJEMPLO', configuracion: filas[0].configuracion, cantidad: 40 },
    { fila_id: 1001, lote_id: 102, variedad: 'ARBEQUINA', lote: 'AQ-EJEMPLO', configuracion: filas[0].configuracion, cantidad: 30 },
    { fila_id: 1002, lote_id: 101, variedad: 'ARAUCO', lote: 'ARA-EJEMPLO', configuracion: filas[1].configuracion, cantidad: 80 }
  ],
  alturas: [
    { fila_id: 1001, lote_id: 101, variedad: 'ARAUCO', lote: 'ARA-EJEMPLO', altura: 25, unidad: 'cm', fecha: '2026-10-30T12:00:00-03:00' },
    { fila_id: 1001, lote_id: 102, variedad: 'ARBEQUINA', lote: 'AQ-EJEMPLO', altura: 18, unidad: 'cm', fecha: '2026-10-30T12:00:00-03:00' }
  ],
  movimientos: [
    { tipo: 'baja', variedad: 'ARAUCO', lote: 'ARA-EJEMPLO', cantidad: 5, origen: filas[0].codigoVisible, destino: null, motivo: 'Plantas dañadas (ejemplo)', fecha: '2026-10-30T11:00:00-03:00' },
    { tipo: 'ingreso', variedad: 'ARAUCO', lote: 'ARA-EJEMPLO', cantidad: 80, origen: null, destino: filas[1].codigoVisible, motivo: 'Carga inicial de ejemplo', fecha: '2026-10-30T10:00:00-03:00' },
    { tipo: 'ingreso', variedad: 'ARBEQUINA', lote: 'AQ-EJEMPLO', cantidad: 30, origen: null, destino: filas[0].codigoVisible, motivo: 'Carga inicial de ejemplo', fecha: '2026-10-30T09:30:00-03:00' },
    { tipo: 'ingreso', variedad: 'ARAUCO', lote: 'ARA-EJEMPLO', cantidad: 45, origen: null, destino: filas[0].codigoVisible, motivo: 'Carga inicial de ejemplo', fecha: '2026-10-30T09:00:00-03:00' }
  ]
};
async function api(ruta, opciones) {
  if (opciones) throw new Error('Esta es una demostración: no se guardan operaciones. Para cargar datos reales, entrá a Invernaderos.');
  return datos;
}
// No restaurar ni modificar borradores reales al explorar esta vista.
montarFicha({ ...actual, demostracion: true }, [actual, ...filas]).then(() => {
  for (const fila of filas) {
    const enlace = [...document.querySelectorAll('.mapa-encabezado a')].find(a => a.getAttribute('href') === fila.ruta);
    if (enlace) enlace.closest('article').id = fila.codigo;
  }
}).catch(err => { $('mensaje').textContent = err.message; });
