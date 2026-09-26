/* =========================================================
   КУТ: БИЗНЕС — Ядро системы (app.js) · Firebase v10 · v9.5
   + Периоды аналитики (Сегодня / Вчера / 7 дней / Месяц)
   + Модуль «Критические остатки»
   + Детализация кассы: наличные + карта/перевод
   + Сквозная центральная кнопка-сканер
   + Профиль, заявки, роли
   ========================================================= */

import './firebase-config.js';

// =========================================================
// УТИЛИТЫ
// =========================================================
const fmt = (n) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtMoney = (n) => fmt(n) + ' KGS';

function uid(prefix) {
  return (prefix || 'id_') + Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 7);
}
function todayISO() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function nowTimeHHMM() {
  const d = new Date();
  const z = (n) => String(d.getHours()).padStart(2, '0');
  return `${z(d.getHours())}:${z(d.getMinutes())}`;
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('996')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 9);
  return '+996' + d;
}
function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}
function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (!parts[0]) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0][0] || '') + (parts[1][0] || '')).toUpperCase();
}
function roleLabel(role) {
  switch (role) {
    case 'owner':       return 'Владелец';
    case 'manager':     return 'Менеджер';
    case 'cashier':     return 'Кассир';
    case 'super_admin': return 'Администратор';
    default:            return 'Пользователь';
  }
}
function roleClass(role) {
  switch (role) {
    case 'owner':       return 'owner';
    case 'manager':     return 'manager';
    case 'cashier':     return 'cashier';
    case 'super_admin': return 'admin';
    default:            return 'user';
  }
}
function getCurrentPage() {
  let file = (window.location.pathname || '').split('/').pop().toLowerCase();
  if (!file || file === '') file = 'index.html';
  const map = {
    'index.html':  'index',
    '':            'index',
    'cash.html':   'cash',
    'stock.html':  'stock',
    'debts.html':  'debts',
    'staff.html':  'staff',
  };
  return map[file] || null;
}

// =========================================================
// ТОСТ
// =========================================================
function toast(message, isError) {
  let el = document.getElementById('kut-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'kut-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText =
      'position:fixed;left:50%;bottom:calc(100px + env(safe-area-inset-bottom));' +
      'transform:translate(-50%,120%);background:#005F40;color:#fff;' +
      'padding:12px 18px;border-radius:12px;font-family:Inter,sans-serif;' +
      'font-size:14px;font-weight:500;box-shadow:0 18px 48px rgba(16,32,25,.20);' +
      'z-index:300;transition:transform .3s cubic-bezier(.2,.8,.2,1);' +
      'max-width:90vw;text-align:center;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.background = isError ? '#C0392B' : '#005F40';
  el.style.transform = 'translate(-50%, 0)';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.transform = 'translate(-50%, 120%)'; }, 2800);
}

// =========================================================
// СОСТОЯНИЕ
// =========================================================
const state = {
  businessId: null,
  profile: null,
  products: [],
  sales: [],
  debts: [],
  staff: [],
  requests: [],
  unsubRequests: null,
  period: 'month', // today | yesterday | week | month
};

// =========================================================
// ПЕРИОДЫ АНАЛИТИКИ
// =========================================================
const PERIOD_LABELS = {
  today:     'Сводка за сегодня',
  yesterday: 'Сводка за вчера',
  week:      'Сводка за 7 дней',
  month:     'Сводка за месяц',
};

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Диапазон [from, to) для текущего периода */
function getPeriodRange(period) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86400000;

  switch (period) {
    case 'today':     return { from: startOfToday,           to: Date.now() + 1 };
    case 'yesterday': return { from: startOfToday - DAY,     to: startOfToday };
    case 'week':      return { from: startOfToday - 6 * DAY, to: Date.now() + 1 };
    case 'month':     return { from: startOfMonth(),         to: Date.now() + 1 };
    default:          return { from: 0,                      to: Date.now() + 1 };
  }
}

/** Продажи за выбранный период */
function getPeriodSales() {
  const { from, to } = getPeriodRange(state.period);
  return (state.sales || []).filter((s) => {
    const t = toDate(s.createdAt)?.getTime() || 0;
    return t >= from && t < to;
  });
}

// =========================================================
// АГРЕГАТЫ
// =========================================================
function sumOfSale(s) {
  return Number(s.totalSum != null ? s.totalSum : s.total) || 0;
}
function costOfSale(s) {
  if (!Array.isArray(s.items)) return 0;
  return s.items.reduce((sum, it) => {
    const qty = Number(it.quantity != null ? it.quantity : it.qty) || 0;
    const cost = Number(it.costPrice) || 0;
    return sum + qty * cost;
  }, 0);
}

function aggregateRevenue() {
  const m = getPeriodSales();
  const total  = m.reduce((s, x) => s + sumOfSale(x), 0);
  const cash   = m.filter((s) => s.paymentMethod === 'cash').reduce((s, x) => s + sumOfSale(x), 0);
  const wallet = m.filter((s) => s.paymentMethod === 'wallet').reduce((s, x) => s + sumOfSale(x), 0);
  const qr     = m.filter((s) => s.paymentMethod === 'qr').reduce((s, x) => s + sumOfSale(x), 0);
  const debt   = m.filter((s) => s.paymentMethod === 'debt').reduce((s, x) => s + sumOfSale(x), 0);
  const card   = wallet + qr; // карта / перевод (безнал)
  return { total, cash, wallet, qr, card, debt, count: m.length };
}

function aggregateProfit() {
  const m = getPeriodSales();
  const revenue = m.reduce((s, x) => s + sumOfSale(x), 0);
  const cost = m.reduce((s, x) => s + costOfSale(x), 0);
  return { revenue, cost, profit: revenue - cost };
}

function aggregateStock() {
  const products = state.products || [];
  const costValue = products.reduce(
    (sum, p) => sum + (Number(p.qty) || 0) * (Number(p.costPrice) || 0), 0);
  const lowStock = products.filter((p) => Number(p.qty) < 5).length;
  return { count: products.length, costValue, lowStock };
}

function aggregateDebts() {
  const debts = state.debts || [];
  const active = debts.filter((d) => d.status !== 'paid' && Number(d.amount) > 0);
  const sum = active.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  return { count: active.length, sum };
}

