const $ = (id) => document.getElementById(id);

let apiKey = sessionStorage.getItem('apiKey') || '';
let productosGlobal = [];
let historialGlobal = [];
let categoriaSeleccionada = 'Todas';

const opcionesPorCategoria = {
  'Plantas y Variedades': [
    'Árboles', 'Arbustos', 'Florales', 'Aromáticas',
    'Frutales', 'Huerta', 'Plantas de Interior'
  ],
  'Macetas y Contenedores': [
    'Plástico', 'Barro', 'Cemento', 'Fibrocemento', 'Madera', 'Soplada'
  ],
  'Sustratos y Tierras': [
    'Tierra Negra', 'Compost', 'Turba', 'Perlita',
    'Humus de Lombriz', 'Resaca', 'Corteza'
  ],
  'Agroquímicos y Fertilizantes': [
    'Fertilizantes', 'Bioestimulantes/Fitorreguladores',
    'Fitosanitarios', 'Coadyuvantes', 'Correctores'
  ],
  'Herramientas e Insumos': [
    'Poda', 'Riego', 'Indumentaria', 'Tutores', 'Varios'
  ],
  'General': []
};

// =====================================================
// NAVEGACIÓN ENTRE VISTAS
// =====================================================

function cambiarVista(nombreVista, event) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
  });

  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
  });

  const vista = $(`view-${nombreVista}`);

  if (vista) {
    vista.classList.add('active');
  }

  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  }
}

// =====================================================
// MENSAJES
// =====================================================

function mensaje(texto, tipo) {
  const m = $('msg');

  if (!m) {
    console.log(texto);
    return;
  }

  m.textContent = texto;
  m.className = tipo || '';

  setTimeout(() => {
    if (m.textContent === texto) {
      m.textContent = '';
      m.className = '';
    }
  }, 4000);
}

// =====================================================
// COMUNICACIÓN CON LA API
// =====================================================

