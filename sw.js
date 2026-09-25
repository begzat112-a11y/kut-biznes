/* =========================================================
   КУТ: БИЗНЕС — Service Worker (минимальный, installable)
   Задача: гарантированно пройти проверку Chrome на Android.
   Кэширование — опционально, установка от него не зависит.
   ========================================================= */

const CACHE_NAME = 'kut-biznes-v1.1.0';

const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/lang.js',
  './manifest.json',
];

// ---------- Установка ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
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

// ---------- Обработчик fetch — обязателен для Android ----------
// Chrome на Android по-прежнему требует наличия обработчика fetch,
// даже если он просто передаёт запрос в сеть.
// https://developer.chrome.com/blog/update-install-criteria
self.addEventListener('fetch', (event) => {
  // Пропускаем не-GET запросы
  if (event.request.method !== 'GET') return;

  // Пропускаем запросы на чужие домены
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        // Офлайн-фоллбэк для навигации
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
