/* =========================================================
   КУТ: БИЗНЕС — Ядро системы (app.js) · Firebase v6
   + Аналитика: выручка, чистая прибыль, склад, график
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
  const z = (n) => String(n).padStart(2, '0');
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
      'position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));' +
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
};

// =========================================================
// АГРЕГАТЫ
// =========================================================
function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Возвращает продажи за текущий месяц */
function getMonthSales() {
  const start = startOfMonth();
  return (state.sales || []).filter((s) => {
    const t = toDate(s.createdAt)?.getTime() || 0;
    return t >= start;
  });
}

function sumOfSale(s) {
  // Поддерживаем оба имени: total и totalSum
  return Number(s.totalSum != null ? s.totalSum : s.total) || 0;
}

function costOfSale(s) {
  // Сумма себестоимости всех items в продаже
  if (!Array.isArray(s.items)) return 0;
  return s.items.reduce((sum, it) => {
    const qty = Number(it.quantity != null ? it.quantity : it.qty) || 0;
    const cost = Number(it.costPrice) || 0;
    return sum + qty * cost;
  }, 0);
}

function aggregateRevenue() {
  const monthSales = getMonthSales();
  const total = monthSales.reduce((s, x) => s + sumOfSale(x), 0);
  const cash = monthSales.filter((s) => s.paymentMethod === 'cash').reduce((s, x) => s + sumOfSale(x), 0);
  const wallet = monthSales.filter((s) => s.paymentMethod === 'wallet').reduce((s, x) => s + sumOfSale(x), 0);
  const debt = monthSales.filter((s) => s.paymentMethod === 'debt').reduce((s, x) => s + sumOfSale(x), 0);
  return { total, cash, wallet, debt, count: monthSales.length };
}

function aggregateProfit() {
  const monthSales = getMonthSales();
  const revenue = monthSales.reduce((s, x) => s + sumOfSale(x), 0);
  const cost = monthSales.reduce((s, x) => s + costOfSale(x), 0);
  return { revenue, cost, profit: revenue - cost };
}

function aggregateStock() {
  const products = state.products || [];
  const costValue = products.reduce(
    (sum, p) => sum + (Number(p.qty) || 0) * (Number(p.costPrice) || 0), 0);
  const saleValue = products.reduce(
    (sum, p) => sum + (Number(p.qty) || 0) * (Number(p.salePrice) || 0), 0);
  const lowStock = products.filter((p) => Number(p.qty) < 5).length;
  return { count: products.length, costValue, saleValue, lowStock };
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

/** Выручка по дням текущей недели (Пн–Вс) */
function aggregateWeekChart() {
  const now = new Date();
  // Понедельник текущей недели
  const day = now.getDay(); // 0 - Вс, 1 - Пн...
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);

  const buckets = [];
  const labels = ['пн','вт','ср','чт','пт','сб','вс'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    buckets.push({
      label: labels[i],
      date: d,
      total: 0,
      isToday: d.toDateString() === now.toDateString(),
    });
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
// РЕНДЕР ДАШБОРДА
// =========================================================
function pick(attr, fallbackIds) {
  const byData = document.querySelector(`[data-kut="${attr}"]`);
  if (byData) return byData;
  if (fallbackIds) {
    for (const id of fallbackIds) {
      const el = document.getElementById(id);
      if (el) return el;
    }
  }
  return null;
}
function setNum(attr, value, fallbackIds) {
  const el = pick(attr, fallbackIds);
  if (el) el.textContent = fmt(value);
}
function setText(attr, value, fallbackIds) {
  const el = pick(attr, fallbackIds);
  if (el) el.textContent = value;
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

  // Период в шапке блока
  const period = document.getElementById('analytics-period');
  if (period) {
    const now = new Date();
    const monthNames = ['январь','февраль','март','апрель','май','июнь',
                        'июль','август','сентябрь','октябрь','ноябрь','декабрь'];
    period.textContent = 'за ' + monthNames[now.getMonth()] + ' ' + now.getFullYear();
  }

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
      ? `Продаж за месяц: ${revenue.count} · нал. ${fmt(revenue.cash)} · кошелёк ${fmt(revenue.wallet)} · несие ${fmt(revenue.debt)}`
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

  // Аналитика
  renderAnalytics();

  // Сотрудники (только owner/manager)
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

function renderRecentSales() {
  const container = document.getElementById('recent-sales');
  if (!container) return;
  const sales = (state.sales || []).slice()
    .sort((a, b) => {
      const ta = toDate(a.createdAt)?.getTime() || 0;
      const tb = toDate(b.createdAt)?.getTime() || 0;
      return tb - ta;
    }).slice(0, 5);

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
    case 'debt':   return '📝';
    default:       return '🧾';
  }
}
function methodTitle(m, customer) {
  switch (m) {
    case 'cash':   return 'Продажа · Наличные';
    case 'wallet': return 'Продажа · MBANK/Элсом/О!Деньги';
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
// САЙДБАР
// =========================================================
function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const burger = document.getElementById('burger');
  if (!sidebar || !burger) return;
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

    // ⬇️ Готовим items с зафиксированной себестоимостью
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
        productId: pid,
        id: pid,
        name: i.name,
        price,
        costPrice,
        unit: i.unit || 'шт',
        quantity,
        qty: quantity,
      };
    });

    const saleRef = doc(collection(db, 'businesses', bizId, 'sales'));
    batch.set(saleRef, {
      items,
      total: Number(total) || 0,
      totalSum: Number(total) || 0,   // дублируем для совместимости с ТЗ
      paymentMethod,
      customer: paymentMethod === 'debt' ? String(customer || '').trim() : null,
      cashierUid:  staffInfo.uid,
      cashierName: staffInfo.name,
      cashierRole: staffInfo.role,
      createdAt: serverTimestamp(),
    });

    // Списание со склада
    for (const item of items) {
      const pRef = doc(db, 'businesses', bizId, 'products', item.productId);
      const stockProd = state.products.find((x) => x.id === item.productId);
      if (!stockProd) continue;
      const newQty = Math.max(0, (Number(stockProd.qty) || 0) - item.quantity);
      batch.update(pRef, {
        qty: Number(newQty.toFixed(2)),
        updatedAt: serverTimestamp(),
      });
    }

    // Долг при "Несие"
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

  const who = document.getElementById('user-name');
  if (who) who.textContent = profile.displayName || profile.email || 'Пользователь';

  const isManager = profile.role === 'owner' || profile.role === 'manager';
  if (isManager) {
    const navStaff = document.getElementById('nav-staff-link');
    const quickStaff = document.getElementById('quick-staff');
    if (navStaff) navStaff.hidden = false;
    if (quickStaff) quickStaff.hidden = false;
  }

  if (!state.businessId) {
    const box = document.querySelector('.main-content');
    if (box) {
      box.insertAdjacentHTML('afterbegin',
        '<div style="padding:14px 16px;background:#FFF8E1;border:1px solid #E3C97A;border-radius:14px;color:#7A5E00;font-size:13px;margin-bottom:16px;">' +
        '⚠️ У вашего аккаунта пока нет привязанного бизнеса. Попросите владельца пригласить вас в разделе «Сотрудники».</div>');
    }
    return;
  }

  await reloadAll();

  renderDashboard();

  // Реалтайм-подписки
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

  setupSidebar();
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => window.FB.logout());

  window.addEventListener('kut:lang', () => renderDashboard());

  console.info('[KUT] Дашборд загружен · бизнес:', state.businessId, '· роль:', profile.role);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
