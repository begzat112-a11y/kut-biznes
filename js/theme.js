/* =========================================================
   theme.js v10.3 — Единый переключатель День/Ночь (NexusBiz)
   
   • Гарантированная работа toggle
   • Синхронизация между вкладками
   • Синхронное применение ДО первой отрисовки
   • Публичный API: window.KUT_THEME
   • Совместим с ui-chrome.js (segmented control)
   ========================================================= */

(function () {
  'use strict';

  const KEY = 'kut_theme';
  const ICON_DARK  = '🌙';
  const ICON_LIGHT = '☀️';

  function saved() {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  }
  function save(t) {
    try { localStorage.setItem(KEY, t); } catch (_) {}
  }
  function detect() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    } catch (_) {}
    return 'dark';
  }

  function apply(theme) {
    if (theme !== 'light' && theme !== 'dark') theme = 'dark';

    document.documentElement.setAttribute('data-theme', theme);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#FFFFFF' : '#0A1F18');

    document.querySelectorAll('.theme-toggle, .sidebar-theme, .sidebar-theme-toggle').forEach((btn) => {
      const icon = btn.querySelector('.sidebar-theme-toggle__label');
      if (icon) {
        icon.textContent = theme === 'light' ? '☀️ День' : '🌙 Ночь';
      } else {
        btn.textContent = theme === 'light' ? ICON_LIGHT : ICON_DARK;
      }
      btn.setAttribute('aria-label',
        theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему');
      btn.setAttribute('title',
        theme === 'light' ? 'Тёмная тема' : 'Светлая тема');
      btn.setAttribute('aria-checked', String(theme === 'light'));
    });
  }

  function toggle() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    save(next);
    apply(next);
    try { localStorage.setItem(KEY + '_ts', String(Date.now())); } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('kut:theme', { detail: { theme: next } }));
    } catch (_) {}
    return next;
  }

  apply(saved() || detect());

  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) apply(e.newValue);
  });

  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (saved()) return;
      apply(e.matches ? 'light' : 'dark');
    });
  } catch (_) {}

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest(
      '.theme-toggle, .sidebar-theme, .sidebar-theme-toggle'
    );
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }, true);

  window.KUT_THEME = {
    get: () => document.documentElement.getAttribute('data-theme') || 'dark',
    set: (t) => { save(t); apply(t); },
    toggle,
    apply,
  };

  console.info('[NexusBiz theme] v10.3 · текущая тема:', window.KUT_THEME.get());
})();