async function api(ruta, opciones = {}) {
  const headers = {
    ...(opciones.headers || {}),
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch(ruta, {
    ...opciones,
    headers
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    sessionStorage.removeItem('apiKey');
    apiKey = '';

    throw new Error(
      'No autorizado. Verificá la API key configurada en el servidor.'
    );
  }

  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }

  return data;
}

// =====================================================
// CONSTRUCCIÓN DE FILAS
// =====================================================

function fila(celdas) {
  const tr = document.createElement('tr');

  celdas.forEach(({ texto, clase, html }) => {
    const td = document.createElement('td');

    if (html !== undefined) {
      td.innerHTML = html;
    } else {
      td.textContent = texto ?? '';
    }

    if (clase) {
      td.className = clase;
    }

    tr.appendChild(td);
  });

  return tr;
}

// =====================================================
// CLASIFICACIÓN DE TOXICIDAD
// =====================================================

function obtenerClaseToxicidad(banda) {
  if (!banda) return '';

  if (banda.includes('Verde')) return 'tox-verde';
  if (banda.includes('Azul')) return 'tox-azul';
  if (banda.includes('Amarillo')) return 'tox-amarillo';
  if (banda.includes('Rojo')) return 'tox-rojo';

  return '';
}

// =====================================================
// CARGA GENERAL DE DATOS
// =====================================================

async function cargarDatos() {
  try {
    // Cargar los totales agrupados por categoría,
    // subcategoría, marca y unidad.
    const tbodyTotales = $('totales');

    // Esta ruta todavía no está implementada en el backend actual.
    // Si no está disponible, mostramos un aviso pero seguimos cargando
    // el catálogo y el historial para que el resto de la aplicación funcione.
    try {
      const totales = await api('/productos/totales');

      if (tbodyTotales) {
        tbodyTotales.replaceChildren();

        if (Array.isArray(totales)) {
          totales.forEach((t) => {
            tbodyTotales.appendChild(fila([
              { texto: t.categoria || 'General' },
              { texto: t.subcategoria || '-' },
              { texto: t.marca || '-' },
              { texto: t.unidad || '-' },
              { texto: Number(t.total_stock ?? 0) }
            ]));
          });
        }
      }
    } catch (errorTotales) {
      console.warn('El resumen de stock no está disponible:', errorTotales.message);

      if (tbodyTotales) {
        tbodyTotales.replaceChildren();

        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.className = 'empty';
        td.textContent = 'El resumen de stock necesita una ruta en el backend.';
        tr.appendChild(td);
        tbodyTotales.appendChild(tr);
      }
    }

    // Cargar productos y actualizar el catálogo.
    productosGlobal = await api('/productos');

    if (!Array.isArray(productosGlobal)) {
      throw new Error('La API de productos no devolvió una lista válida.');
    }

    renderizarProductos(productosGlobal);

    // Cargar movimientos e historial.
    historialGlobal = await api('/movimientos');

    if (!Array.isArray(historialGlobal)) {
      throw new Error('La API de movimientos no devolvió una lista válida.');
    }

    renderizarHistorial(historialGlobal);

  } catch (e) {
    console.error('Error al actualizar datos:', e.message);
    mensaje(e.message, 'error');
  }
}

// =====================================================
// CATÁLOGO, FILTROS Y ALERTAS
// =====================================================

function renderizarProductos(productos) {
  const tbodyProd = $('productos');
  const tbodyAlertas = $('tabla-alertas');
  const sel = $('sel-prod');

  if (!tbodyProd || !tbodyAlertas || !sel) {
    console.error(
      'Faltan elementos del HTML: productos, tabla-alertas o sel-prod.'
    );
    return;
  }

  tbodyProd.replaceChildren();
  tbodyAlertas.replaceChildren();
  sel.replaceChildren();

  let countAlertas = 0;

  const categoriasUnicas = new Set();

  const buscador = $('buscador-catalogo');
  const textoFiltro = buscador
    ? buscador.value.trim().toLowerCase()
    : '';

  const optDefault = document.createElement('option');
  optDefault.value = '';
  optDefault.textContent = '-- Seleccionar producto --';

  sel.appendChild(optDefault);

  productos.forEach((p) => {
    const stockNum = Number(p.stock ?? 0);
    const minNum = Number(p.stock_minimo ?? 0);
    const bajo = stockNum <= minNum;

    const categoria = p.categoria || 'General';
    const codigo = String(p.codigo || '');
    const nombre = String(p.nombre || '');
    const subcategoria = String(p.subcategoria || '');
    const marca = String(p.marca || '');

    categoriasUnicas.add(categoria);

    const coincideCat =
      categoriaSeleccionada === 'Todas' ||
      categoria === categoriaSeleccionada;

    const textoCompleto = [
      codigo,
      nombre,
      categoria,
      subcategoria,
      marca,
      p.banda_toxicidad || ''
    ].join(' ').toLowerCase();

    const coincideTexto =
      !textoFiltro || textoCompleto.includes(textoFiltro);

    // Mostrar productos que coincidan con los filtros.
    if (coincideCat && coincideTexto) {
      tbodyProd.appendChild(fila([
        { texto: codigo },
        { texto: categoria },
        { texto: subcategoria || '-' },
        { texto: marca || 'Sin marca' },
        { texto: nombre },
        {
          texto: p.banda_toxicidad || '-',
          clase: obtenerClaseToxicidad(p.banda_toxicidad)
        },
        { texto: p.unidad || '-' },
        {
          html: `<span class="badge ${bajo ? 'bajo' : 'ok'}">${stockNum} ${bajo ? '⚠️' : ''}</span>`
        },
        { texto: minNum }
      ]));
    }

    // Mantener los productos activos disponibles
    // para registrar movimientos.
    if (p.activo) {
      const o = document.createElement('option');

      o.value = p.id;

      o.textContent =
        `[${categoria}] ` +
        `${subcategoria ? subcategoria + ' - ' : ''}` +
        `${marca ? marca + ' - ' : ''}` +
        `${nombre} (${codigo})`;

      sel.appendChild(o);
    }

    // Alertas de stock bajo.
    if (bajo) {
      countAlertas++;

      tbodyAlertas.appendChild(fila([
        { texto: codigo },
        { texto: categoria },
        { texto: subcategoria || '-' },
        { texto: marca || 'Sin marca' },
        { texto: nombre },
        {
          html: `<span class="badge bajo">${stockNum} (Bajo)</span>`
        },
        { texto: minNum }
      ]));
    }
  });

  // Mensaje cuando no hay alertas.
  if (countAlertas === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');

    td.colSpan = 7;
    td.style.textAlign = 'center';
    td.style.color = 'var(--mut)';
    td.textContent = 'No hay alertas de stock bajo. ¡Todo en orden!';

    tr.appendChild(td);
    tbodyAlertas.appendChild(tr);
  }

  // Actualizar indicadores del panel.
  const kpiProductos = $('kpi-total-prods');
  const kpiCategorias = $('kpi-total-cats');
  const kpiAlertas = $('kpi-alertas');

  if (kpiProductos) {
    kpiProductos.textContent = productos.length;
  }

  if (kpiCategorias) {
    kpiCategorias.textContent = categoriasUnicas.size;
  }

  if (kpiAlertas) {
    kpiAlertas.textContent = countAlertas;
    kpiAlertas.className =
      countAlertas > 0 ? 'kpi-card alerta' : 'kpi-card';
  }
}

// =====================================================
// HISTORIAL DE MOVIMIENTOS
// =====================================================

function renderizarHistorial(movimientos) {
  const tbodyHist = $('historial');

  if (!tbodyHist) return;

  tbodyHist.replaceChildren();

  const buscador = $('buscador-historial');

  const textoFiltro = buscador
    ? buscador.value.trim().toLowerCase()
    : '';

  const movsFiltrados = movimientos.filter((m) => {
    if (!textoFiltro) return true;

    const codigo = String(m.codigo || '').toLowerCase();
    const nombre = String(m.nombre || '').toLowerCase();
    const motivo = String(m.motivo || '').toLowerCase();
    const tipo = String(m.tipo || '').toLowerCase();

    return (
      codigo.includes(textoFiltro) ||
      nombre.includes(textoFiltro) ||
      motivo.includes(textoFiltro) ||
      tipo.includes(textoFiltro)
    );
  });

  movsFiltrados.slice(0, 40).forEach((m) => {
    const cantidad = Number(m.cantidad ?? 0);

    tbodyHist.appendChild(fila([
      {
        texto: m.creado_en
          ? new Date(m.creado_en).toLocaleString('es-AR')
          : '-'
      },
      {
        texto: `${m.codigo || ''} - ${m.nombre || ''}`.trim()
      },
      {
        texto: m.tipo || '-',
        clase: m.tipo === 'entrada'
          ? 'entrada'
          : m.tipo === 'salida'
            ? 'salida'
            : ''
      },
      { texto: cantidad },
      { texto: m.motivo || '-' },
      { texto: m.tarea_id ? `#${m.tarea_id}` : '-' }
    ]));
  });

  if (movsFiltrados.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');

    td.colSpan = 6;
    td.style.textAlign = 'center';
    td.style.color = 'var(--mut)';
    td.textContent = 'No se encontraron movimientos registrados.';

    tr.appendChild(td);
    tbodyHist.appendChild(tr);
  }
}

// =====================================================
// FILTROS DEL CATÁLOGO
// =====================================================

function filtrarCatalogo() {
  renderizarProductos(productosGlobal);
}

function cambiarFiltroSelect(cat) {
  categoriaSeleccionada = cat;

  document.querySelectorAll('#chips-categorias .chip').forEach((c) => {
    const esTodas = cat === 'Todas' && c.textContent.trim() === 'Todas';

    const coincide =
      esTodas ||
      (
        cat !== 'Todas' &&
        c.textContent.trim() === cat
      );

    c.classList.toggle('active', coincide);
  });

  renderizarProductos(productosGlobal);
}

function filtrarCategoria(cat, event) {
  categoriaSeleccionada = cat;

  document.querySelectorAll('#chips-categorias .chip').forEach((c) => {
    c.classList.remove('active');
  });

  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  }

  const selectCat = $('filtro-categoria-select');

  if (selectCat) {
    selectCat.value = cat;
  }

  renderizarProductos(productosGlobal);
}

