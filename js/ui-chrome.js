/* =========================================================
   КУТ: БИЗНЕС — UI Chrome v9.4.2
   • Заголовок страницы
   • Иконка темы в шапке шторки
   • Жёсткая зачистка всех .theme-toggle по всему DOM
   ========================================================= */

(function () {
  'use strict';

  const PAGE_TITLES = {
    'index.html':     'Главная',
    '':               'Главная',
    'cash.html':      'Касса',
    'stock.html':     'Склад',
    'debts.html':     'Несие',
    'staff.html':     'Сотрудники',
    'login.html':     'Вход',
    'register.html':  'Регистрация',
    'demo.html':      'Демо',
    'admin.html':     'Админ-панель',
    'diag.html':      'Диагностика',
  };

  function currentFile() {
    const parts = (window.location.pathname || '').split('/');
    const f = (parts.pop() || 'index.html').toLowerCase();
    return f || 'index.html';
  }

  function setPageTitle() {
    const el = document.getElementById('page-title');
    const title = PAGE_TITLES[currentFile()] || 'Главная';
    if (el) el.textContent = title;
    document.title = title + ' — КУТ: БИЗНЕС';
  }

  // Убираем ВСЕ .theme-toggle, кроме того, что создаёт сам ui-chrome
  function removeOldThemeToggles() {
    document.querySelectorAll('.theme-toggle').forEach((el) => {
      const parent = el.parentElement;
      const inBrandRow = parent && parent.classList.contains('sidebar__brand-row');
      if (!inBrandRow) el.remove();
    });
    // Осиротевшие внутренние части старой кнопки
    document.querySelectorAll('.sidebar-theme__text, .sidebar-theme__chevron').forEach((el) => {
      if (!el.closest('.sidebar-theme')) el.remove();
    });
  }

  function updateThemeButton(btn, theme) {
    const isLight = theme === 'light';
    btn.textContent = isLight ? '☀️' : '🌙';
    btn.setAttribute('aria-label', isLight ? 'Включить тёмную тему' : 'Включить светлую тему');
    btn.setAttribute('title',       isLight ? 'Тёмная тема'         : 'Светлая тема');
  }

  function mountSidebarThemeToggle() {
    const themeApi = window.KUT_THEME;
    if (!themeApi || typeof themeApi.toggle !== 'function') return;

    const slot = document.getElementById('sidebar-theme-slot');
    if (!slot) return;

    if (slot.querySelector('.sidebar-theme')) {
      updateThemeButton(slot.querySelector('.sidebar-theme'), themeApi.get());
      return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-theme';
    btn.textContent = '🌙';
    updateThemeButton(btn, themeApi.get());

    btn.addEventListener('click', () => {
      themeApi.toggle();
      updateThemeButton(btn, themeApi.get());
    });

    slot.appendChild(btn);
  }

  function ensureBurgerWorks() {
    const burger = document.getElementById('burger');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!burger || !sidebar) return;
    if (burger.dataset.wired === '1') return;

    setTimeout(() => {
      if (burger.dataset.wired === '1') return;
      burger.addEventListener('click', () => {
        const isOpen = sidebar.classList.toggle('is-open');
        if (overlay) overlay.classList.toggle('is-open', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
      });
      if (overlay) {
        overlay.addEventListener('click', () => {
          sidebar.classList.remove('is-open');
          overlay.classList.remove('is-open');
          document.body.style.overflow = '';
        });
      }
    }, 300);
  }

  function boot() {
    setPageTitle();
    removeOldThemeToggles();
    mountSidebarThemeToggle();
    ensureBurgerWorks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('load', () => {
    setTimeout(() => { removeOldThemeToggles(); mountSidebarThemeToggle(); }, 400);
    setTimeout(() => { removeOldThemeToggles(); mountSidebarThemeToggle(); }, 1200);
    setTimeout(() => { removeOldThemeToggles(); mountSidebarThemeToggle(); }, 2500);
  });
})();
