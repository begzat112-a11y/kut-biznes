/* =========================================================
   КУТ: БИЗНЕС — Переключатель темы (Day / Night)
   Логика:
   • При загрузке читаем localStorage.kut_theme
   • Если не задан — берём prefers-color-scheme
   • Ставим data-theme="dark"|"light" на <html>
   • Клик по .theme-toggle — переключает и сохраняет
   • Работает на всех страницах без изменений app.js
   ========================================================= */

(function () {
  'use strict';

  const STORAGE_KEY = 'kut_theme';
  const ICON_DARK   = '🌙';  // сейчас тёмная — покажем луну
  const ICON_LIGHT  = '☀️';  // сейчас светлая — покажем солнце

  function getSaved() {
    try { return localStorage.getItem(STORAGE_KEY); }
    catch (_) { return null; }
  }

  function save(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
  }

  function detectSystem() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    } catch (_) {}
    return 'dark';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Обновляем meta theme-color под шапку
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#FFFFFF' : '#0A1F18');
    // Обновляем иконку во всех кнопках
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.textContent = theme === 'light' ? ICON_LIGHT : ICON_DARK;
      btn.setAttribute('aria-label', theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему');
      btn.setAttribute('title',       theme === 'light' ? 'Тёмная тема'         : 'Светлая тема');
    });
  }

  function toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    save(next);
    apply(next);
  }

  // Первичная установка — как можно раньше, до первого рендера
  const initial = getSaved() || detectSystem();
  apply(initial);

  // Реакция на системные изменения, если пользователь не задавал вручную
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (getSaved()) return; // пользователь выбрал вручную — не перебиваем
      apply(e.matches ? 'light' : 'dark');
    });
  } catch (_) {}

  // Делегирование кликов (работает даже для кнопок, добавленных позже)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.theme-toggle');
    if (!btn) return;
    e.preventDefault();
    toggle();
  });

  // Публичный API — пригодится для отладки
  window.KUT_THEME = {
    get: () => document.documentElement.getAttribute('data-theme'),
    set: (t) => { save(t); apply(t); },
    toggle,
  };
})();
