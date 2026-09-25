/* =========================================================
   КУТ: БИЗНЕС — Ядро системы (app.js)
   Единая точка правды для обмена данными между кассой,
   складом и долгами через localStorage.
   Публичный API доступен всем модулям через window.KUT.
   ========================================================= */

(function () {
  'use strict';

  // ---------- 1. Реестр ключей localStorage ----------
  const KEYS = {
    products:  'kut_products',   // Склад (пишет stock.js и касса через ядро)
    sales:     'kut:sales',      // История продаж (пишет касса)
    debts:     'kut_debts',      // Несие (пишет debts.js и касса через ядро)
    customers: 'kut:customers',  // Справочник клиентов из кассы
  };

  // ---------- 2. Чтение/запись с широковещательным событием ----------
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[KUT] read failed:', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      // Broadcast внутри ТЕКУЩЕЙ вкладки (штатный `storage` работает только между вкладками)
      window.dispatchEvent(new CustomEvent('kut:storage', {
        detail: { key, value },
      }));
      return true;
    } catch (e) {
      console.warn('[KUT] write failed:', key, e);
      return false;
    }
  }

  // ---------- 3. Общие утилиты ----------
  function fmt(n) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
      .format(Number(n) || 0);
  }

  function fmtMoney(n) {
    return fmt(n) + ' KGS';
  }

  function uid(prefix) {
    return (prefix || 'id_') + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  /** Нормализация телефона КР: 0700... → +996700... */
  function normalizePhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('996')) d = d.slice(3);
    else if (d.startsWith('0')) d = d.slice(1);
    d = d.slice(0, 9);
    return '+996' + d;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  // ---------- 4. Общий тост (работает на любой странице) ----------
  let toastStylesInjected = false;

  function injectToastStyles() {
    if (toastStylesInjected) return;
    toastStylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .kut-toast {
        position: fixed;
        left: 50%;
        bottom: calc(20px + env(safe-area-inset-bottom));
        transform: translate(-50%, 120%);
        background: #005F40;
        color: #fff;
        padding: 12px 18px;
        border-radius: 12px;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 18px 48px rgba(16,32,25,.20);
        z-index: 300;
        transition: transform .3s cubic-bezier(.2,.8,.2,1);
        max-width: 90vw;
        text-align: center;
        pointer-events: none;
      }
      .kut-toast.is-visible { transform: translate(-50%, 0); }
      .kut-toast--error { background: #C0392B; }
    `;
    document.head.appendChild(style);
  }

  function toast(message, isError) {
    injectToastStyles();
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

  // ---------- 5. Геттеры домена ----------
  function getProducts() { return read(KEYS.products, []); }
  function getSales()    { return read(KEYS.sales, []); }
  function getDebts()    { return read(KEYS.debts, []); }

  // =========================================================
  // 6. СКВОЗНАЯ ЛОГИКА ПРОДАЖИ
  // =========================================================

  /**
   * Проверяет, хватает ли на складе товара под весь чек.
   * Возвращает:
   *   { ok: true } — можно продавать
   *   { ok: false, reason: 'missing'|'insufficient', item: { name, available, unit } }
   * Если склад пуст (демо-режим) — считаем, что остатки «бесконечны».
   */
  function checkStockForCart(cartItems) {
    const products = getProducts();

    // Демо-режим: склада ещё нет — не блокируем продажу
    if (!Array.isArray(products) || products.length === 0) {
      return { ok: true };
    }

    for (const item of cartItems) {
      const p = products.find((x) => x.id === item.id);
      if (!p) {
        return {
          ok: false,
          reason: 'missing',
          item: { name: item.name, available: 0, unit: 'шт' },
        };
      }
      const available = Number(p.qty) || 0;
      if (available < item.qty) {
        return {
          ok: false,
          reason: 'insufficient',
          item: {
            name: p.name,
            available,
            unit: p.unit || 'шт',
          },
        };
      }
    }
    return { ok: true };
  }

  /**
   * Списывает проданные количества со склада.
   * Ищет товар сначала по id, затем — по имени (страховка от рассинхрона).
   * Возвращает true, если были изменения.
   */
  function decrementStock(cartItems) {
    const products = getProducts();
    if (!Array.isArray(products) || products.length === 0) return false;

    let changed = false;

    for (const item of cartItems) {
      let idx = products.findIndex((p) => p.id === item.id);
      if (idx === -1) {
        idx = products.findIndex(
          (p) => String(p.name).toLowerCase() === String(item.name).toLowerCase()
        );
      }
      if (idx === -1) continue;

      const p = products[idx];
      const newQty = Math.max(0, (Number(p.qty) || 0) - Number(item.qty));
      products[idx] = {
        ...p,
        qty: Number(newQty.toFixed(2)),
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    }

    if (changed) write(KEYS.products, products);
    return changed;
  }

  /**
   * Создаёт запись о долге на основе продажи в «Несие».
   */
  function createDebtFromSale({ name, amount, phone, saleId, note }) {
    const debts = getDebts();
    const now = new Date();

    const record = {
      id: uid('d_'),
      name: String(name || '').trim(),
      phone: phone ? normalizePhone(phone) : '',
      initialAmount: Number(amount) || 0,
      amount: Number(amount) || 0,
      date: todayISO(),
      dueDate: '',
      note: note || 'Автоматически из продажи в кассе',
      status: 'active',
      payments: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      saleId: saleId || null,
      source: 'cash',
    };

    debts.push(record);
    write(KEYS.debts, debts);
    return record;
  }

  /**
   * Полный цикл оформления продажи.
   * Возвращает { ok: true, sale } либо { ok: false, error, item, reason }.
   */
  function registerSale({ cart, total, paymentMethod, customer, customerPhone }) {
    // 1. Проверяем остатки
    const stock = checkStockForCart(cart);
    if (!stock.ok) {
      return { ok: false, error: 'stock', item: stock.item, reason: stock.reason };
    }

    // 2. Сохраняем продажу в историю
    const now = new Date();
    const sale = {
      id: uid('sale_'),
      createdAt: now.toISOString(),
      items: cart.map((i) => ({ ...i })),
      total: Number(total) || 0,
      paymentMethod,
      customer: paymentMethod === 'debt' ? String(customer || '').trim() : null,
    };

    const sales = getSales();
    sales.push(sale);
    write(KEYS.sales, sales);

    // 3. Списываем со склада
    decrementStock(cart);

    // 4. Если «Несие» — создаём запись о долге
    if (paymentMethod === 'debt') {
      createDebtFromSale({
        name: customer,
        amount: total,
        phone: customerPhone || '',
        saleId: sale.id,
      });
    }

    return { ok: true, sale };
  }

  // =========================================================
  // 7. АГРЕГАТЫ ДЛЯ ДАШБОРДА
  // =========================================================

  function aggregateRevenue() {
    const sales = getSales();
    // Продажи «в долг» не считаем живыми деньгами — они попадут в кассу
    // только когда клиент вернёт долг через debts.js.
    const cash = sales
      .filter((s) => s.paymentMethod === 'cash' || s.paymentMethod === 'wallet')
      .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const debt = sales
      .filter((s) => s.paymentMethod === 'debt')
      .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    return { cash, debt, total: cash + debt, count: sales.length };
  }

  function aggregateStock() {
    const products = getProducts();
    const costValue = products.reduce(
      (sum, p) => sum + (Number(p.qty) || 0) * (Number(p.costPrice) || 0),
      0
    );
    const saleValue = products.reduce(
      (sum, p) => sum + (Number(p.qty) || 0) * (Number(p.salePrice) || 0),
      0
    );
    const lowStock = products.filter((p) => Number(p.qty) < 5).length;
    return { count: products.length, costValue, saleValue, lowStock };
  }

  function aggregateDebts() {
    const debts = getDebts();
    const active = debts.filter(
      (d) => d.status !== 'paid' && Number(d.amount) > 0
    );
    const sum = active.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return { count: active.length, sum };
  }

  // =========================================================
  // 8. РЕНДЕР ДАШБОРДА
  // =========================================================

  /**
   * Подставляет значение в первый найденный элемент.
   * Ищет по data-kut="...", затем по списку id-фоллбэков.
   */
  function setText(attr, value, fallbackIds) {
    let el = document.querySelector(`[data-kut="${attr}"]`);
    if (!el && fallbackIds) {
      for (const id of fallbackIds) {
        el = document.getElementById(id);
        if (el) break;
      }
    }
    if (el) {
      el.textContent = value;
      return true;
    }
    return false;
  }

  function renderDashboard() {
    const revenue = aggregateRevenue();
    const stock = aggregateStock();
    const debts = aggregateDebts();

    // Живые деньги (наличные + кошелёк)
    setText('revenue', fmtMoney(revenue.cash), ['dashRevenue', 'totalRevenue', 'revenueValue']);
    setText('revenue-cash', fmtMoney(revenue.cash), ['dashRevenueCash']);
    setText('revenue-debt', fmtMoney(revenue.debt), ['dashRevenueDebt']);
    setText('revenue-total', fmtMoney(revenue.total), ['dashRevenueTotal']);

    // Стоимость склада
    setText('stock-value', fmtMoney(stock.costValue), ['dashStockValue', 'stockValue']);
    setText('stock-count', String(stock.count), ['dashStockCount']);
    setText('stock-low', String(stock.lowStock), ['dashStockLow']);

    // Долги
    setText('debts-sum', fmtMoney(debts.sum), ['dashDebts', 'debtsSum']);
    setText('debts-count', String(debts.count), ['dashDebtsCount']);
  }

  // =========================================================
  // 9. РЕАКТИВНОСТЬ
  // =========================================================

  /**
   * Подписка на изменения localStorage.
   * Обрабатывает и своё событие kut:storage (та же вкладка),
   * и штатное storage (другая вкладка).
   */
  function onStorage(handler) {
    window.addEventListener('kut:storage', (e) => {
      handler({ key: e.detail.key, value: e.detail.value, source: 'same-tab' });
    });
    window.addEventListener('storage', (e) => {
      if (!e.key) return;
      let value = null;
      try { value = e.newValue ? JSON.parse(e.newValue) : null; } catch (_) {}
      handler({ key: e.key, value, source: 'cross-tab' });
    });
  }

  // =========================================================
  // 10. ПУБЛИЧНЫЙ API
  // =========================================================

  window.KUT = {
    keys: KEYS,
    read, write,
    fmt, fmtMoney, uid, todayISO, normalizePhone, escapeHtml,
    toast,
    getProducts, getSales, getDebts,
    checkStockForCart, decrementStock, createDebtFromSale,
    registerSale,
    aggregateRevenue, aggregateStock, aggregateDebts,
    renderDashboard,
    onStorage,
  };

  // ---------- Автозапуск дашборда, если на странице есть его маркеры ----------
  function bootDashboard() {
    const hasMarkers = document.querySelector(
      '[data-kut], #dashRevenue, #dashStockValue, #dashDebts, #totalRevenue'
    );
    if (hasMarkers) {
      renderDashboard();
      onStorage(() => renderDashboard());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootDashboard);
  } else {
    bootDashboard();
  }

  console.info(
    '%cКУТ: БИЗНЕС — ядро загружено',
    'color:#005F40; font-weight:700'
  );
})();