function aggregateStaff() {
  const staff = state.staff || [];
  return {
    total: staff.length,
    active: staff.filter((s) => s.active !== false && s.uid).length,
    pending: staff.filter((s) => !s.uid).length,
  };
}

/** График недели — ВСЕГДА текущая неделя (не зависит от периода) */
function aggregateWeekChart() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  const labels = ['пн','вт','ср','чт','пт','сб','вс'];
  const buckets = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    buckets.push({ label: labels[i], date: d, total: 0, isToday: d.toDateString() === now.toDateString() });
  }
  (state.sales || []).forEach((s) => {
    const dt = toDate(s.createdAt);
    if (!dt) return;
    const idx = buckets.findIndex((b) => b.date.toDateString() === dt.toDateString());
    if (idx >= 0) buckets[idx].total += sumOfSale(s);
  });
  return buckets;
}

// =========================================================
// ИНДИКАТОР СЕТИ
// =========================================================
function setupNetIndicator() {
  const pill = document.getElementById('net-pill');
  if (!pill) return;
  const labelEl = pill.querySelector('.net-pill__label');
  const qtyEl = document.getElementById('net-queue-qty');

  const render = () => {
    const online = navigator.onLine;
    if (online) {
      pill.classList.remove('is-offline');
      if (labelEl) labelEl.textContent = 'онлайн';
      pill.dataset.queue = '0';
      if (qtyEl) qtyEl.textContent = '0';
    } else {
      pill.classList.add('is-offline');
      if (labelEl) labelEl.textContent = 'офлайн';
    }
  };

  window.addEventListener('online', () => { render(); toast('Соединение восстановлено'); });
  window.addEventListener('offline', () => { render(); toast('Нет сети — продажи сохранятся локально', true); });

  window.KUT_SET_NET_QUEUE = (count) => {
    if (!pill) return;
    pill.dataset.queue = String(count || 0);
    if (qtyEl) qtyEl.textContent = String(count || 0);
  };

  render();
}

async function tryEnablePersistence() {
  try {
    if (window.FB && typeof window.FB.enablePersistence === 'function') {
      await window.FB.enablePersistence();
      console.info('[KUT] enablePersistence вызван');
    } else {
      console.info('[KUT] enablePersistence не объявлена — офлайн без очереди');
    }
  } catch (err) {
    console.warn('[KUT] enablePersistence error:', err?.message || err);
  }
}

// =========================================================
// РЕНДЕР ДАШБОРДА
// =========================================================
function pick(attr, fallbackIds) {
  const byData = document.querySelector(`[data-kut="${attr}"]`);
  if (byData) return byData;
  if (fallbackIds) for (const id of fallbackIds) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}
function setNum(attr, value, fallbackIds) {
  const el = pick(attr, fallbackIds); if (el) el.textContent = fmt(value);
}
function setText(attr, value, fallbackIds) {
  const el = pick(attr, fallbackIds); if (el) el.textContent = value;
}

function renderAnalytics() {
  const rev = aggregateRevenue();
  const profit = aggregateProfit();
  const stock = aggregateStock();

  const elRev = document.getElementById('analyticsRevenue');
  const elProfit = document.getElementById('analyticsProfit');
  const elStock = document.getElementById('analyticsStockValue');

  if (elRev)    elRev.innerHTML    = `${fmt(Math.round(rev.total))}<small>KGS</small>`;
  if (elProfit) elProfit.innerHTML = `${fmt(Math.round(profit.profit))}<small>KGS</small>`;
  if (elStock)  elStock.innerHTML  = `${fmt(Math.round(stock.costValue))}<small>KGS</small>`;

  // Детализация кассы — Наличные / Карта-Перевод
  const elCash = document.getElementById('analyticsCash');
  const elCard = document.getElementById('analyticsCard');
  if (elCash) elCash.textContent = fmt(Math.round(rev.cash)) + ' KGS';
  if (elCard) elCard.textContent = fmt(Math.round(rev.card)) + ' KGS';

  // Подпись периода
  const period = document.getElementById('analytics-period');
  if (period) period.textContent = PERIOD_LABELS[state.period] || '';

  renderWeekChart();
}

function renderWeekChart() {
  const chart = document.getElementById('weekChart');
  const totalEl = document.getElementById('weekTotal');
  if (!chart) return;
  const buckets = aggregateWeekChart();
  const weekTotal = buckets.reduce((s, b) => s + b.total, 0);
  const max = Math.max(...buckets.map((b) => b.total), 1);
  if (totalEl) totalEl.textContent = fmt(Math.round(weekTotal)) + ' KGS';

  chart.innerHTML = buckets.map((b) => {
    const h = max > 0 ? Math.max(3, (b.total / max) * 100) : 3;
    const valText = b.total > 0 ? fmt(Math.round(b.total)) : '';
    return `
      <div class="chart__col">
        <div class="chart__bar ${b.isToday ? 'is-today' : ''}" style="height: ${h}%;">
          ${valText ? `<span class="chart__bar-value">${valText}</span>` : ''}
        </div>
        <span class="chart__label">${b.label}</span>
      </div>`;
  }).join('');
}

/** Модуль «Критические остатки» */
function renderCriticalStock() {
  const wrap = document.getElementById('criticalStock');
  const list = document.getElementById('criticalStockList');
  const sub  = document.getElementById('criticalStockSub');
  if (!wrap || !list) return;

  const THRESHOLD = 5;
  const critical = (state.products || [])
    .filter((p) => Number(p.qty) < THRESHOLD)
    .sort((a, b) => Number(a.qty) - Number(b.qty));

  if (critical.length === 0) {
    wrap.hidden = true;
    list.innerHTML = '';
    return;
  }

  wrap.hidden = false;
  if (sub) {
    sub.textContent = critical.length === 1
      ? 'Позиция с остатком < 5'
      : `${critical.length} позиц. с остатком < 5`;
  }

  const visible = critical.slice(0, 8);
  list.innerHTML = visible.map((p) => {
    const qty = Number(p.qty) || 0;
    const isZero = qty <= 0;
    const unit = escapeHtml(p.unit || 'шт');
    return `
      <li class="critical-stock__item${isZero ? ' is-zero' : ''}">
        <span class="critical-stock__name">${escapeHtml(p.name || 'Без названия')}</span>
        <span class="critical-stock__qty">
          <strong>${fmt(qty)}</strong>
          <small>${unit}</small>
        </span>
      </li>`;
  }).join('');

  if (critical.length > visible.length) {
    list.insertAdjacentHTML('beforeend', `
      <li class="critical-stock__more">
        и ещё ${critical.length - visible.length}…
      </li>`);
  }
}

