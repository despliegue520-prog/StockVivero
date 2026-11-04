(() => {
  const QUEUE_KEY = 'stock-offline-queue-v1';
  const CACHE_KEY = 'stock-offline-cache-v1';

  function leer(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
  function guardar(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function esCambio(options = {}) { return ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase()); }
  function headersBase(options = {}) { return { ...(options.headers || {}), 'Content-Type': 'application/json' }; }
  function mensajeOffline(texto) { window.dispatchEvent(new CustomEvent('stock-offline-status', { detail: texto })); }
  window.addEventListener('stock-offline-status', event => {
    if (!document.body) return;
    let aviso = document.getElementById('aviso-offline');
    if (!aviso) { aviso = document.createElement('div'); aviso.id = 'aviso-offline'; aviso.style.cssText = 'position:fixed;right:1rem;bottom:1rem;z-index:9999;max-width:360px;padding:.8rem 1rem;border-radius:10px;background:#142f29;color:#fff;font:600 .82rem system-ui;box-shadow:0 8px 25px #142f2940'; document.body.append(aviso); }
    aviso.textContent = event.detail;
    clearTimeout(aviso._timer); aviso._timer = setTimeout(() => aviso.remove(), 5000);
  });

  async function cachear(path, data) { const cache = leer(CACHE_KEY, {}); cache[path] = { data, guardado: Date.now() }; guardar(CACHE_KEY, cache); }
  async function desdeCache(path) { return leer(CACHE_KEY, {})[path]?.data ?? null; }

  async function encolar(path, options = {}) {
    const cola = leer(QUEUE_KEY, []);
    cola.push({ id: crypto.randomUUID(), path, options: { ...options, headers: headersBase(options) }, creado: Date.now() });
    guardar(QUEUE_KEY, cola);
    mensajeOffline('Guardado sin conexión. Se sincronizará cuando vuelva Internet.');
    return { queued: true, offline: true };
  }

  async function enviar(path, options = {}) {
    const headers = headersBase(options);
    const token = sessionStorage.getItem('authToken');
    const apiKey = sessionStorage.getItem('apiKey');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (apiKey) headers['x-api-key'] = apiKey;
    return fetch(path, { ...options, headers, credentials: 'same-origin' });
  }

  window.stockOffline = {
    async request(path, options = {}) {
      try {
        const response = await enviar(path, options);
        if (response.ok) {
          if (!esCambio(options)) await cachear(path, await response.clone().json().catch(() => null));
          return response;
        }
        return response;
      } catch (err) {
        if (esCambio(options)) return { ok: true, status: 202, offline: true, json: async () => encolar(path, options) };
        const cached = await desdeCache(path);
        if (cached !== null) return { ok: true, status: 200, offline: true, json: async () => cached };
        throw err;
      }
    },
    async sincronizar() {
      const cola = leer(QUEUE_KEY, []);
      if (!cola.length || !navigator.onLine) return;
      const pendientes = [];
      for (const item of cola) {
        try {
          const response = await enviar(item.path, item.options);
          if (!response.ok && response.status >= 400 && response.status < 500) continue;
          if (!response.ok) throw new Error('Servidor no disponible');
        } catch { pendientes.push(item); }
      }
      guardar(QUEUE_KEY, pendientes);
      if (pendientes.length) mensajeOffline(`${pendientes.length} operación(es) siguen pendientes de sincronizar.`);
      else if (cola.length) mensajeOffline('Todo sincronizado correctamente.');
    },
    pendientes() { return leer(QUEUE_KEY, []).length; },
  };

  window.addEventListener('online', () => window.stockOffline.sincronizar());
  window.addEventListener('offline', () => mensajeOffline('Sin conexión. Los cambios se guardarán en este dispositivo.'));
  window.addEventListener('load', () => window.stockOffline.sincronizar());
})();
