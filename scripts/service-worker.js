/* Generated with immutable build assets. The worker may update; the selected game does not. */
const BUILD = __SW_BUILD__;
const FILES = __SW_FILES__;
const PREFIX = 'scrap-idle-build-';
const META = 'scrap-idle-release-selection';
const scope = new URL(self.registration.scope);
const selectionURL = new URL('_selected', scope).href;
const readyURL = new URL('_ready', scope).href;
const cacheName = PREFIX + BUILD;
async function selected() {
  const saved = await (await caches.open(META)).match(selectionURL);
  return saved ? saved.text() : null;
}
async function choose(build) {
  await (await caches.open(META)).put(selectionURL, new Response(build));
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  // Fail the install if any file is unavailable: never select a partial build.
  await cache.addAll(FILES.map(file => new Request(new URL(file, scope), { cache: 'reload' })));
  await cache.put(readyURL, new Response('ready'));
  if (!await selected()) await choose(BUILD);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type !== 'SELECT_BUILD') return;
  event.waitUntil((async () => {
    const build = event.data.build;
    const valid = typeof build === 'string' && /^[a-zA-Z0-9-]+$/.test(build);
    const ready = valid && await caches.has(PREFIX + build) && await (await caches.open(PREFIX + build)).match(readyURL);
    if (ready) await choose(build);
    event.ports[0]?.postMessage({ ok: Boolean(ready) });
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Release discovery must always reach the server, not the pinned game cache.
  if (url.pathname === new URL('version.json', scope).pathname || url.pathname === new URL('sw.js', scope).pathname) return;
  event.respondWith((async () => {
    const build = await selected();
    if (build) {
      const cache = await caches.open(PREFIX + build);
      const key = event.request.mode === 'navigate' ? new URL('index.html', scope).href : url.origin + url.pathname;
      const response = await cache.match(key);
      if (response) return response;
      // An already-open older tab can still request its own immutable chunks.
      for (const name of await caches.keys()) {
        if (!name.startsWith(PREFIX) || name === PREFIX + build) continue;
        const previous = await (await caches.open(name)).match(key);
        if (previous) return previous;
      }
      if (event.request.mode === 'navigate') {
        return new Response('Сохранённая версия недоступна. Восстановите данные сайта или откройте игру после подключения к сети.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    }
    return fetch(event.request);
  })());
});