function renderDashboard() {
  const revenue = aggregateRevenue();
  const stock = aggregateStock();
  const debts = aggregateDebts();
  const staff = aggregateStaff();

  setNum('revenue-total', Math.round(revenue.total), ['dashboard-total-sales']);
  setNum('stock-value', Math.round(stock.costValue), ['dashboard-stock-value']);
  setNum('debts-sum', Math.round(debts.sum), ['dashboard-total-debts']);

  setText('revenue-sub',
    revenue.count > 0
      ? `Продаж: ${revenue.count} · нал. ${fmt(revenue.cash)} · карта ${fmt(revenue.card)} · несие ${fmt(revenue.debt)}`
      : 'Продаж пока не было',
    ['sales-sub']);

  setText('stock-sub',
    stock.count > 0 ? `Позиций: ${stock.count} · заканчивается: ${stock.lowStock}` : 'Склад пуст',
    ['stock-sub']);

  setText('debts-sub',
    debts.count > 0 ? `Активных должников: ${debts.count}` : 'Активных должников нет',
    ['debts-sub']);

  const badge = document.getElementById('nav-debts-count');
  if (badge) {
    if (debts.count > 0) { badge.textContent = String(debts.count); badge.hidden = false; }
    else badge.hidden = true;
  }

  renderAnalytics();
  renderCriticalStock();

  const isManager = state.profile?.role === 'owner' || state.profile?.role === 'manager';
  if (isManager) {
    const sec = document.getElementById('staff-section');
    if (sec) sec.hidden = false;
    const st = document.getElementById('staff-total');
    const sa = document.getElementById('staff-active');
    const sp = document.getElementById('staff-pending');
    if (st) st.textContent = String(staff.total);
    if (sa) sa.textContent = String(staff.active);
    if (sp) sp.textContent = String(staff.pending);
    const navBadge = document.getElementById('nav-staff-count');
    if (navBadge) {
      if (staff.pending > 0) { navBadge.textContent = String(staff.pending); navBadge.hidden = false; }
      else navBadge.hidden = true;
    }
  }

  const upd = document.getElementById('updated-at');
  if (upd) upd.textContent = nowTimeHHMM();

  renderRecentSales();
}

/** Обработчик клика по чипсам периода */
function setupPeriodFilter() {
  const wrap = document.getElementById('periodChips');
  if (!wrap) return;
  if (wrap.dataset.wired === '1') return;
  wrap.dataset.wired = '1';

  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.period-chip');
    if (!btn) return;
    const period = btn.dataset.period;
    if (!period || period === state.period) return;

    state.period = period;

    // Переключаем активный класс на чипсах
    wrap.querySelectorAll('.period-chip').forEach((c) => {
      const active = c.dataset.period === period;
      c.classList.toggle('is-active', active);
      c.classList.toggle('active', active);
      c.setAttribute('aria-selected', String(active));
    });

    // Перерисовываем только то, что зависит от периода
    renderAnalytics();
  });
}

function renderRecentSales() {
  const container = document.getElementById('recent-sales');
  if (!container) return;
  const sales = (state.sales || []).slice()
    .sort((a, b) => {
      const ta = toDate(a.createdAt)?.getTime() || 0;
      const tb = toDate(b.createdAt)?.getTime() || 0;
      return tb - ta;
    }).slice(0, 20);

  if (sales.length === 0) {
    container.innerHTML = `<div class="recent__empty"><span>🧾</span>Продаж ещё не было. Начните с кассы.</div>`;
    return;
  }

  container.innerHTML = sales.map((s) => {
    const itemsCount = Array.isArray(s.items)
      ? s.items.reduce((n, i) => n + (Number(i.quantity != null ? i.quantity : i.qty) || 0), 0) : 0;
    const emoji = methodEmoji(s.paymentMethod);
    const title = methodTitle(s.paymentMethod, s.customer);
    const cashierLabel = s.cashierName ? ` · 🧑‍💼 ${escapeHtml(s.cashierName)}` : '';
    const amountCls = s.paymentMethod === 'debt' ? ' sale-row__amount--debt' : '';
    return `
      <div class="sale-row">
        <div class="sale-row__avatar">${emoji}</div>
        <div class="sale-row__info">
          <div class="sale-row__title">${escapeHtml(title)}</div>
          <div class="sale-row__meta">${formatSaleDate(s.createdAt)} · ${itemsCount} поз.${cashierLabel}</div>
        </div>
        <div class="sale-row__amount${amountCls}">${fmtMoney(sumOfSale(s))}</div>
      </div>`;
  }).join('');
}

