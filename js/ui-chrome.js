/* =========================================================
   КУТ: БИЗНЕС — UI Chrome v10.3 «Aurora»
   
   • Единый глобальный хедер
   • Динамический заголовок страницы
   • Кнопка темы — toggle ВНУТРИ сайдбара (жёстко одна)
   • 🚀 Бургер: CAPTURE-ФАЗА + stopImmediatePropagation
       → убивает любые чужие обработчики (app.js, старый ui-chrome)
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

  function currentFile() {
    const f = (window.location.pathname || '').split('/').pop().toLowerCase();
    return f || 'index.html';
  }

  function setPageTitle() {
    const el = document.getElementById('page-title');
    const title = PAGE_TITLES[currentFile()] || 'Главная';
    if (el) el.textContent = title;
    document.title = title + ' — КУТ: БИЗНЕС';
  }

  // ---------------------------------------------------------
  // 🚀 БУРГЕР — ЕДИНСТВЕННЫЙ ОБРАБОТЧИК В CAPTURE-ФАЗЕ
  //    Он сработает ПЕРВЫМ (до всех bubble-обработчиков на элементе)
  //    и остановит их через stopImmediatePropagation.
  // ---------------------------------------------------------
  let burgerWired = false;
  function wireBurgerOnce() {
    if (burgerWired) return;
    burgerWired = true;

    const open = () => {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('overlay');
      if (!sidebar) return;
      sidebar.classList.add('is-open');
      if (overlay) overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('overlay');
      if (!sidebar) return;
      sidebar.classList.remove('is-open');
      if (overlay) overlay.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    const toggle = () => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return;
      if (sidebar.classList.contains('is-open')) close();
      else open();
    };

    // 🚀 capture = true — срабатываем ДО остальных обработчиков
    document.addEventListener('click', function (e) {
      const burger = e.target.closest && e.target.closest('#burger');
      if (!burger) return;

      // Убиваем все чужие обработчики (bubble на #burger, document и т.п.)
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();

      toggle();
    }, true); // ← capture-фаза

    // Закрытие по overlay (в capture тоже, чтобы избежать конфликтов)
    document.addEventListener('click', function (e) {
      const overlay = e.target.closest && e.target.closest('#overlay');
      if (!overlay) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }, true);

    // Закрытие по клику на ссылку внутри сайдбара
    document.addEventListener('click', function (e) {
      const link = e.target.closest && e.target.closest('#sidebar a');
      if (!link) return;
      close();
    });

    // Esc
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    // Авто-закрытие при переходе на ПК
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1000) close();
    });
  }

  // ---------------------------------------------------------
  // Кнопка темы — toggle внутри сайдбара
  // ---------------------------------------------------------
  function mountSidebarThemeToggle() {
    const api = window.KUT_THEME;
    if (!api || typeof api.toggle !== 'function') return;

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

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

    // 🚀 Удаляем ВСЕ старые кнопки (включая круглую .sidebar-theme)
    slot.querySelectorAll(
      '.sidebar-theme, .sidebar-theme-toggle, .theme-toggle'
    ).forEach((b) => b.remove());

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-theme-toggle';
    btn.setAttribute('role', 'switch');

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

    // Обработчик тоже в capture — чтобы никто не помешал
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const newTheme = api.toggle();
      render();
      console.info('[KUT theme] Переключено на:', newTheme);
    }, true);

    slot.appendChild(btn);
  }

  // ---------------------------------------------------------
  // Синхронизация темы между вкладками
  // ---------------------------------------------------------
  window.addEventListener('storage', (e) => {
    if (e.key !== 'kut_theme') return;
    if (window.KUT_THEME && typeof window.KUT_THEME.set === 'function') {
      window.KUT_THEME.set(e.newValue || 'dark');
    }
    mountSidebarThemeToggle();
  });

  // ---------------------------------------------------------
  // Boot
  // ---------------------------------------------------------
  function boot() {
    setPageTitle();
    wireBurgerOnce();
    mountSidebarThemeToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Повторные попытки — на случай, если модули перестраивают DOM
  window.addEventListener('load', () => {
    [100, 400, 1200].forEach((t) => setTimeout(() => {
      setPageTitle();
      wireBurgerOnce();
      mountSidebarThemeToggle();
    }, t));
  });

  console.info('[KUT ui-chrome] v10.3 · бургер в capture-фазе · тема toggle');
})();
