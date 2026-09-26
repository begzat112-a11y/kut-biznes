/* =========================================================
   КУТ: БИЗНЕС — UI Chrome v9.3
   Глобальная логика шапки и шторки:
   • Динамический заголовок страницы
   • Компактная иконка темы справа от бренда (без текста)
   • Страховка для бургера, если app.js не успел
   ========================================================= */

(function () {
  'use strict';

  // =========================================================
  // 1. КАРТА ЗАГОЛОВКОВ ПО ИМЕНИ ФАЙЛА
  // =========================================================
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

  // =========================================================
  // 2. УБИРАЕМ СТАРЫЙ TOGGLE ИЗ ШАПКИ, ЕСЛИ ОСТАЛСЯ В HTML
  // =========================================================
  function removeOldHeaderToggle() {
    document
      .querySelectorAll('.mobile-bar .theme-toggle, .topbar .theme-toggle, .header-panel .theme-toggle')
      .forEach((el) => el.remove());
  }

  // =========================================================
  // 3. КОМПАКТНАЯ ИКОНКА ТЕМЫ В ШАПКЕ ШТОРКИ
  //    (справа от «КУТ: БИЗНЕС», без текста)
  // =========================================================
  function mountSidebarThemeToggle() {
    const themeApi = window.KUT_THEME;
    if (!themeApi || typeof themeApi.toggle !== 'function') return;

    const slot = document.getElementById('sidebar-theme-slot');
    if (!slot) return;
    if (slot.querySelector('.sidebar-theme')) return; // уже смонтирована

    const isLight = themeApi.get() === 'light';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-theme';
    btn.setAttribute('aria-label', isLight ? 'Включить тёмную тему' : 'Включить светлую тему');
    btn.setAttribute('title',       isLight ? 'Тёмная тема'         : 'Светлая тема');
    btn.textContent = isLight ? '☀️' : '🌙';

    btn.addEventListener('click', () => {
      themeApi.toggle();
      const nowLight = themeApi.get() === 'light';
      btn.textContent = nowLight ? '☀️' : '🌙';
      btn.setAttribute('aria-label', nowLight ? 'Включить тёмную тему' : 'Включить светлую тему');
      btn.setAttribute('title',       nowLight ? 'Тёмная тема'         : 'Светлая тема');
    });

    slot.appendChild(btn);
  }

  // =========================================================
  // 4. СТРАХОВКА ДЛЯ БУРГЕРА
  // =========================================================
  function ensureBurgerWorks() {
    const burger = document.getElementById('burger');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!burger || !sidebar) return;

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

  // =========================================================
  // 5. ЗАПУСК
  // =========================================================
  function boot() {
    setPageTitle();
    removeOldHeaderToggle();
    mountSidebarThemeToggle();
    ensureBurgerWorks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('load', () => {
    setTimeout(mountSidebarThemeToggle, 400);
    setTimeout(mountSidebarThemeToggle, 1200);
  });
})();
