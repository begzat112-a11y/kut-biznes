/* =========================================================
   NexusBiz — UI Chrome v11.1 «SaaS»
   
   • Глобальный хедер
   • Динамический заголовок страницы
   • Кнопка темы в сайдбаре (segmented control)
   • Селектор филиала в шапке (показывается если >1 точки)
   • Защита от двойных обработчиков
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
    document.title = title + ' — NexusBiz';
  }

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

    document.addEventListener('click', function (e) {
      const burger = e.target.closest && e.target.closest('#burger');
      if (!burger) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      toggle();
    }, true);

    document.addEventListener('click', function (e) {
      const overlay = e.target.closest && e.target.closest('#overlay');
      if (!overlay) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }, true);

    document.addEventListener('click', function (e) {
      const link = e.target.closest && e.target.closest('#sidebar a');
      if (!link) return;
      close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1000) close();
    });
  }

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

    slot.querySelectorAll('.theme-segmented, .sidebar-theme, .sidebar-theme-toggle, .theme-toggle')
      .forEach((el) => el.remove());

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

    const sync = () => {
      const cur = api.get();
      wrap.querySelectorAll('.theme-segmented__btn').forEach((btn) => {
        const active = btn.dataset.theme === cur;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', String(active));
      });
    };

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-segmented__btn');
      if (!btn) return;
      const next = btn.dataset.theme;
      if (!next || next === api.get()) return;
      api.set(next);
      sync();
    });

    sync();
    slot.appendChild(wrap);
  }

  function mountBusinessSwitcher() {
    const slot = document.getElementById('business-switcher-slot');
    if (!slot) return;

    const FB = window.FB;
    if (!FB) return;

    const ids = FB.getBusinessIds();
    const metas = FB.getBusinessesMeta();
    const selected = FB.getSelectedBusinessId();

    if (ids.length <= 1) {
      slot.innerHTML = '';
      slot.hidden = true;
      return;
    }

    slot.hidden = false;

    let label = 'Все филиалы';
    let icon = '🌐';
    if (selected) {
      const meta = metas.find((m) => m.id === selected);
      label = meta?.name || ('Точка ' + selected.slice(-4));
      icon = '🏪';
    }

    slot.innerHTML = `
      <button class="biz-switcher" id="bizSwitcherBtn" type="button" aria-haspopup="listbox">
        <span class="biz-switcher__icon" aria-hidden="true">${icon}</span>
        <span class="biz-switcher__label">${escapeHtml(label)}</span>
        <span class="biz-switcher__caret" aria-hidden="true">▾</span>
      </button>
    `;

    const btn = slot.querySelector('#bizSwitcherBtn');
    btn.addEventListener('click', openBizPicker);
  }

  function openBizPicker() {
    const FB = window.FB;
    if (!FB) return;

    const ids = FB.getBusinessIds();
    const metas = FB.getBusinessesMeta();
    const selected = FB.getSelectedBusinessId();

    let modal = document.getElementById('bizPickerModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'bizPickerModal';
    modal.className = 'biz-picker-modal';
    modal.innerHTML = `
      <div class="biz-picker-modal__backdrop" data-biz-close></div>
      <div class="biz-picker-modal__sheet" role="dialog" aria-modal="true">
        <div class="biz-picker-modal__grabber"></div>
        <h3 class="biz-picker-modal__title">Выберите филиал</h3>
        <div class="biz-picker-modal__list">
          <button class="biz-picker-item ${!selected ? 'is-active' : ''}"
                  type="button" data-biz-id="__all__">
            <span class="biz-picker-item__icon">🌐</span>
            <span class="biz-picker-item__text">
              <span class="biz-picker-item__name">Все филиалы</span>
              <span class="biz-picker-item__sub">Сводный отчёт по всей сети</span>
            </span>
            <span class="biz-picker-item__check">${!selected ? '✓' : ''}</span>
          </button>
          ${metas.map((m) => `
            <button class="biz-picker-item ${selected === m.id ? 'is-active' : ''}"
                    type="button" data-biz-id="${escapeHtml(m.id)}">
              <span class="biz-picker-item__icon">🏪</span>
              <span class="biz-picker-item__text">
                <span class="biz-picker-item__name">${escapeHtml(m.name || ('Точка ' + m.id.slice(-4)))}</span>
                <span class="biz-picker-item__sub">${m.missing ? '⚠️ Данные не найдены' : escapeHtml(m.id)}</span>
              </span>
              <span class="biz-picker-item__check">${selected === m.id ? '✓' : ''}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => modal.classList.add('is-open'));

    const close = () => {
      modal.classList.remove('is-open');
      document.body.style.overflow = '';
      setTimeout(() => modal.remove(), 250);
    };

    modal.querySelectorAll('[data-biz-close]').forEach((el) => {
      el.addEventListener('click', close);
    });

    modal.querySelectorAll('.biz-picker-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.bizId;
        const next = (id === '__all__') ? null : id;
        if (next === selected) { close(); return; }

        FB.setSelectedBusinessId(next);
        close();

        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('kut:business-changed', {
            detail: { businessId: next },
          }));
        }, 150);
      });
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function injectBusinessSwitcherStyles() {
    if (document.getElementById('kut-biz-switcher-styles')) return;
    const css = `
      #business-switcher-slot { flex-shrink: 0; }

      .biz-switcher {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        min-height: 36px;
        background: var(--kut-surface-sunken, rgba(255,255,255,.06));
        border: 1px solid var(--kut-border, rgba(255,255,255,.10));
        border-radius: 10px;
        color: var(--kut-text-1, #EDF5F1);
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        white-space: nowrap;
        max-width: 180px;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .biz-switcher:hover {
        background: var(--kut-gold-bg, rgba(212,175,55,.10));
        border-color: var(--kut-gold-border, rgba(212,175,55,.28));
      }
      .biz-switcher:active { transform: scale(0.98); }
      .biz-switcher__icon { font-size: 14px; line-height: 1; }
      .biz-switcher__label {
        max-width: 130px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .biz-switcher__caret {
        font-size: 8px;
        opacity: 0.7;
        margin-left: 2px;
      }

      .biz-picker-modal {
        position: fixed; inset: 0; z-index: 200;
        display: flex; align-items: flex-end; justify-content: center;
        opacity: 0;
        transition: opacity 0.22s ease;
      }
      .biz-picker-modal.is-open { opacity: 1; }
      .biz-picker-modal__backdrop {
        position: absolute; inset: 0;
        background: rgba(15,30,25,.55);
        backdrop-filter: blur(6px);
      }
      .biz-picker-modal__sheet {
        position: relative;
        width: 100%; max-width: 480px;
        background: var(--kut-surface, #141C22);
        border-top-left-radius: 22px;
        border-top-right-radius: 22px;
        padding: 12px 16px calc(20px + env(safe-area-inset-bottom, 0));
        color: var(--kut-text-1, #EDF5F1);
        transform: translateY(24px);
        transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
        max-height: 80dvh;
        overflow-y: auto;
        box-shadow: 0 -20px 60px rgba(0,0,0,.5);
      }
      .biz-picker-modal.is-open .biz-picker-modal__sheet {
        transform: translateY(0);
      }
      .biz-picker-modal__grabber {
        width: 44px; height: 4px; border-radius: 4px;
        background: var(--kut-border-strong, rgba(255,255,255,.20));
        margin: 4px auto 14px;
      }
      .biz-picker-modal__title {
        margin: 0 0 14px;
        font-size: 18px; font-weight: 700;
        color: var(--kut-text-1, #EDF5F1);
      }
      .biz-picker-modal__list {
        display: flex; flex-direction: column; gap: 6px;
      }

      .biz-picker-item {
        display: grid;
        grid-template-columns: 36px 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 12px 14px;
        min-height: 56px;
        background: var(--kut-surface-2, #18222A);
        border: 1.5px solid var(--kut-border, rgba(255,255,255,.08));
        border-radius: 14px;
        color: var(--kut-text-1, #EDF5F1);
        font-family: inherit;
        text-align: left;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .biz-picker-item:hover {
        border-color: var(--kut-gold-border, rgba(228,197,106,.30));
      }
      .biz-picker-item.is-active {
        border-color: var(--kut-gold, #E4C56A);
        background: var(--kut-gold-bg, rgba(228,197,106,.12));
        box-shadow: 0 0 0 2px var(--kut-gold-bg, rgba(228,197,106,.12));
      }
      .biz-picker-item__icon {
        font-size: 20px; line-height: 1;
        display: grid; place-items: center;
      }
      .biz-picker-item__text {
        display: flex; flex-direction: column; gap: 2px;
        min-width: 0;
      }
      .biz-picker-item__name {
        font-size: 14px; font-weight: 700;
        color: var(--kut-text-1, #EDF5F1);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .biz-picker-item__sub {
        font-size: 11px;
        color: var(--kut-text-3, rgba(232,237,240,.44));
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .biz-picker-item__check {
        font-size: 16px; font-weight: 800;
        color: var(--kut-gold, #E4C56A);
      }
    `;
    const style = document.createElement('style');
    style.id = 'kut-biz-switcher-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  async function boot() {
    setPageTitle();
    wireBurgerOnce();
    mountSidebarThemeToggle();
    injectBusinessSwitcherStyles();

    try {
      const FB = window.FB;
      if (FB && typeof FB.waitForAuth === 'function') {
        const { profile } = await FB.waitForAuth();
        if (profile) {
          await FB.loadBusinessesMeta();
          mountBusinessSwitcher();
        }
      }
    } catch (e) {
      console.warn('[NexusBiz ui-chrome] switcher mount failed:', e);
    }

    window.addEventListener('kut:business-changed', () => {
      mountBusinessSwitcher();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('load', () => {
    [400, 1200, 2500].forEach((t) => setTimeout(() => {
      mountSidebarThemeToggle();
      mountBusinessSwitcher();
    }, t));
  });

  console.info('[NexusBiz ui-chrome v11.1] · селектор филиала · тема');
})();