function filtrarHistorial() {
  renderizarHistorial(historialGlobal);
}

// =====================================================
// ADAPTACIÓN DEL FORMULARIO DE PRODUCTOS
// =====================================================

function adaptarFormulario() {
  const selCat = $('sel-form-cat');
  const campoBanda = $('campo-banda');
  const selBanda = $('sel-banda');
  const inputSubcat = $('input-subcat');
  const datalist = $('lista-subcategorias');

  if (!selCat || !campoBanda || !selBanda || !inputSubcat || !datalist) {
    return;
  }

  const cat = selCat.value;

  if (cat === 'Agroquímicos y Fertilizantes') {
    campoBanda.style.display = 'grid';
  } else {
    campoBanda.style.display = 'none';
    selBanda.value = '';
  }

  datalist.replaceChildren();

  const opciones = opcionesPorCategoria[cat] || [];

  opciones.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt;
    datalist.appendChild(option);
  });

  if (cat === 'Agroquímicos y Fertilizantes') {
    inputSubcat.placeholder = 'Ej: Fitosanitarios, Fertilizantes...';
  } else if (cat === 'Plantas y Variedades') {
    inputSubcat.placeholder = 'Ej: Árboles, Florales...';
  } else if (cat === 'Macetas y Contenedores') {
    inputSubcat.placeholder = 'Ej: Plástico, Barro...';
  } else {
    inputSubcat.placeholder = 'Elegí o escribí subcategoría...';
  }
}

