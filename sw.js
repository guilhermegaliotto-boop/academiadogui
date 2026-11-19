// Service worker: funciona offline e guarda as fotos das máquinas depois da primeira vez.
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const IMGS = 'machine-photos';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'catalog.js', 'sync.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // fotos do catálogo: cache primeiro
  if (url.hostname === 'assets.cimerianofficial.com') {
    e.respondWith(
      caches.open(IMGS).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request, { mode: 'no-cors' });
        c.put(e.request, res.clone());
        return res;
      }),
    );
    return;
  }

  // arquivos do app: rede primeiro (pega atualizações), cache se offline
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./'))),
    );
  }
});
