/* =========================================================
   КУТ: БИЗНЕС — Складской журнал · v3
   Realtime-таймлайн операций приход/списание
   Путь: businesses/{businessId}/warehouse_logs

   Публичный API (window.WAREHOUSE_LOG):
     saveLog({...})     — записать операцию
     createTestLog()    — создать тестовую запись
     listenToLogs(filter)
     refresh(filter)
   ========================================================= */

import './firebase-config.js';

(function () {
  'use strict';

  const COLLECTION = 'warehouse_logs';
  const LIMIT      = 20;

  const local = {
    filter:  'all',
    logs:    [],
    unsub:   null,
    started: false,
    bizId:   null,
  };

  // =========================================================
  // УТИЛИТЫ
  // =========================================================

  function getState() {
    return (window.KUT && typeof window.KUT.getState === 'function')
      ? window.KUT.getState()
      : {};
  }
  function getBizId() {
    return getState().businessId || null;
  }
  function getWorkerName() {
    const p = getState().profile || {};
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
    else console.log('[wh]', msg);
  }

  // =========================================================
  // 1. saveLog — записать операцию
  // =========================================================
  async function saveLog({ actionType, itemName, quantity, unit, totalPrice, workerName }) {
    if (!window.FB || !window.FB.db) {
      console.warn('[wh] FB не готов');
      return { ok: false, error: 'no_fb' };
    }
    const bizId = getBizId();
    if (!bizId) {
      console.warn('[wh] нет businessId');
      return { ok: false, error: 'no_business' };
    }
    if (actionType !== 'in' && actionType !== 'out') {
      return { ok: false, error: 'bad_type' };
    }

    try {
      const { db, collection, addDoc, serverTimestamp } = window.FB;
      const ref = collection(db, 'businesses', bizId, COLLECTION);

      const payload = {
        actionType,
        itemName:   String(itemName || '').trim().slice(0, 120),
        quantity:   Number(quantity) || 0,
        unit:       unit || 'шт',
        totalPrice: Number(totalPrice) || 0,
        workerName: workerName || getWorkerName(),
        timestamp:  serverTimestamp(),
      };

      const docRef = await addDoc(ref, payload);
      console.log('[wh] ✓ записано:', actionType, payload.itemName);
      return { ok: true, id: docRef.id };
    } catch (err) {
      console.error('[wh] ✗ ошибка записи:', err);
      return { ok: false, error: err.code || err.message };
    }
  }

  // =========================================================
  // 2. createTestLog — тестовая запись
  // =========================================================
  const TEST_TEMPLATES = [
    { actionType: 'in',  itemName: 'Хлеб (тест)',      quantity: 20, unit: 'шт', totalPrice: 400 },
    { actionType: 'out', itemName: 'Молоко (тест)',    quantity: 3,  unit: 'шт', totalPrice: 240 },
    { actionType: 'in',  itemName: 'Сахар (тест)',     quantity: 5,  unit: 'кг', totalPrice: 750 },
    { actionType: 'out', itemName: 'Печенье (тест)',   quantity: 1,  unit: 'шт', totalPrice: 85 },
    { actionType: 'in',  itemName: 'Вода 1,5л (тест)', quantity: 12, unit: 'шт', totalPrice: 540 },
  ];

  async function createTestLog() {
    const tpl = TEST_TEMPLATES[Math.floor(Math.random() * TEST_TEMPLATES.length)];
    const res = await saveLog(tpl);
    if (res.ok) {
      toast('Тестовая запись добавлена');
    } else {
      toast('Не удалось: ' + res.error, true);
    }
    return res;
  }

  // =========================================================
  // 3. listenToLogs — Realtime через onSnapshot
  // =========================================================
  function listenToLogs(filterType) {
    filterType = filterType || local.filter;

    if (!window.FB || !window.FB.db) {
      renderError('Firebase не загружен. Обнови страницу.');
      return;
    }
    const bizId = getBizId();
    if (!bizId) {
      // бизнес ещё не поднялся — покажем ожидание
      renderWaiting();
      return;
    }

    // отписываемся от старой подписки
    if (local.unsub) {
      try { local.unsub(); } catch (_) {}
      local.unsub = null;
    }

    local.filter = filterType;
    local.bizId  = bizId;
    setLiveStatus('connecting');
    renderLoading();

    const { db, collection, query, where, orderBy, limit, onSnapshot } = window.FB;
    const base = collection(db, 'businesses', bizId, COLLECTION);

    const constraints = [];
    if (filterType === 'in' || filterType === 'out') {
      constraints.push(where('actionType', '==', filterType));
    }
    constraints.push(orderBy('timestamp', 'desc'));
    constraints.push(limit(LIMIT));

    const q = query(base, ...constraints);

    local.unsub = onSnapshot(q,
      (snap) => {
        const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        local.logs = logs;
        local.started = true;
        setLiveStatus('live', logs.length);
        renderLogs(logs);
        console.log('[wh] 🔄 realtime:', logs.length, 'записей');
      },
      (err) => {
        console.error('[wh] snapshot error:', err);
        setLiveStatus('error');
        const code = String(err?.code || '');
        const msg  = String(err?.message || '');

        if (code.includes('permission-denied') || msg.includes('permission')) {
          renderRulesError();
        } else if (code.includes('failed-precondition') || msg.includes('index')) {
          renderIndexHint(msg);
        } else {
          renderError('Ошибка загрузки журнала: ' + (code || msg));
        }
      }
    );
  }

  // =========================================================
  // 4. РЕНДЕР
  // =========================================================

  function setLiveStatus(status, count) {
    const el = document.getElementById('whLive');
    if (!el) return;
    el.classList.remove('is-live', 'is-error', 'is-connecting');
    if (status === 'live') {
      el.classList.add('is-live');
      el.textContent = '🟢 Live' + (typeof count === 'number' ? ` · ${count}` : '');
    } else if (status === 'connecting') {
      el.classList.add('is-connecting');
      el.textContent = '⏳ Подключение…';
    } else if (status === 'error') {
      el.classList.add('is-error');
      el.textContent = '🔴 Ошибка';
    } else {
      el.textContent = '';
    }
  }

  function renderLogs(logsArray) {
    const listEl  = document.getElementById('whLogList');
    const emptyEl = document.getElementById('whLogEmpty');
    if (!listEl) return;

    if (!Array.isArray(logsArray) || logsArray.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    // группировка по дням
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
      </div>`;
  }

  function renderLoading() {
    const listEl  = document.getElementById('whLogList');
    const emptyEl = document.getElementById('whLogEmpty');
    if (!listEl) return;
    if (emptyEl) emptyEl.hidden = true;
    listEl.innerHTML = `
      <div class="wh-loading">
        <div class="wh-spinner"></div>
        <span>Загружаем журнал…</span>
      </div>`;
  }

  function renderWaiting() {
    const listEl  = document.getElementById('whLogList');
    const emptyEl = document.getElementById('whLogEmpty');
    if (!listEl) return;
    if (emptyEl) emptyEl.hidden = true;
    listEl.innerHTML = `
      <div class="wh-loading">
        <div class="wh-spinner"></div>
        <span>Ждём подключения к бизнесу…</span>
      </div>`;
  }

  function renderError(text) {
    const listEl  = document.getElementById('whLogList');
    const emptyEl = document.getElementById('whLogEmpty');
    if (!listEl) return;
    if (emptyEl) emptyEl.hidden = true;
    listEl.innerHTML = `
      <div class="wh-hint wh-hint--error">
        <div class="wh-hint__icon">⚠️</div>
        <div class="wh-hint__title">Что-то не так</div>
        <div class="wh-hint__text">${escapeHtml(text)}</div>
        <button class="wh-hint__btn" type="button" onclick="WAREHOUSE_LOG.refresh()">
          🔄 Попробовать снова
        </button>
      </div>`;
  }

  function renderRulesError() {
    const listEl  = document.getElementById('whLogList');
    const emptyEl = document.getElementById('whLogEmpty');
    if (!listEl) return;
    if (emptyEl) emptyEl.hidden = true;
    listEl.innerHTML = `
      <div class="wh-hint wh-hint--error">
        <div class="wh-hint__icon">🔒</div>
        <div class="wh-hint__title">Firestore Rules блокируют доступ</div>
        <div class="wh-hint__text">
          Нужно разрешить чтение и запись коллекции <code>warehouse_logs</code>.<br>
          Открой Firebase Console → Firestore → Rules и добавь правила ниже.
        </div>
        <pre class="wh-hint__code">match /businesses/{bizId}/{doc=**} {
  allow read, write: if request.auth != null;
}</pre>
      </div>`;
  }

  function renderIndexHint(message) {
    const listEl  = document.getElementById('whLogList');
    const emptyEl = document.getElementById('whLogEmpty');
    if (!listEl) return;
    if (emptyEl) emptyEl.hidden = true;

    const urlMatch = String(message || '').match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : null;

    listEl.innerHTML = `
      <div class="wh-hint wh-hint--warn">
        <div class="wh-hint__icon">🔧</div>
        <div class="wh-hint__title">Нужен индекс Firestore</div>
        <div class="wh-hint__text">
          Для фильтра «${escapeHtml(local.filter === 'in' ? 'Приходы' : 'Списания')}»<br>
          Firestore требует составной индекс.
        </div>
        ${url ? `<a class="wh-hint__link" href="${url}" target="_blank" rel="noopener">Создать индекс →</a>` : ''}
        <div class="wh-hint__note">Или фильтр «Все» работает без индекса.</div>
      </div>`;
  }

  // =========================================================
  // 5. CSS + UI
  // =========================================================
  function injectStyles() {
    if (document.getElementById('wh-log-styles')) return;
    const css = `
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
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        padding: 16px 18px 10px;
        flex-wrap: wrap;
      }
      .wh-head__left { min-width: 0; }
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
        margin-top: 2px;
      }
      .wh-live {
        font-size: 11px;
        font-weight: 700;
        padding: 5px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,.05);
        color: var(--v9-text-3, rgba(237,245,241,.48));
        white-space: nowrap;
        flex-shrink: 0;
      }
      .wh-live.is-live {
        background: rgba(46,204,113,.14);
        color: #2ecc71;
        border: 1px solid rgba(46,204,113,.28);
      }
      .wh-live.is-connecting {
        background: rgba(212,175,55,.14);
        color: #F0D772;
        border: 1px solid rgba(212,175,55,.28);
      }
      .wh-live.is-error {
        background: rgba(255,92,92,.14);
        color: #FF5C5C;
        border: 1px solid rgba(255,92,92,.28);
      }

      .wh-filters {
        display: flex;
        gap: 8px;
        padding: 0 18px 12px;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .wh-filters::-webkit-scrollbar { display: none; }
      .wh-chip {
        flex-shrink: 0;
        min-height: 34px;
        padding: 7px 14px;
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

      /* Кнопка «создать тест-лог» в шапке */
      .wh-test-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: 10px;
        border: 1px solid rgba(212,175,55,.28);
        background: rgba(212,175,55,.10);
        color: #F0D772;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        transition: transform .12s ease, background .18s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .wh-test-btn:active { transform: scale(.95); }
      .wh-test-btn:hover { background: rgba(212,175,55,.20); }

      .wh-list { padding: 4px 8px 12px; min-height: 100px; }

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

      .wh-row {
        display: grid;
        grid-template-columns: 60px 1fr auto;
        align-items: center;
        gap: 12px;
        padding: 12px;
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
        width: 10px; height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
        position: relative;
      }
      .wh-row__dot::after {
        content: "";
        position: absolute;
        left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        width: 4px; height: 4px;
        border-radius: 50%;
        background: #fff;
        opacity: .85;
      }
      .wh-row--in  .wh-row__dot { background: #2ecc71; box-shadow: 0 0 10px rgba(46,204,113,.55); }
      .wh-row--out .wh-row__dot { background: #FF5C5C; box-shadow: 0 0 10px rgba(255,92,92,.55); }

      .wh-row__body { min-width: 0; }
      .wh-row__name {
        font-size: 14px;
        font-weight: 700;
        color: var(--v9-text-1, #EDF5F1);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      html[data-theme="light"] .wh-row__name { color: #14211C; }
      .wh-row__worker {
        font-size: 12px;
        color: var(--v9-text-3, rgba(237,245,241,.48));
        margin-top: 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      html[data-theme="light"] .wh-row__worker { color: #7A8783; }

      .wh-row__right { text-align: right; flex-shrink: 0; }
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

      /* Пусто / загрузка / подсказки */
      .wh-empty {
        padding: 40px 20px;
        text-align: center;
        color: var(--v9-text-3, rgba(237,245,241,.48));
        font-size: 14px;
      }
      .wh-empty__icon { font-size: 34px; display: block; margin-bottom: 8px; opacity: .8; }
      .wh-empty__hint {
        display: block;
        margin-top: 8px;
        font-size: 12px;
        color: var(--v9-text-3, rgba(237,245,241,.4));
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
        width: 20px; height: 20px;
        border: 2px solid rgba(212,175,55,.25);
        border-top-color: #D4AF37;
        border-radius: 50%;
        animation: whSpin .9s linear infinite;
      }
      @keyframes whSpin { to { transform: rotate(360deg); } }

      .wh-hint {
        padding: 24px 20px;
        text-align: center;
      }
      .wh-hint__icon { font-size: 34px; margin-bottom: 10px; }
      .wh-hint__title {
        font-size: 15px; font-weight: 700;
        color: var(--v9-text-1, #EDF5F1);
        margin-bottom: 8px;
      }
      html[data-theme="light"] .wh-hint__title { color: #14211C; }
      .wh-hint__text {
        font-size: 13px;
        line-height: 1.55;
        color: var(--v9-text-2, rgba(237,245,241,.72));
        margin-bottom: 14px;
      }
      .wh-hint__text code {
        background: rgba(255,255,255,.08);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: ui-monospace, Menlo, monospace;
        font-size: 12px;
      }
      .wh-hint__code {
        text-align: left;
        background: rgba(0,0,0,.35);
        color: #B9F5CE;
        padding: 12px;
        border-radius: 12px;
        font-family: ui-monospace, Menlo, monospace;
        font-size: 11px;
        line-height: 1.5;
        overflow-x: auto;
        margin: 0 0 12px;
        white-space: pre;
      }
      html[data-theme="light"] .wh-hint__code {
        background: #14211C; color: #B9F5CE;
      }
      .wh-hint__btn {
        display: inline-block;
        padding: 10px 16px;
        border-radius: 12px;
        border: 1px solid rgba(212,175,55,.35);
        background: rgba(212,175,55,.14);
        color: #F0D772;
        font-family: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      .wh-hint__link {
        display: inline-block;
        padding: 10px 16px;
        border-radius: 12px;
        background: linear-gradient(135deg, #E7C14A, #B88F1D);
        color: #06150F;
        font-weight: 700;
        font-size: 13px;
        text-decoration: none;
      }
      .wh-hint__note {
        margin-top: 10px;
        font-size: 12px;
        color: var(--v9-text-3, rgba(237,245,241,.48));
      }
      .wh-hint--error .wh-hint__title { color: #FF5C5C; }
      .wh-hint--warn .wh-hint__title { color: #F0D772; }
    `;
    const style = document.createElement('style');
    style.id = 'wh-log-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function mountFilters() {
    const wrap = document.getElementById('whFilters');
    if (!wrap || wrap.dataset.wired === '1') return;
    wrap.dataset.wired = '1';

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.wh-chip');
      if (!btn) return;
      const filter = btn.dataset.filter;
      if (!filter || filter === local.filter) return;

      wrap.querySelectorAll('.wh-chip').forEach((c) => {
        c.classList.toggle('is-active', c.dataset.filter === filter);
      });

      listenToLogs(filter);
    });
  }

  function mountTestBtn() {
    const btn = document.getElementById('whTestBtn');
    if (!btn || btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => createTestLog());
  }

  function init() {
    injectStyles();
    mountFilters();
    mountTestBtn();

    const section = document.getElementById('whLogSection');
    if (!section) return;

    // Ждём businessId
    const tryStart = (attempt) => {
      const bizId = getBizId();
      if (bizId) {
        console.log('[wh] стартуем с бизнесом:', bizId);
        listenToLogs(local.filter);
        return;
      }
      if (attempt < 50) setTimeout(() => tryStart(attempt + 1), 300);
      else {
        console.warn('[wh] businessId не появился за 15 сек');
        renderError('Не удалось получить бизнес. Проверь вход в аккаунт.');
      }
    };
    tryStart(0);
  }

  // =========================================================
  // ПУБЛИЧНЫЙ API
  // =========================================================
  window.WAREHOUSE_LOG = {
    saveLog,
    createTestLog,
    listenToLogs,
    renderLogs,
    refresh: (f) => listenToLogs(f || local.filter),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