// =====================================================
// REGISTRO DE PRODUCTOS
// =====================================================

const formularioProducto = $('f-prod');

if (formularioProducto) {
  formularioProducto.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const d = Object.fromEntries(formData);

    // Asegurar que los campos opcionales vacíos se envíen
    // como valores vacíos y no se pierdan en el formulario.
    d.categoria = d.categoria || $('sel-form-cat')?.value || 'General';
    d.subcategoria = d.subcategoria || '';
    d.marca = d.marca || '';
    d.banda_toxicidad = d.banda_toxicidad || '';

    try {
      await api('/productos', {
        method: 'POST',
        body: JSON.stringify(d)
      });

      e.target.reset();

      adaptarFormulario();

      mensaje('¡Producto creado con éxito!', 'ok');

      await cargarDatos();

    } catch (err) {
      mensaje(err.message, 'error');
    }
  });
}

// =====================================================
// REGISTRO DE MOVIMIENTOS
// =====================================================

const formularioMovimiento = $('f-mov');

if (formularioMovimiento) {
  formularioMovimiento.addEventListener('submit', async (e) => {
    e.preventDefault();

    const d = Object.fromEntries(new FormData(e.target));

    d.producto_id = Number(d.producto_id);
    d.cantidad = Number(d.cantidad);
    d.tarea_id = d.tarea_id ? Number(d.tarea_id) : null;
    d.motivo = d.motivo || null;

    if (!Number.isInteger(d.producto_id) || d.producto_id <= 0) {
      mensaje('Seleccioná un producto válido.', 'error');
      return;
    }

    if (!Number.isFinite(d.cantidad) || d.cantidad === 0) {
      mensaje('Ingresá una cantidad válida distinta de cero.', 'error');
      return;
    }

    try {
      await api('/movimientos', {
        method: 'POST',
        body: JSON.stringify(d)
      });

      e.target.reset();

      mensaje('¡Movimiento registrado con éxito!', 'ok');

      await cargarDatos();

    } catch (err) {
      mensaje(err.message, 'error');
    }
  });
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

// Actualizar subcategorías y banda de toxicidad cuando
// cambia la categoría seleccionada.
const selectorCategoria = $('sel-form-cat');

if (selectorCategoria) {
  selectorCategoria.addEventListener('change', adaptarFormulario);
}

adaptarFormulario();

cargarDatos();