// While a deploy restarts the server (a few seconds to a couple of minutes: the database lives on a
// disk only one server can hold, so the old one stops before the new one starts), Render answers
// with its own "Bad Gateway" page. This worker shows ours instead: "Il sistema è in aggiornamento",
// which reloads by itself once the site is back. It only steps in on page loads that fail; nothing
// else goes through it and nothing of the app is cached.
const CACHE = 'rientro-aggiornamento-1';
const PAGE = '/aggiornamento/index.html';
const FILES = [PAGE, '/aggiornamento/aggiornamento.css', '/aggiornamento/aggiornamento.js', '/fonts/fonts.css', '/favicon.svg',
  '/fonts/geist-latin-400-normal.woff2', '/fonts/geist-latin-500-normal.woff2', '/fonts/geist-mono-latin-400-normal.woff2',
  '/fonts/unbounded-latin-600-normal.woff2', '/fonts/instrument-serif-latin-400-italic.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const DOWN = new Set([502, 503, 504]);
const fallback = () => caches.match(PAGE).then(r => r && new Response(r.body, { status: 503, headers: r.headers }));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin === location.origin && FILES.includes(url.pathname)) {
    // The page's own files: from the cache when the server is down
    e.respondWith(fetch(req).then(r => (DOWN.has(r.status) ? caches.match(req).then(c => c || r) : r)).catch(() => caches.match(req)));
    return;
  }
  if (req.mode !== 'navigate') return;
  e.respondWith(fetch(req).then(r => (DOWN.has(r.status) ? fallback().then(f => f || r) : r)).catch(() => fallback().then(f => f || Response.error())));
});
