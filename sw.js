/* =========================================================
   КУТ: БИЗНЕС — Service Worker (sw.js)
   Простой кэш-first SW для PWA-режима.
   Обновление кэша — через смену CACHE_NAME.
   ========================================================= */

const CACHE_NAME = 'kut-biznes-v1.0.0';

// Файлы «оболочки» приложения — обязательны для офлайн-старта
const CORE_ASSETS = [
  './',
  './index.html',
  './cash.html',
  './stock.html',
  './debts.html',
  './css/style.css',
  './js/app.js',
  './js/lang.js',
  './js/cash.js',
  './js/stock.js',
  './js/debts.js',
  './manifest.json',
];

// ---------- Установка: кэшируем оболочку ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // allSettled — чтобы одна 404-ка не сломала всю установку
      return Promise.allSettled(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Не удалось закэшировать:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ---------- Активация: удаляем старые кэши ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- Fetch: кэш-first с фоллбэком на сеть ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Работаем только с GET и только со своим origin
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Для HTML-страниц — network-first, чтобы юзер всегда видел свежие данные
  // (актуально для localStorage-приложения; можно и cache-first)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Для остальных ресурсов — cache-first
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => {
        // Офлайн — отдаём index.html для навигации
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

// ---------- Сообщения от страницы (ручное обновление) ----------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