function methodEmoji(m) {
  switch (m) {
    case 'cash':   return '💵';
    case 'wallet': return '📱';
    case 'qr':     return '🔳';
    case 'debt':   return '📝';
    default:       return '🧾';
  }
}
function methodTitle(m, customer) {
  switch (m) {
    case 'cash':   return 'Продажа · Наличные';
    case 'wallet': return 'Продажа · MBANK/Элсом/О!Деньги';
    case 'qr':     return 'Продажа · QR-оплата';
    case 'debt':   return `Продажа · Несие${customer ? ' — ' + customer : ''}`;
    default:       return 'Продажа';
  }
}
function formatSaleDate(ts) {
  const d = toDate(ts); if (!d) return '—';
  const now = new Date();
  const z = (n) => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return `сегодня, ${z(d.getHours())}:${z(d.getMinutes())}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `вчера, ${z(d.getHours())}:${z(d.getMinutes())}`;
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// =========================================================
// РОЛЬ — БЕЙДЖ
// =========================================================
function renderRoleBadge(profile) {
  const role = profile?.role || '';
  const label = roleLabel(role);
  const cls = 'role-badge--' + roleClass(role);

  const big = document.getElementById('role-badge');
  if (big) {
    big.textContent = label;
    big.className = 'role-badge ' + cls;
  }
  const small = document.getElementById('mobile-role-badge');
  if (small) {
    small.textContent = label;
    small.style.display = '';
  }
}

// =========================================================
// НИЖНЯЯ ПАНЕЛЬ
// =========================================================
function setupBottomNavHighlight() {
  const nav = document.getElementById('bottomNav') || document.querySelector('.bottom-nav');
  if (!nav) return;
  const current = getCurrentPage();
  nav.querySelectorAll('.bottom-nav__item').forEach((a) => {
    const isActive = a.dataset.page === current;
    a.classList.toggle('active', isActive);
    a.classList.toggle('is-active', isActive);
    if (isActive) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function setupBottomNavScan() {
  const btn = document.getElementById('bottomNavScan');
  if (!btn) return;
  if (btn.dataset.wired === '1') return;
  btn.dataset.wired = '1';

  btn.addEventListener('click', () => {
    const page = getCurrentPage();

    if (page === 'cash') {
      const cashScan = document.getElementById('cashScanBtn');
      if (cashScan) { cashScan.click(); return; }
      window.location.href = './cash.html?scan=1';
      return;
    }

    if (page === 'stock') {
      const modal = document.getElementById('productModal');
      const isOpen = modal && !modal.hidden;
      if (!isOpen) {
        const addBtn = document.getElementById('openAddBtn');
        if (addBtn) addBtn.click();
      }
      setTimeout(() => {
        const scanBtn = document.getElementById('barcodeScanBtn');
        if (scanBtn) scanBtn.click();
      }, 250);
      return;
    }

    window.location.href = './cash.html?scan=1';
  });
}

function handleAutoScanParam() {
  if (getCurrentPage() !== 'cash') return;
  let params;
  try { params = new URLSearchParams(window.location.search); }
  catch (_) { return; }

  if (params.get('scan') !== '1') return;

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('scan');
    history.replaceState({}, '', url.toString());
  } catch (_) {}

  let tries = 0;
  const tick = () => {
    const cashScan = document.getElementById('cashScanBtn');
    if (cashScan) { cashScan.click(); return; }
    if (tries++ < 20) setTimeout(tick, 150);
  };
  setTimeout(tick, 800);
}

// =========================================================
// САЙДБАР
// =========================================================
function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const burger = document.getElementById('burger');
  if (!sidebar || !burger) return;
  if (burger.dataset.wired === '1') return;
  burger.dataset.wired = '1';

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
  burger.addEventListener('click', () => {
    sidebar.classList.contains('is-open') ? close() : open();
  });
  if (overlay) overlay.addEventListener('click', close);
  sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('is-open')) close();
  });
  window.addEventListener('resize', () => { if (window.innerWidth >= 1000) close(); });
}

// =========================================================
// ПРОФИЛЬ
// =========================================================
function mountProfileBlock() {
  const slot = document.getElementById('sidebar-profile-slot');
  if (!slot) return;
  const p = state.profile || {};
  const name = p.displayName || p.email || 'Пользователь';
  const role = roleLabel(p.role);
  const roleCls = roleClass(p.role);
  const initials = getInitials(name);

  slot.innerHTML = `
    <button class="sidebar-profile" id="sidebarProfileBtn" type="button" aria-label="Открыть профиль">
      <span class="sidebar-profile__avatar sidebar-profile__avatar--${roleCls}">${escapeHtml(initials)}</span>
      <span class="sidebar-profile__info">
        <span class="sidebar-profile__name">${escapeHtml(name)}</span>
        <span class="sidebar-profile__role">${escapeHtml(role)}</span>
      </span>
      <span class="sidebar-profile__chevron" aria-hidden="true">›</span>
    </button>
  `;
  const btn = document.getElementById('sidebarProfileBtn');
  if (btn) btn.addEventListener('click', openProfileModal);
}

function mountLogoutBlock() {
  const slot = document.getElementById('sidebar-logout-slot');
  if (!slot) return;
  slot.innerHTML = `
    <button class="sidebar-logout" id="sidebarLogoutBtn" type="button">
      <span class="sidebar-logout__icon" aria-hidden="true">🚪</span>
      <span class="sidebar-logout__text">Выйти из аккаунта</span>
    </button>
  `;
  const btn = document.getElementById('sidebarLogoutBtn');
  if (btn) btn.addEventListener('click', () => {
    if (!confirm('Выйти из аккаунта?')) return;
    window.FB.logout();
  });
}

function injectProfileStyles() {
  if (document.getElementById('kut-profile-styles')) return;
  const css = `
    .sidebar-profile {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 10px;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px; cursor: pointer;
      font-family: inherit; color: #fff; text-align: left;
      transition: background .18s ease, border-color .18s ease;
      margin-bottom: 4px;
    }
    .sidebar-profile:hover { background: rgba(255,255,255,.14); border-color: rgba(212,175,55,.35); }
    .sidebar-profile__avatar {
      width: 42px; height: 42px; border-radius: 50%;
      display: grid; place-items: center;
      font-size: 15px; font-weight: 800; letter-spacing: .5px;
      background: linear-gradient(135deg, #D4AF37, #B8952A);
      color: #003F2A; flex-shrink: 0;
      box-shadow: 0 4px 12px rgba(0,0,0,.20);
      text-transform: uppercase;
    }
    .sidebar-profile__avatar--owner   { background: linear-gradient(135deg, #D4AF37, #B8952A); color: #003F2A; }
    .sidebar-profile__avatar--manager { background: linear-gradient(135deg, #F0B458, #B87117); color: #3F2400; }
    .sidebar-profile__avatar--cashier { background: linear-gradient(135deg, #7FE4A5, #1EBE5A); color: #003F2A; }
    .sidebar-profile__avatar--admin   { background: linear-gradient(135deg, #E0F0FF, #7FB8E0); color: #003F5C; }
    .sidebar-profile__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sidebar-profile__name {
      font-size: 14px; font-weight: 700; color: #fff;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sidebar-profile__role {
      font-size: 11px; font-weight: 600;
      color: rgba(212,175,55,.95);
      text-transform: uppercase; letter-spacing: .3px;
    }
    .sidebar-profile__chevron { font-size: 20px; color: rgba(255,255,255,.5); flex-shrink: 0; line-height: 1; }
    .sidebar-logout {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 12px 14px;
      background: rgba(192,57,43,.14);
      border: 1px solid rgba(192,57,43,.30);
      color: #FFD0C8; border-radius: 12px;
      font-family: inherit; font-size: 14px; font-weight: 600;
      cursor: pointer; text-align: left;
      transition: background .18s ease, color .18s ease, border-color .18s ease;
      margin-top: 8px;
    }
    .sidebar-logout:hover { background: rgba(192,57,43,.24); color: #fff; border-color: rgba(192,57,43,.50); }
    .sidebar-logout__icon { font-size: 16px; flex-shrink: 0; }
    .sidebar-logout__text { flex: 1; }

    .kut-modal[hidden] { display: none; }
    .kut-modal { position: fixed; inset: 0; z-index: 110; display: grid; place-items: center; padding: 16px; }
    .kut-modal__backdrop {
      position: absolute; inset: 0;
      background: rgba(15,30,24,.55);
      backdrop-filter: blur(4px);
      animation: kutFadeIn .2s ease;
    }
    .kut-modal__dialog {
      position: relative; width: 100%; max-width: 500px;
      background: #fff; border-radius: 22px; padding: 22px;
      box-shadow: 0 18px 48px rgba(16,32,25,.28);
      max-height: 92dvh; overflow-y: auto;
      animation: kutPopIn .22s cubic-bezier(.2,.9,.3,1.2);
    }
    .kut-modal__dialog h3 { margin: 0 0 4px; font-size: 19px; font-weight: 800; color: #14211C; }
    .kut-modal__subtitle { margin: 0 0 18px; color: #64776E; font-size: 13px; line-height: 1.4; }
    @keyframes kutFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes kutPopIn { from { opacity: 0; transform: translateY(12px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .kut-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .kut-field label { font-size: 13px; font-weight: 600; color: #14211C; }
    .kut-field label .kut-req { color: #C0392B; margin-left: 2px; }
    .kut-field input {
      width: 100%; padding: 12px 14px; border-radius: 10px; border: 1.5px solid #E3EAE6;
      background: #fff; font-family: inherit; font-size: 15px; color: #14211C; outline: none;
      transition: border-color .18s ease, box-shadow .18s ease;
    }
    .kut-field input:focus { border-color: #005F40; box-shadow: 0 0 0 4px rgba(0,95,64,.12); }
    .kut-field input.is-invalid { border-color: #C0392B; box-shadow: 0 0 0 4px rgba(192,57,43,.12); }
    .kut-field__hint { font-size: 12px; color: #64776E; min-height: 14px; }
    .kut-field__hint.is-error { color: #C0392B; font-weight: 500; }
    .kut-requests { margin-top: 20px; padding-top: 16px; border-top: 1px solid #E3EAE6; }
    .kut-requests h4 {
      margin: 0 0 10px; font-size: 13px; font-weight: 800;
      text-transform: uppercase; letter-spacing: .5px; color: #005F40;
      display: flex; align-items: center; gap: 8px;
    }
    .kut-requests__badge {
      display: inline-grid; place-items: center;
      min-width: 22px; height: 22px; padding: 0 6px;
      background: #D4AF37; color: #003F2A;
      border-radius: 999px; font-size: 11px; font-weight: 800;
    }
    .kut-request {
      background: #FBFDFC; border: 1px solid #E3EAE6;
      border-radius: 12px; padding: 12px 14px; margin-bottom: 10px;
    }
    .kut-request:last-child { margin-bottom: 0; }
    .kut-request__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .kut-request__name { font-weight: 700; font-size: 14px; color: #14211C; }
    .kut-request__date { font-size: 11px; color: #64776E; font-variant-numeric: tabular-nums; }
    .kut-request__diff { font-size: 12px; color: #64776E; line-height: 1.6; margin-bottom: 10px; }
    .kut-request__diff b { color: #14211C; }
    .kut-request__arrow { color: #005F40; font-weight: 700; margin: 0 6px; }
    .kut-request__actions { display: flex; gap: 8px; }
    .kut-request__actions button {
      flex: 1; padding: 9px 12px; border-radius: 10px; border: 1px solid transparent;
      font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
    }
    .kut-btn-approve { background: #005F40; color: #fff; }
    .kut-btn-approve:hover { background: #003F2A; }
    .kut-btn-reject { background: transparent; color: #C0392B; border-color: rgba(192,57,43,.30) !important; }
    .kut-btn-reject:hover { background: rgba(192,57,43,.08); border-color: #C0392B !important; }
    .kut-requests__empty { font-size: 13px; color: #64776E; padding: 10px 0; text-align: center; }
    .kut-actions { display: flex; gap: 10px; margin-top: 20px; }
    .kut-actions button {
      flex: 1; padding: 13px 16px; border-radius: 12px; border: 1px solid transparent;
      font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer;
    }
    .kut-btn-primary { background: #005F40; color: #fff; }
    .kut-btn-primary:hover { background: #003F2A; }
    .kut-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
    .kut-btn-ghost { background: transparent; color: #14211C; border-color: #E3EAE6 !important; }
    .kut-btn-ghost:hover { background: #E6F1ED; border-color: #005F40 !important; color: #005F40; }
    .kut-info-box {
      padding: 10px 12px; background: #FFF8E1;
      border: 1px solid #E3C97A; border-radius: 10px;
      color: #7A5E00; font-size: 12px; line-height: 1.5; margin-bottom: 14px;
    }
  `;
  const style = document.createElement('style');
  style.id = 'kut-profile-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

function ensureProfileModal() {
  let modal = document.getElementById('kutProfileModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'kut-modal';
  modal.id = 'kutProfileModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="kut-modal__backdrop" data-close-profile></div>
    <div class="kut-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="kutProfileTitle">
      <h3 id="kutProfileTitle">Мой профиль</h3>
      <p class="kut-modal__subtitle" id="kutProfileSub">Измените свои данные. Изменения сохранятся.</p>

      <div class="kut-info-box" id="kutProfileInfo" hidden></div>

      <form id="kutProfileForm" novalidate>
        <div class="kut-field">
          <label for="kutPfName">Имя <span class="kut-req">*</span></label>
          <input type="text" id="kutPfName" placeholder="Как вас зовут" maxlength="60" autocomplete="name" required>
          <div class="kut-field__hint" data-for="kutPfName"></div>
        </div>

        <div class="kut-field">
          <label for="kutPfPhone">Телефон (WhatsApp)</label>
          <input type="tel" id="kutPfPhone" placeholder="+996 700 123 456" inputmode="tel" autocomplete="tel">
          <div class="kut-field__hint" data-for="kutPfPhone"></div>
        </div>

        <div class="kut-requests" id="kutRequestsBlock" hidden>
          <h4>Заявки от сотрудников <span class="kut-requests__badge" id="kutRequestsCount">0</span></h4>
          <div id="kutRequestsList">
            <div class="kut-requests__empty">Пока нет активных заявок</div>
          </div>
        </div>

        <div class="kut-actions">
          <button type="button" class="kut-btn-ghost" data-close-profile>Закрыть</button>
          <button type="submit" class="kut-btn-primary" id="kutProfileSaveBtn">Сохранить</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target.matches('[data-close-profile]')) closeProfileModal();
  });

  const form = modal.querySelector('#kutProfileForm');
  form.addEventListener('submit', saveProfile);

  return modal;
}

function openProfileModal() {
  injectProfileStyles();
  const modal = ensureProfileModal();
  const p = state.profile || {};

  const nameEl = modal.querySelector('#kutPfName');
  const phoneEl = modal.querySelector('#kutPfPhone');
  const subEl = modal.querySelector('#kutProfileSub');
  const infoEl = modal.querySelector('#kutProfileInfo');
  const reqBlock = modal.querySelector('#kutRequestsBlock');
  const reqCount = modal.querySelector('#kutRequestsCount');
  const reqList = modal.querySelector('#kutRequestsList');

  nameEl.value = p.displayName || '';
  phoneEl.value = p.phone || '';

  modal.querySelectorAll('.kut-field__hint').forEach((h) => {
    h.textContent = ''; h.classList.remove('is-error');
  });
  modal.querySelectorAll('input').forEach((i) => i.classList.remove('is-invalid'));

  const isOwner = p.role === 'owner';
  const isEmployee = p.role === 'cashier' || p.role === 'manager';

  if (isEmployee) {
    subEl.textContent = 'Заполните новые данные — они отправятся владельцу на подтверждение.';
    infoEl.hidden = false;
    infoEl.innerHTML = '⚠️ Ваши изменения будут сохранены только после одобрения владельцем бизнеса.';
  } else if (isOwner) {
    subEl.textContent = 'Измените свои данные — они сохранятся мгновенно.';
    infoEl.hidden = true;
  } else {
    subEl.textContent = 'Измените свои данные.';
    infoEl.hidden = true;
  }

  if (isOwner) {
    reqBlock.hidden = false;
    renderRequests(reqList, reqCount);
  } else {
    reqBlock.hidden = true;
  }

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => nameEl.focus());
}

function closeProfileModal() {
  const modal = document.getElementById('kutProfileModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

async function saveProfile(event) {
  event.preventDefault();
  const modal = document.getElementById('kutProfileModal');
  const p = state.profile || {};
  const nameEl = modal.querySelector('#kutPfName');
  const phoneEl = modal.querySelector('#kutPfPhone');
  const saveBtn = modal.querySelector('#kutProfileSaveBtn');
  const infoEl = modal.querySelector('#kutProfileInfo');

  modal.querySelectorAll('.kut-field__hint').forEach((h) => {
    h.textContent = ''; h.classList.remove('is-error');
  });
  modal.querySelectorAll('input').forEach((i) => i.classList.remove('is-invalid'));

  const newName = nameEl.value.trim();
  const newPhoneRaw = phoneEl.value.trim();

  let ok = true;
  if (newName.length < 2) {
    const hint = modal.querySelector('.kut-field__hint[data-for="kutPfName"]');
    const input = modal.querySelector('#kutPfName');
    input.classList.add('is-invalid');
    if (hint) { hint.textContent = 'Имя минимум 2 символа'; hint.classList.add('is-error'); }
    ok = false;
  }

  let newPhone = '';
  if (newPhoneRaw) {
    const digits = newPhoneRaw.replace(/\D/g, '');
    if (digits.length < 7) {
      const hint = modal.querySelector('.kut-field__hint[data-for="kutPfPhone"]');
      const input = modal.querySelector('#kutPfPhone');
      input.classList.add('is-invalid');
      if (hint) { hint.textContent = 'Введите корректный номер или оставьте пустым'; hint.classList.add('is-error'); }
      ok = false;
    } else {
      newPhone = newPhoneRaw;
    }
  }

  if (!ok) return;

  const oldData = { displayName: p.displayName || '', phone: p.phone || '' };
  const newData = { displayName: newName, phone: newPhone };

  if (oldData.displayName === newData.displayName && oldData.phone === newData.phone) {
    toast('Изменений нет');
    closeProfileModal();
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Сохраняем...';

  try {
    const { db, doc, updateDoc, addDoc, collection, serverTimestamp } = window.FB;
    const isOwner = p.role === 'owner';

    if (isOwner) {
      await updateDoc(doc(db, 'users', p.uid), {
        displayName: newData.displayName,
        phone: newData.phone,
        updatedAt: serverTimestamp(),
      });
      state.profile = { ...p, displayName: newData.displayName, phone: newData.phone };
      mountProfileBlock();
      renderRoleBadge(state.profile);
      toast('Профиль обновлён');
      closeProfileModal();
    } else {
      if (!state.businessId) { toast('Нет привязанного бизнеса', true); return; }
      await addDoc(collection(db, 'businesses', state.businessId, 'requests'), {
        uid: p.uid, role: p.role, email: p.email || '',
        oldData, newData, status: 'pending', createdAt: serverTimestamp(),
      });
      if (infoEl) {
        infoEl.hidden = false;
        infoEl.innerHTML = '✅ Изменения отправлены на подтверждение владельцу.';
      }
      toast('Изменения отправлены на подтверждение владельцу');
      setTimeout(() => closeProfileModal(), 1200);
    }
  } catch (err) {
    console.error('[profile] save failed:', err);
    toast('Не удалось сохранить: ' + (err.code || err.message), true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Сохранить';
  }
}

// =========================================================
// ЗАЯВКИ
// =========================================================
function renderRequests(listEl, countEl) {
  if (!listEl) return;
  const list = (state.requests || []).filter((r) => r.status === 'pending');
  if (countEl) countEl.textContent = String(list.length);

  if (list.length === 0) {
    listEl.innerHTML = '<div class="kut-requests__empty">Пока нет активных заявок</div>';
    return;
  }

  listEl.innerHTML = list.map((r) => {
    const name = (r.oldData && r.oldData.displayName) || r.email || 'Сотрудник';
    const role = roleLabel(r.role);
    const oldName = (r.oldData && r.oldData.displayName) || '—';
    const newName = (r.newData && r.newData.displayName) || '—';
    const oldPhone = (r.oldData && r.oldData.phone) || '—';
    const newPhone = (r.newData && r.newData.phone) || '—';
    const created = toDate(r.createdAt);
    const dateStr = created
      ? `${String(created.getDate()).padStart(2,'0')}.${String(created.getMonth()+1).padStart(2,'0')} ${String(created.getHours()).padStart(2,'0')}:${String(created.getMinutes()).padStart(2,'0')}`
      : '—';

    const nameLine = oldName !== newName
      ? `<div><b>Имя:</b> ${escapeHtml(oldName)}<span class="kut-request__arrow">→</span>${escapeHtml(newName)}</div>`
      : '';
    const phoneLine = oldPhone !== newPhone
      ? `<div><b>Телефон:</b> ${escapeHtml(oldPhone)}<span class="kut-request__arrow">→</span>${escapeHtml(newPhone)}</div>`
      : '';

    return `
      <div class="kut-request" data-request-id="${escapeHtml(r.id)}">
        <div class="kut-request__head">
          <div class="kut-request__name">${escapeHtml(name)} <span style="color:#64776E; font-weight:500; font-size:12px;">· ${escapeHtml(role)}</span></div>
          <div class="kut-request__date">${dateStr}</div>
        </div>
        <div class="kut-request__diff">
          ${nameLine || phoneLine || '<div>Нет изменений</div>'}
        </div>
        <div class="kut-request__actions">
          <button class="kut-btn-approve" type="button" data-act="approve" data-uid="${escapeHtml(r.uid)}" data-req="${escapeHtml(r.id)}">✓ Одобрить</button>
          <button class="kut-btn-reject" type="button" data-act="reject" data-req="${escapeHtml(r.id)}">✕ Отклонить</button>
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      const reqId = btn.dataset.req;
      const uid = btn.dataset.uid;
      btn.disabled = true;

      try {
        const { db, doc, deleteDoc, updateDoc, serverTimestamp } = window.FB;
        if (act === 'approve') {
          const req = state.requests.find((r) => r.id === reqId);
          if (!req) throw new Error('Заявка не найдена');
          await updateDoc(doc(db, 'users', uid), {
            displayName: req.newData.displayName,
            phone: req.newData.phone,
            updatedAt: serverTimestamp(),
          });
          await deleteDoc(doc(db, 'businesses', state.businessId, 'requests', reqId));
          toast('Заявка одобрена');
        } else {
          await deleteDoc(doc(db, 'businesses', state.businessId, 'requests', reqId));
          toast('Заявка отклонена');
        }
      } catch (err) {
        console.error('[requests] action failed:', err);
        toast('Ошибка: ' + (err.code || err.message), true);
        btn.disabled = false;
      }
    });
  });
}

function subscribeRequests() {
  if (!state.businessId) return;
  if (state.profile?.role !== 'owner') return;

  try {
    const { db, collection, query, where, onSnapshot } = window.FB;
    const q = query(
      collection(db, 'businesses', state.businessId, 'requests'),
      where('status', '==', 'pending')
    );
    state.unsubRequests = onSnapshot(q, (snap) => {
      state.requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const modal = document.getElementById('kutProfileModal');
      if (modal && !modal.hidden) {
        const listEl = modal.querySelector('#kutRequestsList');
        const countEl = modal.querySelector('#kutRequestsCount');
        renderRequests(listEl, countEl);
      }
    }, (err) => {
      console.warn('[requests] subscribe error:', err);
    });
  } catch (err) {
    console.warn('[requests] subscribe init:', err);
  }
}

// =========================================================
// АВТО-ПРИВЯЗКА КАССИРА
// =========================================================
async function tryClaimStaffInvite(profile, user) {
  const phone = profile.phone;
  if (!phone || !/^\+\d{8,15}$/.test(phone)) return null;
  const phoneKey = phone.replace(/\D/g, '');
  const { db, doc, getDoc, updateDoc, serverTimestamp } = window.FB;
  try {
    const staffRef = doc(db, 'staff', phoneKey);
    const snap = await getDoc(staffRef);
    if (!snap.exists()) return null;
    const staff = snap.data();
    if (!staff.businessId) return null;
    if (staff.active === false) return null;
    await updateDoc(doc(db, 'users', user.uid), {
      businessId: staff.businessId,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(staffRef, { uid: user.uid, claimedAt: serverTimestamp() });
    return { ...profile, businessId: staff.businessId };
  } catch (err) {
    console.error('[KUT] tryClaimStaffInvite failed:', err);
    return null;
  }
}

// =========================================================
// PUBLIC API
// =========================================================
const KEYS = {
  products:  'kut_products',
  sales:     'kut:sales',
  debts:     'kut_debts',
  customers: 'kut:customers',
};
const getProducts = () => state.products || [];
const getSales    = () => state.sales || [];
const getDebts    = () => state.debts || [];

async function reloadAll() {
  if (!state.businessId) return;
  const [products, sales, debts] = await Promise.all([
    window.FB.getCollection('products'),
    window.FB.getCollection('sales'),
    window.FB.getCollection('debts'),
  ]);
  state.products = products;
  state.sales = sales;
  state.debts = debts;
}

async function registerSale({ cart, total, paymentMethod, customer, customerPhone, cashier }) {
  if (!state.businessId) return { ok: false, error: 'no_business' };

  for (const item of cart) {
    const p = state.products.find((x) => x.id === (item.productId || item.id));
    if (!p) return { ok: false, error: 'stock', reason: 'missing',
      item: { name: item.name, available: 0, unit: 'шт' } };
    const available = Number(p.qty) || 0;
    const need = Number(item.quantity != null ? item.quantity : item.qty) || 0;
    if (available < need) {
      return { ok: false, error: 'stock', reason: 'insufficient',
        item: { name: p.name, available, unit: p.unit || 'шт' } };
    }
  }

  const bizId = state.businessId;
  const { db, collection, doc, writeBatch, serverTimestamp } = window.FB;

  const staffInfo = cashier || {
    uid:  state.profile?.uid || '',
    name: state.profile?.displayName || state.profile?.email || '',
    email: state.profile?.email || '',
    role: state.profile?.role || 'cashier',
  };

  try {
    const batch = writeBatch(db);

    const items = cart.map((i) => {
      const pid = i.productId || i.id;
      const stockProd = state.products.find((x) => x.id === pid);
      const costPrice = Number(
        i.costPrice != null ? i.costPrice :
        (stockProd ? stockProd.costPrice : 0)
      ) || 0;
      const quantity = Number(i.quantity != null ? i.quantity : i.qty) || 0;
      const price = Number(i.price) || 0;
      return {
        productId: pid, id: pid,
        name: i.name, price, costPrice,
        unit: i.unit || 'шт',
        quantity, qty: quantity,
      };
    });

    const saleRef = doc(collection(db, 'businesses', bizId, 'sales'));
    batch.set(saleRef, {
      items,
      total: Number(total) || 0,
      totalSum: Number(total) || 0,
      paymentMethod,
      customer: paymentMethod === 'debt' ? String(customer || '').trim() : null,
      cashierUid:  staffInfo.uid,
      cashierName: staffInfo.name,
      cashierRole: staffInfo.role,
      createdAt: serverTimestamp(),
    });

    for (const item of items) {
      const stockProd = state.products.find((x) => x.id === item.productId);
      if (!stockProd) continue;
      const newQty = Math.max(0, (Number(stockProd.qty) || 0) - item.quantity);
      const pRef = doc(db, 'businesses', bizId, 'products', item.productId);
      batch.update(pRef, { qty: Number(newQty.toFixed(2)), updatedAt: serverTimestamp() });
    }

    if (paymentMethod === 'debt') {
      const debtRef = doc(collection(db, 'businesses', bizId, 'debts'));
      batch.set(debtRef, {
        name: String(customer || '').trim(),
        phone: customerPhone ? normalizePhone(customerPhone) : '',
        initialAmount: Number(total) || 0,
        amount: Number(total) || 0,
        date: todayISO(),
        dueDate: '',
        note: 'Автоматически из продажи в кассе',
        status: 'active',
        payments: [],
        saleId: saleRef.id,
        source: 'cash',
        cashierUid: staffInfo.uid,
        cashierName: staffInfo.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    await reloadAll();
    renderDashboard();
    return { ok: true, sale: { id: saleRef.id } };
  } catch (err) {
    console.error('[KUT] registerSale failed:', err);
    return { ok: false, error: 'firestore', message: err.message };
  }
}

window.KUT = {
  keys: KEYS,
  fmt, fmtMoney, uid, todayISO, normalizePhone, escapeHtml, toast, toDate,
  getProducts, getSales, getDebts,
  registerSale, reloadAll,
  aggregateRevenue, aggregateProfit, aggregateStock, aggregateDebts, aggregateStaff, aggregateWeekChart,
  renderDashboard,
  getState: () => state,
  read: () => null, write: () => false, onStorage: () => {},
};

// =========================================================
// АВТОЗАПУСК
// =========================================================
async function boot() {
  setupNetIndicator();
  await tryEnablePersistence();

  const { user, profile } = await window.FB.waitForAuth();
  if (!user || !profile) { window.location.href = './login.html'; return; }
  if (profile.active === false) {
    alert('Ваш аккаунт заблокирован. Свяжитесь с администратором.');
    await window.FB.logout(); return;
  }
  if (profile.role === 'super_admin') { window.location.href = './admin.html'; return; }

  state.profile = profile;
  state.businessId = profile.businessId;

  if (!state.businessId && profile.role === 'cashier') {
    const claimed = await tryClaimStaffInvite(profile, user);
    if (claimed) { state.profile = claimed; state.businessId = claimed.businessId; }
  }

  renderRoleBadge(state.profile);

  const isManager = profile.role === 'owner' || profile.role === 'manager';
  if (isManager) {
    const navStaff = document.getElementById('nav-staff-link');
    if (navStaff) navStaff.hidden = false;
  }

  setupSidebar();
  injectProfileStyles();
  mountProfileBlock();
  mountLogoutBlock();
  ensureProfileModal();

  setupBottomNavHighlight();
  setupBottomNavScan();
  setupPeriodFilter();
  handleAutoScanParam();

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    if (!confirm('Выйти из аккаунта?')) return;
    window.FB.logout();
  });

  if (!state.businessId) {
    const box = document.querySelector('.main-content') || document.querySelector('.wrap') || document.querySelector('.pos');
    if (box) {
      box.insertAdjacentHTML('afterbegin',
        '<div style="padding:14px 16px;background:#FFF8E1;border:1px solid #E3C97A;border-radius:14px;color:#7A5E00;font-size:13px;margin-bottom:16px;">' +
        '⚠️ У вашего аккаунта пока нет привязанного бизнеса. Попросите владельца пригласить вас в разделе «Сотрудники».</div>');
    }
    return;
  }

  await reloadAll();
  renderDashboard();

  window.FB.subscribeCollection('products', (items) => { state.products = items; renderDashboard(); });
  window.FB.subscribeCollection('sales',    (items) => { state.sales = items;    renderDashboard(); });
  window.FB.subscribeCollection('debts',    (items) => { state.debts = items;    renderDashboard(); });

  if (isManager) {
    try {
      const { db, collection, query, where, onSnapshot } = window.FB;
      const q = query(collection(db, 'staff'), where('businessId', '==', state.businessId));
      onSnapshot(q, (snap) => {
        state.staff = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderDashboard();
      }, (err) => console.warn('[KUT] staff subscribe error:', err));
    } catch (err) {
      console.warn('[KUT] staff subscribe init:', err);
    }
  }

  subscribeRequests();

  window.addEventListener('kut:lang', () => renderDashboard());

  window.addEventListener('beforeunload', () => {
    if (state.unsubRequests) state.unsubRequests();
  });

  console.info('[KUT] Ядро готово · бизнес:', state.businessId, '· роль:', profile.role, '· период:', state.period);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
