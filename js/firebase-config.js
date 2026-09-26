/* =========================================================
   КУТ: БИЗНЕС — Складской журнал (warehouse_logs) · v1
   • saveLog()   — запись операции (приход/списание)
   • loadLogs()  — чтение последних 20 записей с фильтром
   • renderLogs()— мобильный таймлайн в тёмной теме
   • Автоматически монтирует UI, CSS и обработчики фильтров
   Коллекция: businesses/{bizId}/warehouse_logs
   ========================================================= */

import './firebase-config.js';

(function () {
  'use strict';

  const COLLECTION   = 'warehouse_logs';
  const LIMIT        = 20;
  const FILTERS      = [
    { id: 'all', label: 'Все' },
    { id: 'in',  label: 'Приходы' },
    { id: 'out', label: 'Списания' },
  ];

  // Текущее состояние модуля
  const local = {
    filter: 'all',
    logs: [],
    loading: false,
  };

  // =========================================================
  // УТИЛИТЫ
  // =========================================================

  function getBizId() {
    const st = window.KUT?.getState?.() || {};
    return st.businessId || null;
  }

  function getWorkerName() {
    const st = window.KUT?.getState?.() || {};
    const p = st.profile || {};
    return p.displayName || p.email || 'Сотрудник';
  }

  function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtMoney(n) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
      .format(Number(n) || 0) + ' KGS';
  }

  function fmtQty(n) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
      .format(Number(n) || 0);
  }

  function fmtTime(d) {
    if (!d) return '—';
    const z = (x) => String(x).padStart(2, '0');
    return `${z(d.getHours())}:${z(d.getMinutes())}`;
  }

  function fmtDayLabel(d) {
    if (!d) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Сегодня';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Вчера';
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function toast(msg, isError) {
    if (window.KUT?.toast) window.KUT.toast(msg, isError);
    else console.log('[warehouse-log]', msg);
  }

  // =========================================================
  // 1. saveLog — записать операцию в журнал
  //    actionType: 'in' (приход) | 'out' (списание)
  // =========================================================
  async function saveLog({ actionType, itemName, quantity, unit, totalPrice, workerName }) {
    if (!window.FB || !window.FB.db) {
      console.warn('[warehouse-log] FB не готов');
      return { ok: false, error: 'no_fb' };
    }
    const bizId = getBizId();
    if (!bizId) return { ok: false, error: 'no_business' };

    if (actionType !== 'in' && actionType !== 'out') {
      return { ok: false, error: 'bad_action_type' };
    }

    try {
      const { db, collection, addDoc, serverTimestamp } = window.FB;
      const ref = collection(db, 'businesses', bizId, COLLECTION);

      const payload = {
        actionType,
        itemName: String(itemName || '').trim().slice(0, 120),
        quantity: Number(quantity) || 0,
        unit: unit || 'шт',
        totalPrice: Number(totalPrice) || 0,
        workerName: workerName || getWorkerName(),
        timestamp: serverTimestamp(),
      };

      const docRef = await addDoc(ref, payload);
      console.info('[warehouse-log] saved:', payload.actionType, payload.itemName);
      return { ok: true, id: docRef.id };
    } catch (err) {
      console.error('[warehouse-log] save failed:', err);
      return { ok: false, error: err.code || err.message };
    }
  }

  // =========================================================
  // 2. loadLogs — получить последние 20 записей
  //    filterType: 'all' | 'in' | 'out'
  // =========================================================
  async function loadLogs(filterType = 'all') {
    if (!window.FB || !window.FB.db) return [];
    const bizId = getBizId();
    if (!bizId) return [];

    try {
      const { db, collection, query, where, orderBy, limit, getDocs } = window.FB;
      const base = collection(db, 'businesses', bizId, COLLECTION);

      const constraints = [];
      if (filterType === 'in' || filterType === 'out') {
        constraints.push(where('actionType', '==', filterType));
      }
      constraints.push(orderBy('timestamp', 'desc'));
      constraints.push(limit(LIMIT));

      const q = query(base, ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('[warehouse-log] load failed:', err);
      // Часто ошибка из-за отсутствия индекса в Firestore.
      // В консоли Firebase будет ссылка "Create index".
      return [];
    }
  }

  // =========================================================
  // 3. renderLogs — HTML таймлайна
  // =========================================================
  function renderLogs(logsArray) {
    const listEl = document.getElementById('whLogList');
    const emptyEl = document.getElementById('whLogEmpty');
    if (!listEl) return;

    if (!Array.isArray(logsArray) || logsArray.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    // Группируем по дню
    const groups = [];
    let currentKey = null;

    logsArray.forEach((log) => {
      const d = toDate(log.timestamp);
      const key = d ? d.toDateString() : '__none__';
      if (key !== currentKey) {
        groups.push({ label: fmtDayLabel(d), items: [] });
        currentKey = key;
      }
      groups[groups.length - 1].items.push({ ...log, _date: d });
    });

    listEl.innerHTML = groups.map((g) => `
      <div class="wh-day">
        <div class="wh-day__label">${escapeHtml(g.label)}</div>
        ${g.items.map(renderRow).join('')}
      </div>
    `).join('');
  }

  function renderRow(log) {
    const isIn = log.actionType === 'in';
    const sign = isIn ? '+' : '−';
    const qtyText = `${sign}${fmtQty(log.quantity)} ${escapeHtml(log.unit || 'шт')}`;
    const timeText = fmtTime(log._date);

    return `
      <div class="wh-row wh-row--${isIn ? 'in' : 'out'}">
        <div class="wh-row__left">
          <div class="wh-row__time">${escapeHtml(timeText)}</div>
          <div class="wh-row__dot" aria-hidden="true"></div>
        </div>

        <div class="wh-row__body">
          <div class="wh-row__name">${escapeHtml(log.itemName || '—')}</div>
          <div class="wh-row__worker">${escapeHtml(log.workerName || 'Сотрудник')}</div>
        </div>

        <div class="wh-row__right">
          <div class="wh-row__qty wh-row__qty--${isIn ? 'in' : 'out'}">${qtyText}</div>
          <div class="wh-row__sum">${fmtMoney(log.totalPrice)}</div>
        </div>
      </div>
    `;
  }

  // =========================================================
  // 4. refresh — перезагрузить журнал под текущий фильтр
  // =========================================================
  async function refresh(filterType) {
    if (filterType) local.filter = filterType;
    local.loading = true;
    renderLoading();

    const logs = await loadLogs(local.filter);
    local.logs = logs;
    local.loading = false;
    renderLogs(logs);
  }

  function renderLoading() {
    const listEl = document.getElementById('whLogList');
    const emptyEl = document.getElementById('whLogEmpty');
    if (!listEl) return;
    if (emptyEl) emptyEl.hidden = true;
    listEl.innerHTML = `
      <div class="wh-loading">
        <div class="wh-spinner"></div>
        <span>Загружаем журнал…</span>
      </div>`;
  }

  // =========================================================
  // 5. CSS + UI: инжектируем стили и монтируем обработчики
  // =========================================================
  function injectStyles() {
    if (document.getElementById('wh-log-styles')) return;
    const css = `
      /* ===== Секция журнала ===== */
      .wh-section {
        margin-top: 16px;
        border-radius: 22px;
        background: linear-gradient(150deg, rgba(255,255,255,.05), rgba(255,255,255,.015));
        border: 1px solid rgba(255,255,255,.09);
        box-shadow: 0 10px 34px rgba(0,0,0,.32);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        overflow: hidden;
      }
      html[data-theme="light"] .wh-section {
        background: #FFFFFF;
        border-color: rgba(0,95,64,.10);
        box-shadow: 0 6px 18px rgba(16,32,25,.08);
      }

      .wh-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 16px 18px 12px;
        flex-wrap: wrap;
      }
      .wh-head__title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: var(--v9-text-1, #EDF5F1);
      }
      html[data-theme="light"] .wh-head__title { color: #14211C; }
      .wh-head__sub {
        font-size: 12px;
        color: var(--v9-text-3, rgba(237,245,241,.48));
      }

      /* Чипсы фильтров */
      .wh-filters {
        display: flex;
        gap: 8px;
        padding: 0 18px 14px;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .wh-filters::-webkit-scrollbar { display: none; }
      .wh-chip {
        flex-shrink: 0;
        min-height: 36px;
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid var(--v9-glass-border, rgba(255,255,255,.09));
        background: rgba(255,255,255,.04);
        color: var(--v9-text-2, rgba(237,245,241,.72));
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        white-space: nowrap;
        transition: background .18s ease, color .18s ease, transform .12s ease;
        -webkit-tap-highlight-color: transparent;
      }
      html[data-theme="light"] .wh-chip {
        background: #F4F7F5;
        color: #4A5C54;
        border-color: rgba(0,95,64,.12);
      }
      .wh-chip:active { transform: scale(.96); }
      .wh-chip.is-active {
        background: linear-gradient(135deg, #E7C14A, #B88F1D);
        color: #06150F;
        border-color: transparent;
        box-shadow: 0 6px 18px rgba(212,175,55,.32);
      }

      /* Список */
      .wh-list { padding: 4px 8px 12px; }

      .wh-day { margin-bottom: 8px; }
      .wh-day:last-child { margin-bottom: 0; }
      .wh-day__label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .5px;
        color: var(--v9-text-3, rgba(237,245,241,.48));
        padding: 10px 12px 6px;
      }
      html[data-theme="light"] .wh-day__label { color: #7A8783; }

      /* Строка таймлайна */
      .wh-row {
        display: grid;
        grid-template-columns: 56px 1fr auto;
        align-items: center;
        gap: 12px;
        padding: 12px 12px;
        border-radius: 14px;
        transition: background .14s ease;
      }
      .wh-row:hover { background: rgba(255,255,255,.03); }
      .wh-row + .wh-row { border-top: 1px dashed rgba(255,255,255,.06); }
      html[data-theme="light"] .wh-row + .wh-row { border-top-color: rgba(0,95,64,.08); }

      .wh-row__left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .wh-row__time {
        font-size: 12px;
        font-weight: 700;
        color: var(--v9-text-2, rgba(237,245,241,.72));
        font-variant-numeric: tabular-nums;
        min-width: 38px;
      }
      html[data-theme="light"] .wh-row__time { color: #4A5C54; }

      .wh-row__dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
        position: relative;
      }
      .wh-row__dot::after {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #fff;
        opacity: .85;
      }
      .wh-row--in  .wh-row__dot {
        background: #2ecc71;
        box-shadow: 0 0 10px rgba(46,204,113,.55);
      }
      .wh-row--out .wh-row__dot {
        background: #FF5C5C;
        box-shadow: 0 0 10px rgba(255,92,92,.55);
      }

      .wh-row__body { min-width: 0; }
      .wh-row__name {
        font-size: 14px;
        font-weight: 700;
        color: var(--v9-text-1, #EDF5F1);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      html[data-theme="light"] .wh-row__name { color: #14211C; }
      .wh-row__worker {
        font-size: 12px;
        color: var(--v9-text-3, rgba(237,245,241,.48));
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      html[data-theme="light"] .wh-row__worker { color: #7A8783; }

      .wh-row__right {
        text-align: right;
        flex-shrink: 0;
      }
      .wh-row__qty {
        font-size: 14px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .wh-row__qty--in  { color: #2ecc71; }
      .wh-row__qty--out { color: #FF5C5C; }
      .wh-row__sum {
        font-size: 11px;
        color: var(--v9-text-3, rgba(237,245,241,.48));
        margin-top: 2px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      html[data-theme="light"] .wh-row__sum { color: #7A8783; }

      /* Пусто / загрузка */
      .wh-empty {
        padding: 40px 20px;
        text-align: center;
        color: var(--v9-text-3, rgba(237,245,241,.48));
        font-size: 14px;
      }
      .wh-empty__icon {
        font-size: 34px;
        display: block;
        margin-bottom: 8px;
        opacity: .8;
      }
      html[data-theme="light"] .wh-empty { color: #7A8783; }

      .wh-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 40px 20px;
        font-size: 13px;
        color: var(--v9-text-3, rgba(237,245,241,.48));
      }
      .wh-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(212,175,55,.25);
        border-top-color: #D4AF37;
        border-radius: 50%;
        animation: whSpin .9s linear infinite;
      }
      @keyframes whSpin { to { transform: rotate(360deg); } }
    `;
    const style = document.createElement('style');
    style.id = 'wh-log-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function mountFilters() {
    const wrap = document.getElementById('whFilters');
    if (!wrap) return;
    if (wrap.dataset.wired === '1') return;
    wrap.dataset.wired = '1';

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.wh-chip');
      if (!btn) return;
      const filter = btn.dataset.filter;
      if (!filter || filter === local.filter) return;

      wrap.querySelectorAll('.wh-chip').forEach((c) => {
        c.classList.toggle('is-active', c.dataset.filter === filter);
      });

      refresh(filter);
    });
  }

  function init() {
    injectStyles();
    mountFilters();

    const section = document.getElementById('whLogSection');
    if (!section) return; // не на этой странице

    // Первичная загрузка — отложим, чтобы KUT/FB успели подняться
    const tryLoad = (attempt) => {
      const bizId = getBizId();
      if (bizId) {
        refresh(local.filter);
        return;
      }
      if (attempt < 30) setTimeout(() => tryLoad(attempt + 1), 300);
    };
    tryLoad(0);
  }

  // =========================================================
  // ПУБЛИЧНЫЙ API
  // =========================================================
  window.WAREHOUSE_LOG = {
    saveLog,
    loadLogs,
    renderLogs,
    refresh,
  };

  // Автозапуск при готовности DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
