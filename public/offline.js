(() => {
  const API_BASE_URL = (['capacitor:', 'ionic:'].includes(location.protocol) || (location.hostname === 'localhost' && !location.port))
    ? 'https://controldestock.viverolosaromos.com.ar' : '';
  window.stockApiUrl = path => /^https?:\/\//i.test(path) ? path : API_BASE_URL + path;
  window.stockApiCredentials = API_BASE_URL ? 'omit' : 'same-origin';

  const DB_NAME = 'stock-offline-db';
  const DB_VERSION = 1;
  const CACHE_STORE = 'responses';
  const QUEUE_STORE = 'operations';
  const CACHE_MAX_AGE = 30 * 60 * 1000;
  let dbPromise;
  let pendientesActuales = 0;
  let sincronizacionActiva = false;

  function abrirDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: 'path' });
        if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function transaccion(store, mode, accion) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = accion(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function esCambio(options = {}) {
    return ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase());
  }

  function eliminaProducto(path, options = {}) {
    return (options.method || '').toUpperCase() === 'DELETE' && /^\/productos\/\d+\/?$/.test(path);
  }

  async function invalidarCache() {
    try {
      const registros = await transaccion(CACHE_STORE, 'readonly', store => store.getAll());
      for (const registro of registros) {
        await transaccion(CACHE_STORE, 'readwrite', store => store.delete(registro.path));
      }
    } catch { /* Una falla local no revierte una operación ya confirmada por el servidor. */ }
  }

  function headersBase(options = {}) {
    return { ...(options.headers || {}), 'Content-Type': 'application/json' };
  }

  function opcionesSinCredenciales(options = {}) {
    const headers = headersBase(options);
    delete headers.Authorization;
    delete headers.authorization;
    delete headers['x-api-key'];
    delete headers['X-API-Key'];
    return { ...options, headers };
  }

  function mensajeOffline(texto) {
    window.dispatchEvent(new CustomEvent('stock-offline-status', { detail: texto }));
  }

  async function listarPendientes() {
    try { return await transaccion(QUEUE_STORE, 'readonly', store => store.getAll()); } catch { return []; }
  }

  async function actualizarIndicador() {
    const indicador = document.getElementById('estado-conexion');
    if (!indicador) return;
    const pendientes = (await listarPendientes()).length;
    pendientesActuales = pendientes;
    indicador.textContent = navigator.onLine
      ? (pendientes ? `Conectado · ${pendientes} pendiente${pendientes === 1 ? '' : 's'}` : 'Conectado')
      : `Sin conexión${pendientes ? ` · ${pendientes} pendiente${pendientes === 1 ? '' : 's'}` : ''}`;
    indicador.dataset.estado = navigator.onLine ? 'online' : 'offline';
    indicador.style.background = navigator.onLine ? '#28604e' : '#8a592e';
  }

  window.addEventListener('stock-offline-status', event => {
    if (!document.body) return;
    let aviso = document.getElementById('aviso-offline');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.id = 'aviso-offline';
      aviso.style.cssText = 'position:fixed;right:1rem;bottom:1rem;z-index:9999;max-width:360px;padding:.8rem 1rem;border-radius:10px;background:#142f29;color:#fff;font:600 .82rem system-ui;box-shadow:0 8px 25px #142f2940';
      document.body.append(aviso);
    }
    aviso.textContent = event.detail;
    clearTimeout(aviso._timer);
    aviso._timer = setTimeout(() => aviso.remove(), 5000);
    actualizarIndicador();
  });

  function montarIndicador() {
    if (!document.body || document.getElementById('estado-conexion')) return;
    const indicador = document.createElement('div');
    indicador.id = 'estado-conexion';
    indicador.setAttribute('role', 'status');
    indicador.style.cssText = 'position:fixed;left:1rem;bottom:1rem;z-index:1000;padding:.35rem .7rem;border:1px solid #ffffff30;border-radius:999px;background:#142f29;color:#e9f4ea;font:700 .7rem system-ui;box-shadow:0 4px 12px #142f2930;transition:background .2s,color .2s';
    document.body.append(indicador);
    actualizarIndicador();
  }

  async function cachear(path, data) {
    try { await transaccion(CACHE_STORE, 'readwrite', store => store.put({ path, data, guardado: Date.now() })); } catch { /* El modo online sigue funcionando aunque el almacenamiento falle. */ }
  }

  async function desdeCache(path) {
    try {
      const registro = await transaccion(CACHE_STORE, 'readonly', store => store.get(path));
      if (!registro || Date.now() - registro.guardado > CACHE_MAX_AGE) return null;
      return registro.data ?? null;
    } catch { return null; }
  }

  async function encolar(path, options = {}) {
    const item = { id: crypto.randomUUID(), path, options: opcionesSinCredenciales(options), creado: Date.now(), intentos: 0 };
    await transaccion(QUEUE_STORE, 'readwrite', store => store.put(item));
    mensajeOffline('Guardado sin conexión. Se sincronizará cuando vuelva Internet.');
    return { queued: true, offline: true };
  }

  async function enviar(path, options = {}) {
    const headers = headersBase(options);
    const token = sessionStorage.getItem('authToken');
    const apiKey = sessionStorage.getItem('apiKey');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (apiKey) headers['x-api-key'] = apiKey;
    return fetch(window.stockApiUrl(path), { ...options, headers, credentials: window.stockApiCredentials });
  }

  window.stockOffline = {
    async request(path, options = {}) {
      if (eliminaProducto(path, options) && !navigator.onLine) throw new Error('Necesitás conexión para eliminar un producto del stock.');
      if (esCambio(options) && !navigator.onLine) {
        const queued = await encolar(path, options);
        return { ok: true, status: 202, offline: true, json: async () => queued };
      }
      try {
        const response = await enviar(path, options);
        if (response.ok && esCambio(options)) await invalidarCache();
        if (response.ok && !esCambio(options)) await cachear(path, await response.clone().json().catch(() => null));
        if (!response.ok && !esCambio(options) && response.status >= 500) {
          const cached = await desdeCache(path);
          if (cached !== null) {
            mensajeOffline('Mostrando la última información guardada en este dispositivo.');
            return { ok: true, status: 200, offline: true, json: async () => cached };
          }
        }
        return response;
      } catch (err) {
        if (eliminaProducto(path, options)) throw new Error('No se pudo confirmar la eliminación. Reconectate y actualizá el listado antes de reintentar.');
        if (esCambio(options)) {
          const queued = await encolar(path, options);
          return { ok: true, status: 202, offline: true, json: async () => queued };
        }
        const cached = await desdeCache(path);
        if (cached !== null) {
          mensajeOffline('Mostrando la última información guardada en este dispositivo.');
          return { ok: true, status: 200, offline: true, json: async () => cached };
        }
        throw err;
      }
    },

    async sincronizar() {
      if (sincronizacionActiva) return;
      sincronizacionActiva = true;
      try {
        const cola = await listarPendientes();
        if (!cola.length || !navigator.onLine) { await actualizarIndicador(); return; }
        let sincronizadas = 0;
        const errores = [];
        for (const item of cola.sort((a, b) => a.creado - b.creado)) {
          try {
            const response = await enviar(item.path, item.options);
            if (!response.ok) {
              const detalle = await response.clone().json().catch(() => ({}));
              throw new Error(detalle.error || `HTTP ${response.status}`);
            }
            await transaccion(QUEUE_STORE, 'readwrite', store => store.delete(item.id));
            sincronizadas++;
          } catch (error) {
            item.intentos = (item.intentos || 0) + 1;
            item.ultimoIntento = Date.now();
            item.ultimoError = error.message;
            await transaccion(QUEUE_STORE, 'readwrite', store => store.put(item));
            errores.push(error.message);
          }
        }
        if (sincronizadas) await invalidarCache();
        const restantes = await listarPendientes();
        if (restantes.length) {
          const detalle = errores.length ? ` Motivo: ${errores[0]}.` : '';
          mensajeOffline(`${restantes.length} operación(es) siguen pendientes de sincronizar.${detalle}`);
        }
        else if (sincronizadas) mensajeOffline('Todo sincronizado correctamente.');
        await actualizarIndicador();
      } finally {
        sincronizacionActiva = false;
      }
    },

    pendientes() { return pendientesActuales; },
    async pendientesAsync() { return (await listarPendientes()).length; },
  };

  window.addEventListener('online', () => { window.stockOffline.sincronizar(); });
  window.addEventListener('offline', () => mensajeOffline('Sin conexión. Los cambios se guardarán en este dispositivo.'));
  window.addEventListener('load', async () => {
    montarIndicador();
    await abrirDB().catch(() => {});
    await actualizarIndicador();
    window.stockOffline.sincronizar();
    window.setInterval(() => {
      if (navigator.onLine) window.stockOffline.sincronizar();
    }, 15000);
  });
})();
