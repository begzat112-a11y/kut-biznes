/* =========================================================
   theme.js v2.0 — Единый переключатель День/Ночь
   Ставит data-theme ДО первой отрисовки (нет мерцания).
   ========================================================= */

(function () {
  'use strict';

  const KEY = 'kut_theme';
  const ICON_DARK  = '🌙';
  const ICON_LIGHT = '☀️';

  function saved() { try { return localStorage.getItem(KEY); } catch (_) { return null; } }
  function save(t) { try { localStorage.setItem(KEY, t); } catch (_) {} }
  function detect() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    } catch (_) {}
    return 'dark';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#FFFFFF' : '#0A1F18');
    document.querySelectorAll('.theme-toggle, .sidebar-theme').forEach((btn) => {
      btn.textContent = theme === 'light' ? ICON_LIGHT : ICON_DARK;
      btn.setAttribute('aria-label', theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему');
    });
  }

  function toggle() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    save(next);
    apply(next);
    // Синхронизация между вкладками
    try { localStorage.setItem(KEY + '_ts', String(Date.now())); } catch (_) {}
  }

  // 🚀 Синхронная установка ДО первого рендера
  apply(saved() || detect());

  // Слушаем изменения в других вкладках (полная синхронизация)
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) apply(e.newValue);
  });

  // Реакция на системные изменения (если юзер не выбирал вручную)
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (saved()) return;
      apply(e.matches ? 'light' : 'dark');
    });
  } catch (_) {}

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.theme-toggle, .sidebar-theme');
    if (!btn) return;
    e.preventDefault();
    toggle();
  });

  window.KUT_THEME = {
    get: () => document.documentElement.getAttribute('data-theme'),
    set: (t) => { save(t); apply(t); },
    toggle,
    apply,
  };
})();
