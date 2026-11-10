const CACHE = 'stock-shell-v7';
const SHELL = [
  '/', '/index.html', '/login.css', '/premium.css', '/offline.js', '/logo.png',
  '/ubicaciones.html', '/interfaz-ubicaciones.css', '/mapa-cantero.css',
  '/formularios.js', '/mapa-cantero.js', '/plantas-ficha.js', '/ubicaciones.js', '/ejemplo-cantero-qr.svg',
  '/ejemplo-cantero.html', '/ejemplo-cantero.js', '/ejemplo-mapa.html'
];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        if (url.pathname.startsWith('/invernaderos') || url.pathname.startsWith('/etiquetas') || url.pathname.startsWith('/canteros')) {
          return caches.match('/ubicaciones.html');
        }
        return caches.match('/index.html');
      }
      return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }))
  );
});
