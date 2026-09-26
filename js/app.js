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
    if (idx >= 0) buckets[idx].total
