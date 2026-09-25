/* =========================================================
   КУТ: БИЗНЕС — Ядро системы (app.js) · v3.0 (WhatsApp OTP)
   Что делает:
   • Проверяет авторизацию через Firebase Auth
   • Проверяет наличие phone в профиле — если нет, редирект на login.html
   • Редирект super_admin → admin.html
   • Загружает данные бизнеса из Firestore
   • Отдаёт window.KUT для cash.js / stock.js / debts.js
   ========================================================= */

import './firebase-config.js';

// =========================================================
// 1. УТИЛИТЫ
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
// 2. ТОСТ
// =========================================================

function toast(message, isError) {
  let el = document.getElementById('kut-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'kut-toast';
    el.className = 'kut-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle('kut-toast--error', !!isError);
  el.classList.add('is-visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('is-visible'), 2800);
}

// =========================================================
// 3. СОСТОЯНИЕ ДАШБОРДА
// =========================================================

const state = {
  businessId: null,
  profile: null,
  products: [],
  sales: [],
  debts: [],
};

// =========================================================
// 4. АГРЕГАТЫ
// =========================================================

function aggregateRevenue() {
  const sales = state.sales || [];
  const total = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const cash = sales.filter((s) => s.paymentMethod === 'cash')
                    .reduce((s, x) => s + (Number(x.total) || 0), 0);
  const wallet = sales.filter((s) => s.paymentMethod === 'wallet')
                      .reduce((s, x) => s + (Number(x.total) || 0), 0);
  const debt = sales.filter((s) => s.paymentMethod === 'debt')
                    .reduce((s, x) => s + (Number(x.total) || 0), 0);
  return { total, cash, wallet, debt, count: sales.length };
}

function aggregateStock() {
  const products = state.products || [];
  const costValue = products.reduce(
    (sum, p) => sum + (Number(p.qty) || 0) * (Number(p.costPrice) || 0), 0
  );
  const lowStock = products.filter((p) => Number(p.qty) < 5).length;
  return { count: products.length, costValue, lowStock };
}

function aggregateDebts() {
  const debts = state.debts || [];
  const active = debts.filter((d) => d.status !== 'paid' && Number(d.amount) > 0);
  const sum = active.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  return { count: active.length, sum };
}

// =========================================================
// 5. РЕНДЕР ДАШБОРДА
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

function renderDashboard() {
  const revenue = aggregateRevenue();
  const stock = aggregateStock();
  const debts = aggregateDebts();

  setNum('revenue-total', Math.round(revenue.total), ['dashboard-total-sales']);
  setNum('stock-value', Math.round(stock.costValue), ['dashboard-stock-value']);
  setNum('debts-sum', Math.round(debts.sum), ['dashboard-total-debts']);

  setText('revenue-sub',
    revenue.count > 0
      ? `Продаж: ${revenue.count} · нал. ${fmt(revenue.cash)} · кошелёк ${fmt(revenue.wallet)} · несие ${fmt(revenue.debt)}`
      : 'Продаж пока не было',
    ['sales-sub']);

  setText('stock-sub',
    stock.count > 0
      ? `Позиций: ${stock.count} · заканчивается: ${stock.lowStock}`
      : 'Склад пуст',
    ['stock-sub']);

  setText('debts-sub',
    debts.count > 0
      ? `Активных должников: ${debts.count}`
      : 'Активных должников нет',
    ['debts-sub']);

  const badge = document.getElementById('nav-debts-count');
  if (badge) {
    if (debts.count > 0) {
      badge.textContent = String(debts.count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  const upd = document.getElementById('updated-at');
  if (upd) upd.textContent = nowTimeHHMM();

  renderRecentSales();
}

function renderRecentSales() {
  const container = document.getElementById('recent-sales');
  if (!container) return;

  const sales = (state.sales || [])
    .slice()
    .sort((a, b) => {
      const ta = toDate(a.createdAt)?.getTime() || 0;
      const tb = toDate(b.createdAt)?.getTime() || 0;
      return tb - ta;
    })
    .slice(0, 5);

  if (sales.length === 0) {
    container.innerHTML = `
      <div class="recent__empty">
        <span aria-hidden="true">🧾</span>
        Продаж ещё не было. Начните с кассы.
      </div>`;
    return;
  }

  container.innerHTML = sales.map((s) => {
    const itemsCount = Array.isArray(s.items)
      ? s.items.reduce((n, i) => n + (Number(i.qty) || 0), 0)
      : 0;
    const emoji = methodEmoji(s.paymentMethod);
    const title = methodTitle(s.paymentMethod, s.customer);
    const amountCls = s.paymentMethod === 'debt' ? ' sale-row__amount--debt' : '';

    return `
      <div class="sale-row">
        <div class="sale-row__avatar" aria-hidden="true">${emoji}</div>
        <div class="sale-row__info">
          <div class="sale-row__title">${escapeHtml(title)}</div>
          <div class="sale-row__meta">${formatSaleDate(s.createdAt)} · ${itemsCount} поз.</div>
        </div>
        <div class="sale-row__amount${amountCls}">${fmtMoney(s.total)}</div>
      </div>
    `;
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
  const d = toDate(ts);
  if (!d) return '—';

  const now = new Date();
  const z = (n) => String(n).padStart(2, '0');

  if (d.toDateString() === now.toDateString()) {
    return `сегодня, ${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) {
    return `вчера, ${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// =========================================================
// 6. САЙДБАР
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
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1000) close();
  });
}

// =========================================================
// 7. PUBLIC API
// =========================================================

const KEYS = {
  products:  'kut_products',
  sales:     'kut:sales',
  debts:     'kut_debts',
  customers: 'kut:customers',
};

function getProducts() { return state.products || []; }
function getSales()    { return state.sales || []; }
function getDebts()    { return state.debts || []; }

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

async function registerSale({ cart, total, paymentMethod, customer, customerPhone }) {
  if (!state.businessId) {
    return { ok: false, error: 'no_business' };
  }

  for (const item of cart) {
    const p = state.products.find((x) => x.id === item.id);
    if (!p) return { ok: false, error: 'stock', reason: 'missing',
      item: { name: item.name, available: 0, unit: 'шт' } };
    const available = Number(p.qty) || 0;
    if (available < item.qty) {
      return { ok: false, error: 'stock', reason: 'insufficient',
        item: { name: p.name, available, unit: p.unit || 'шт' } };
    }
  }

  const bizId = state.businessId;
  const { db, collection, doc, writeBatch, serverTimestamp } = window.FB;

  try {
    const batch = writeBatch(db);

    const saleRef = doc(collection(db, 'businesses', bizId, 'sales'));
    batch.set(saleRef, {
      items: cart.map((i) => ({ ...i })),
      total: Number(total) || 0,
      paymentMethod,
      customer: paymentMethod === 'debt' ? String(customer || '').trim() : null,
      createdAt: serverTimestamp(),
    });

    for (const item of cart) {
      const p = state.products.find((x) => x.id === item.id);
      if (!p) continue;
      const newQty = Math.max(0, (Number(p.qty) || 0) - Number(item.qty));
      const pRef = doc(db, 'businesses', bizId, 'products', item.id);
      batch.update(pRef, {
        qty: Number(newQty.toFixed(2)),
        updatedAt: serverTimestamp(),
      });
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
  fmt, fmtMoney, uid, todayISO, normalizePhone, escapeHtml,
  toast,
  getProducts, getSales, getDebts,
  registerSale,
  reloadAll,
  aggregateRevenue, aggregateStock, aggregateDebts,
  renderDashboard,
  getState: () => state,
  read: () => null,
  write: () => false,
  onStorage: () => {},
};

// =========================================================
// 8. АВТОЗАПУСК
// =========================================================

async function boot() {
  const { user, profile } = await window.FB.waitForAuth();

  // 1. Не авторизован → на вход
  if (!user || !profile) {
    window.location.href = './login.html';
    return;
  }

  // 2. Заблокирован
  if (profile.active === false) {
    alert('Ваш аккаунт заблокирован. Свяжитесь с администратором.');
    await window.FB.logout();
    return;
  }

  // 3. Проверяем наличие phone — если нет, отправляем на login
  if (!profile.phone || !/^\+996\d{9}$/.test(profile.phone)) {
    console.warn('[KUT] Профиль без валидного phone — редирект на login.html');
    await window.FB.logout().catch(() => {});
    window.location.href = './login.html';
    return;
  }

  // 4. Super admin → отдельная панель
  if (profile.role === 'super_admin') {
    window.location.href = './admin.html';
    return;
  }

  // 5. Бизнес-пользователь
  state.profile = profile;
  state.businessId = profile.businessId;
  if (!state.businessId) {
    alert('Не найден businessId. Обратитесь к администратору.');
    await window.FB.logout();
    return;
  }

  await reloadAll();

  const hasDashboard =
    document.getElementById('dashboard-total-sales') ||
    document.getElementById('dashboard-stock-value') ||
    document.getElementById('dashboard-total-debts') ||
    document.querySelector('[data-kut]');

  if (hasDashboard) {
    renderDashboard();

    window.FB.subscribeCollection('products', (items) => {
      state.products = items;
      if (hasDashboard) renderDashboard();
    });
    window.FB.subscribeCollection('sales', (items) => {
      state.sales = items;
      if (hasDashboard) renderDashboard();
    });
    window.FB.subscribeCollection('debts', (items) => {
      state.debts = items;
      if (hasDashboard) renderDashboard();
    });
  }

  setupSidebar();
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  document.querySelectorAll('[data-kut-logout]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.FB.logout();
    });
  });

  window.addEventListener('kut:lang', () => {
    if (hasDashboard) renderDashboard();
  });

  console.info(
    '%cКУТ: БИЗНЕС — сессия активна · телефон: ' + profile.phone + ' · бизнес: ' + state.businessId,
    'color:#005F40; font-weight:700'
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
