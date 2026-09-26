/* =========================================================
   КУТ: БИЗНЕС — UI Chrome v9.4.1
   • Динамический заголовок страницы
   • Компактная иконка темы справа от бренда (без текста)
   • Жёсткая зачистка всех старых .theme-toggle
   • Страховка для бургера
   ========================================================= */

(function () {
  'use strict';

  // =========================================================
  // 1. ЗАГОЛОВКИ СТРАНИЦ
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
  // 2. УБИРАЕМ ВСЕ СТАРЫЕ .theme-toggle ГДЕ БЫ ОНИ НИ БЫЛИ
  //    (в шапке, в сайдбаре, в футере — везде)
  // =========================================================
  function removeOldThemeToggles() {
    // Удаляем все .theme-toggle, которые НЕ создал наш mountSidebarThemeToggle
    // (наш имеет родителя .sidebar__brand-row и не имеет старой структуры)
    document.querySelectorAll('.theme-toggle').forEach((el) => {
      const parent = el.parentElement;
      const inBrandRow = parent && parent.classList.contains('sidebar__brand-row');
      if (!inBrandRow) el.remove();
    });

    // Дополнительная чистка — осиротевшие слоты со старой плашкой
    document.querySelectorAll('.sidebar-theme__text, .sidebar-theme__chevron, .sidebar-theme__icon').forEach((el) => {
      // Удаляем только если это «голый» слот вне .sidebar-theme
      if (!el.closest('.sidebar-theme')) el.remove();
    });
  }

  // =========================================================
  // 3. МОНТИРУЕМ ИКОНКУ ТЕМЫ СПРАВА ОТ БРЕНДА
  // =========================================================
  function mountSidebarThemeToggle() {
    const themeApi = window.KUT_THEME;
    if (!themeApi || typeof themeApi.toggle !== 'function') return;

    const slot = document.getElementById('sidebar-theme-slot');
    if (!slot) return;

    // Уже смонтировано?
    if (slot.querySelector('.sidebar-theme')) {
      updateThemeButton(slot.querySelector('.sidebar-theme'), themeApi.get());
      return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-theme';
    btn.textContent = '🌙';
    btn.setAttribute('aria-label', 'Переключить тему');
    btn.setAttribute('title', 'Переключить тему');

    updateThemeButton(btn, themeApi.get());

    btn.addEventListener('click', () => {
      themeApi.toggle();
      updateThemeButton(btn, themeApi.get());
    });

    slot.appendChild(btn);
  }

  function updateThemeButton(btn, theme) {
    const isLight = theme === 'light';
    btn.textContent = isLight ? '☀️' : '🌙';
    btn.setAttribute('aria-label', isLight ? 'Включить тёмную тему' : 'Включить светлую тему');
    btn.setAttribute('title',       isLight ? 'Тёмная тема'         : 'Светлая тема');
  }

  // =========================================================
  // 4. СТРАХОВКА ДЛЯ БУРГЕРА
  // =========================================================
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

  // =========================================================
  // 5. ЗАПУСК
  // =========================================================
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

  // Подстраховки — если DOM подгружается медленно или app.js перерисовывает сайдбар
  window.addEventListener('load', () => {
    setTimeout(() => { removeOldThemeToggles(); mountSidebarThemeToggle(); }, 400);
    setTimeout(() => { removeOldThemeToggles(); mountSidebarThemeToggle(); }, 1200);
    setTimeout(() => { removeOldThemeToggles(); mountSidebarThemeToggle(); }, 2500);
  });
})();
