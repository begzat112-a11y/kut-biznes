/* =========================================================
   КУТ: БИЗНЕС — Theme Controller v10.0 «Aurora»
   
   • Хранит выбор в localStorage.kut_theme
   • Ставит html[data-theme="dark|light"] + body.dark-mode
   • Монтирует segmented-переключатель в сайдбар
   • Синхронизируется между вкладками через storage
   • Публичный API: window.KUT_THEME
   ========================================================= */

(function () {
  'use strict';

  const KEY = 'kut_theme';
  const THEMES = { LIGHT: 'light', DARK: 'dark' };
  const META_COLORS = {
    light: '#F2F5F3',
    dark:  '#0D1418',
  };

  /* ---------------------------------------------------------
     Утилиты
     --------------------------------------------------------- */
  function getSaved() {
    try {
      const v = localStorage.getItem(KEY);
      return (v === THEMES.LIGHT || v === THEMES.DARK) ? v : null;
    } catch (_) { return null; }
  }

  function save(theme) {
    try { localStorage.setItem(KEY, theme); } catch (_) {}
  }

  function systemPrefers() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return THEMES.LIGHT;
      }
    } catch (_) {}
    return THEMES.DARK;
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || THEMES.DARK;
  }

  /* ---------------------------------------------------------
     Применение темы (DOM + meta)
     --------------------------------------------------------- */
  function applyTheme(theme) {
    if (theme !== THEMES.LIGHT && theme !== THEMES.DARK) theme = THEMES.DARK;

    // Синхронно ставим на <html> — работает до первого рендера
    document.documentElement.setAttribute('data-theme', theme);

    // Дублируем классом на body — совместимость с ТЗ (body.dark-mode)
    if (document.body) {
      if (theme === THEMES.DARK) document.body.classList.add('dark-mode');
      else document.body.classList.remove('dark-mode');
    }

    // meta theme-color — под цвет canvas
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META_COLORS[theme]);

    updateSegmentedUI(theme);
  }

  /* ---------------------------------------------------------
     Segmented control в сайдбаре
     --------------------------------------------------------- */
  function updateSegmentedUI(theme) {
    document.querySelectorAll('.theme-segmented__btn').forEach((btn) => {
      const isActive = btn.dataset.theme === theme;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-checked', String(isActive));
    });
  }

  function buildSegmentedControl() {
    const wrap = document.createElement('div');
    wrap.className = 'theme-segmented';
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', 'Тема интерфейса');

    wrap.innerHTML = `
      <button type="button" class="theme-segmented__btn" data-theme="light" role="radio">
        <span class="theme-segmented__icon" aria-hidden="true">☀️</span>
        <span>День</span>
      </button>
      <button type="button" class="theme-segmented__btn" data-theme="dark" role="radio">
        <span class="theme-segmented__icon" aria-hidden="true">🌙</span>
        <span>Ночь</span>
      </button>
    `;

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-segmented__btn');
      if (!btn) return;
      const next = btn.dataset.theme;
      if (!next || next === currentTheme()) return;
      setTheme(next, { persist: true });
    });

    return wrap;
  }

  function mountSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    let slot = document.getElementById('sidebar-theme-slot');
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

    // Чистим старые варианты — оставляем один segmented
    slot.querySelectorAll('.theme-segmented, .sidebar-theme, .sidebar-theme-toggle, .theme-toggle')
      .forEach((el) => el.remove());

    slot.appendChild(buildSegmentedControl());
    updateSegmentedUI(currentTheme());
  }

  /* ---------------------------------------------------------
     Публичный сеттер
     --------------------------------------------------------- */
  function setTheme(theme, opts) {
    opts = opts || {};
    if (theme !== THEMES.LIGHT && theme !== THEMES.DARK) return;

    // Плавный переход
    document.documentElement.classList.add('kut-theme-transition');
    applyTheme(theme);
    if (opts.persist !== false) save(theme);

    window.dispatchEvent(new CustomEvent('kut:theme', {
      detail: { theme: theme },
    }));

    // Убираем класс переходов через 350мс
    setTimeout(() => {
      document.documentElement.classList.remove('kut-theme-transition');
    }, 350);
  }

  function toggleTheme() {
    const next = currentTheme() === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
    setTheme(next, { persist: true });
    return next;
  }

  /* ---------------------------------------------------------
     Инициализация
     --------------------------------------------------------- */

  // 1. Мгновенно применяем тему (ещё до CSS)
  const initial = getSaved() || systemPrefers();
  document.documentElement.setAttribute('data-theme', initial);

  // 2. После DOM — синхронизируем body + UI
  function boot() {
    applyTheme(initial);
    mountSidebarToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 3. Повторный монтаж — на случай, если модули пересобирают DOM
  window.addEventListener('load', () => {
    mountSidebarToggle();
    setTimeout(mountSidebarToggle, 600);
    setTimeout(mountSidebarToggle, 1500);
  });

  // 4. Синхронизация между вкладками
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    if (e.newValue !== currentTheme()) applyTheme(e.newValue);
    mountSidebarToggle();
  });

  // 5. Реакция на системное изменение темы — только если пользователь не выбрал вручную
  try {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e) => {
      if (getSaved()) return; // пользователь выбрал вручную — не перебиваем
      const next = e.matches ? THEMES.LIGHT : THEMES.DARK;
      applyTheme(next);
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  } catch (_) {}

  // 6. Публичный API
  window.KUT_THEME = {
    get: currentTheme,
    set: (t) => setTheme(t, { persist: true }),
    toggle: toggleTheme,
    apply: applyTheme,
    KEY: KEY,
  };

  // Обратная совместимость
  window.KUT_THEME_V10 = window.KUT_THEME;

  console.info('[KUT theme v10.0 «Aurora»] · загружено · текущая тема:', currentTheme());
})();
