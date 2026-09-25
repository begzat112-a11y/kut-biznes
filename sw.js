/* =========================================================
   КУТ: БИЗНЕС — Service Worker (sw.js)
   Версия кэша: kut-biznes-v3.2.0
   Стратегия:
   • HTML — network-first (всегда свежие данные)
   • Остальное — cache-first с фоллбэком на сеть
   ========================================================= */

const CACHE_NAME = 'kut-biznes-v3.3.0';

const CORE_ASSETS = [
  './',
  './index.html',
  './login.html',
  './cash.html',
  './stock.html',
  './debts.html',
  './css/style.css',
  './js/firebase-config.js',
  './js/app.js',
  './js/lang.js',
  './js/cash.js',
  './js/stock.js',
  './js/debts.js',
  './manifest.json',
];

// ---------- Установка ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Не удалось закэшировать:', url, err);
          })
        )
      ))
      .then(() => self.skipWaiting())
  );
});

// ---------- Активация ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ---------- Fetch ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Пропускаем запросы на чужие домены
  // (Firebase, Google Fonts, Green-API — они идут напрямую в сеть)
  if (url.origin !== self.location.origin) return;

  // HTML — network-first
  if (req.mode === 'navigate' ||
      (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  // Остальное — cache-first
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// ---------- Сообщения от страницы ----------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
