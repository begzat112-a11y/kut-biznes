/* =========================================================
   КУТ: БИЗНЕС — UI Chrome v10.2 «Aurora»
   
   • Единый глобальный хедер
   • Динамический заголовок страницы
   • Кнопка темы — toggle-переключатель ВНУТРИ сайдбара
   • ЗАЩИТА от двойного обработчика на #burger
   • Гарантированные тап-зоны 48×48
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

  const currentFile = () => {
    const f = (window.location.pathname || '').split('/').pop().toLowerCase();
    return f || 'index.html';
  };

  function setPageTitle() {
    const el = document.getElementById('page-title');
    const title = PAGE_TITLES[currentFile()] || 'Главная';
    if (el) el.textContent = title;
    document.title = title + ' — КУТ: БИЗНЕС';
  }

  // ---------------------------------------------------------
  // 1. Кнопка темы ВНУТРИ сайдбара
  // ---------------------------------------------------------
  function mountSidebarThemeToggle() {
    const api = window.KUT_THEME;
    if (!api || typeof api.toggle !== 'function') return;

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Находим или создаём слот
    let slot = sidebar.querySelector('#sidebar-theme-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'sidebar-theme-slot';
      slot.className = 'sidebar-theme-slot';
      const nav = sidebar.querySelector('.sidebar__nav');
      const cta = sidebar.querySelector('.sidebar__cta');
      if (nav && nav.nextSibling) sidebar.insertBefore(slot, nav.nextSibling);
      else if (cta) sidebar.insertBefore(slot, cta);
      else sidebar.appendChild(slot);
    }

    // 🚀 ЖЁСТКО удаляем ВСЕ старые кнопки (включая .sidebar-theme-toggle)
    slot.querySelectorAll('.sidebar-theme, .sidebar-theme-toggle, .theme-toggle').forEach((b) => b.remove());

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-theme-toggle';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(api.get() === 'light'));

    const render = () => {
      const isLight = api.get() === 'light';
      btn.setAttribute('aria-checked', String(isLight));
      btn.innerHTML =
        '<span class="sidebar-theme-toggle__track" aria-hidden="true">' +
          '<span class="sidebar-theme-toggle__knob"></span>' +
        '</span>' +
        '<span class="sidebar-theme-toggle__label">' +
          (isLight ? '☀️ День' : '🌙 Ночь') +
        '</span>';
    };
    render();

    // 🚀 Клик вызываем через KUT_THEME.toggle (логика — в theme.js)
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      api.toggle();
      render();
    });

    slot.appendChild(btn);
  }

  // ---------------------------------------------------------
  // 2. Бургер — ГАРАНТИРОВАННО один обработчик
  // ---------------------------------------------------------
  function ensureBurgerWorks() {
    const burger = document.getElementById('burger');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (!burger || !sidebar) return;

    // 🚀 Если уже настроен — не вешаем второй
    if (burger.dataset.kutWired === '1') return;
    burger.dataset.kutWired = '1';

    const open = () => {
      sidebar.classList.add('is-open');
      if (overlay) overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      sidebar.classList.remove('is-open');
      if (overlay) overlay.classList.remove('is-open');
      document.body.style.overflow = '';
    };

    burger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (sidebar.classList.contains('is-open')) close();
      else open();
    });

    if (overlay) overlay.addEventListener('click', close);
    sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('is-open')) close();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1000) close();
    });
  }

  // ---------------------------------------------------------
  // 3. Синхронизация темы между вкладками
  // ---------------------------------------------------------
  window.addEventListener('storage', (e) => {
    if (e.key !== 'kut_theme') return;
    if (window.KUT_THEME && typeof window.KUT_THEME.set === 'function') {
      window.KUT_THEME.set(e.newValue || 'dark');
    }
    mountSidebarThemeToggle();
  });

  // ---------------------------------------------------------
  // 4. Boot
  // ---------------------------------------------------------
  function boot() {
    setPageTitle();
    mountSidebarThemeToggle();
    ensureBurgerWorks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Повторные попытки — на случай, если DOM перестраивается модулями
  window.addEventListener('load', () => {
    [100, 400, 1200].forEach((t) => setTimeout(() => {
      mountSidebarThemeToggle();
      ensureBurgerWorks();
    }, t));
  });

  // ⚠️ ВАЖНО: НЕ переопределяем существующий обработчик burger.
  // Старый ui-chrome.js делал wired='1' и НЕ выставлял флаг — из-за
  // этого app.js вешал второй обработчик и шторка глючила.
  // Теперь используем отдельное поле dataset.kutWired.

})();
