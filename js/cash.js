/* =========================================================
   КУТ: БИЗНЕС — Модуль «Касса» (cash.js)
   Интегрирован с ядром window.KUT (js/app.js):
   - каталог читается из localStorage['kut_products'] (склад);
   - продажа списывает остатки и создаёт долг при «Несие»;
   - слушает изменения склада через KUT.onStorage.
   ========================================================= */

// ---------- Ключи хранилища ----------
const STORAGE = {
  SALES: 'kut:sales',
  CUSTOMERS: 'kut:customers',
};

// ---------- Демо-каталог (fallback, если склад ещё пуст) ----------
const FALLBACK_PRODUCTS = [
  { id: 'p01', name: 'Лепёшка',                price: 25,  category: 'Выпечка',   emoji: '🥖' },
  { id: 'p02', name: 'Боорсок (порция)',       price: 60,  category: 'Выпечка',   emoji: '🥯' },
  { id: 'p03', name: 'Самса',                  price: 60,  category: 'Выпечка',   emoji: '🥟' },
  { id: 'p04', name: 'Хлеб булка',             price: 30,  category: 'Выпечка',   emoji: '🍞' },
  { id: 'p05', name: 'Чай чёрный (пачка)',     price: 180, category: 'Напитки',   emoji: '🍵' },
  { id: 'p06', name: 'Вода 1,5 л',             price: 45,  category: 'Напитки',   emoji: '💧' },
  { id: 'p07', name: 'Кола 1 л',               price: 90,  category: 'Напитки',   emoji: '🥤' },
  { id: 'p08', name: 'Сок 1 л',                price: 110, category: 'Напитки',   emoji: '🧃' },
  { id: 'p09', name: 'Молоко 1 л',             price: 75,  category: 'Продукты',  emoji: '🥛' },
  { id: 'p10', name: 'Яйца (10 шт)',           price: 130, category: 'Продукты',  emoji: '🥚' },
  { id: 'p11', name: 'Рис 1 кг',               price: 120, category: 'Продукты',  emoji: '🍚' },
  { id: 'p12', name: 'Сахар 1 кг',             price: 95,  category: 'Продукты',  emoji: '🍬' },
  { id: 'p13', name: 'Масло растительное 1 л', price: 170, category: 'Продукты',  emoji: '🫙' },
  { id: 'p14', name: 'Макароны',               price: 70,  category: 'Продукты',  emoji: '🍝' },
  { id: 'p15', name: 'Мыло',                   price: 40,  category: 'Хозтовары', emoji: '🧼' },
  { id: 'p16', name: 'Стир. порошок',          price: 180, category: 'Хозтовары', emoji: '🧺' },
  { id: 'p17', name: 'Салфетки',               price: 30,  category: 'Хозтовары', emoji: '🧻' },
  { id: 'p18', name: 'Пакет',                  price: 5,   category: 'Хозтовары', emoji: '🛍️' },
];

// ---------- Категории ----------
const CATEGORIES = ['Все', 'Выпечка', 'Напитки', 'Продукты', 'Хозтовары'];

// =========================================================
// Интеграция со складом (window.KUT → localStorage['kut_products'])
// =========================================================

/** Эмодзи по категории — для карточек каталога */
function emojiForCategory(cat) {
  switch (cat) {
    case 'Одежда':    return '👕';
    case 'Продукты':  return '🥫';
    case 'Напитки':   return '🥤';
    case 'Выпечка':   return '🥖';
    case 'Услуги':    return '✂️';
    case 'Хозтовары': return '🧴';
    default:          return '📦';
  }
}

/** Приводит запись склада к формату, который ждёт касса */
function stockToCashProduct(p) {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.salePrice) || 0,
    costPrice: Number(p.costPrice) || 0,
    category: p.category || 'Другое',
    unit: p.unit || 'шт',
    qty: Number(p.qty) || 0,
    emoji: emojiForCategory(p.category),
  };
}

/** Читает товары из localStorage['kut_products'], иначе — демо-набор */
function loadProductsFromStock() {
  const stored = window.KUT?.getProducts ? window.KUT.getProducts() : null;
  if (Array.isArray(stored) && stored.length) {
    return stored.map(stockToCashProduct);
  }
  // Демо-режим: остатки «бесконечны» (Infinity = не блокируем продажу)
  return FALLBACK_PRODUCTS.map((p) => ({
    ...p,
    qty: Infinity,
    unit: 'шт',
    costPrice: 0,
  }));
}

// Актуальный каталог кассы
let PRODUCTS = loadProductsFromStock();

/** Перечитать каталог (после списания или изменений на складе) */
function refreshProductsFromStock() {
  PRODUCTS = loadProductsFromStock();
  renderProducts();
}

// ---------- Состояние экрана ----------
const state = {
  cart: [],            // [{ id, name, price, unit, qty }]
  category: 'Все',
  search: '',
  paymentMethod: null, // 'cash' | 'wallet' | 'debt'
  customer: '',
};

// ---------- Ссылки на DOM ----------
const $ = (sel) => document.querySelector(sel);
const el = {
  categories:    $('#categories'),
  productsGrid:  $('#productsGrid'),
  searchInput:   $('#searchInput'),

  cart:          $('#cart'),
  cartItems:     $('#cartItems'),
  cartEmpty:     $('#cartEmpty'),
  cartCount:     $('#cartCount'),
  cartTotal:     $('#cartTotal'),
  clearCartBtn:  $('#clearCartBtn'),
  checkoutBtn:   $('#checkoutBtn'),

  cartToggle:      $('#cartToggle'),
  cartToggleCount: $('#cartToggleCount'),
  cartToggleSum:   $('#cartToggleSum'),

  paymentModal:   $('#paymentModal'),
  paymentTotal:   $('#paymentTotal'),
  payMethods:     $('#payMethods'),
  debtBlock:      $('#debtBlock'),
  debtCustomer:   $('#debtCustomer'),
  debtList:       $('#debtCustomersList'),
  confirmPayBtn:  $('#confirmPayBtn'),

  successModal:   $('#successModal'),
  successTotal:   $('#successTotal'),
};

// =========================================================
// Утилиты
// =========================================================

/** Форматирование денег: 1250 → "1 250" */
const fmt = (n) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/** Безопасное чтение JSON из localStorage */
function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Безопасная запись JSON в localStorage */
function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Не удалось сохранить в localStorage:', e);
  }
}

/** Простая защита от XSS */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/** Универсальный тост: использует KUT.toast, если ядро загружено */
function notify(message, isError = false) {
  if (window.KUT?.toast) window.KUT.toast(message, isError);
  else console.log('[toast]', message);
}

// =========================================================
// Каталог
// =========================================================

function renderCategories() {
  el.categories.innerHTML = CATEGORIES
    .map((cat) => {
      const active = cat === state.category ? ' is-active' : '';
      return `<button class="cat-chip${active}" type="button" role="tab" aria-selected="${cat === state.category}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    })
    .join('');
}

function getVisibleProducts() {
  const q = state.search.trim().toLowerCase();
  return PRODUCTS.filter((p) => {
    const matchCat = state.category === 'Все' || p.category === state.category;
    const matchSearch = !q || p.name.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });
}

function renderProducts() {
  const items = getVisibleProducts();

  if (items.length === 0) {
    el.productsGrid.innerHTML =
      `<div class="products__empty">Ничего не найдено. Попробуйте изменить запрос или категорию.</div>`;
    return;
  }

  el.productsGrid.innerHTML = items
    .map((p) => {
      const qty = Number(p.qty);
      const isFiniteQty = Number.isFinite(qty);
      const isOut = isFiniteQty && qty <= 0;
      const unit = p.unit || 'шт';

      // Строка «осталось N шт» показывается только для реального склада
      const stockLine = isFiniteQty
        ? `<span style="font-size:11px;font-weight:600;margin-top:2px;color:${
            isOut ? '#C0392B' : qty < 5 ? '#E08A1E' : '#64776E'
          };">${isOut ? 'нет в наличии' : 'осталось ' + fmt(qty) + ' ' + escapeHtml(unit)}</span>`
        : '';

      return `
        <button class="product" type="button" data-id="${escapeHtml(p.id)}"
          aria-label="${escapeHtml(p.name)}, ${p.price} KGS"
          ${isOut ? 'aria-disabled="true"' : ''}
          style="${isOut ? 'opacity:.55;' : ''}">
          <span class="product__emoji" aria-hidden="true">${p.emoji}</span>
          <span class="product__name">${escapeHtml(p.name)}</span>
          <span class="product__price">${fmt(p.price)}<small>KGS</small></span>
          ${stockLine}
        </button>`;
    })
    .join('');
}

// =========================================================
// Корзина
// =========================================================

function addToCart(productId) {
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) return;

  const existing = state.cart.find((i) => i.id === productId);
  const currentQty = existing ? existing.qty : 0;
  const stockQty = Number(product.qty);
  const unit = product.unit || 'шт';

  // Проверка остатка: не даём добавить больше, чем есть на складе.
  // Infinity — признак демо-режима (склад ещё пуст), тогда не блокируем.
  if (Number.isFinite(stockQty) && currentQty >= stockQty) {
    if (stockQty <= 0) {
      notify(`Товар «${product.name}» закончился на складе.`, true);
    } else {
      notify(`Недостаточно товара на складе! Осталось всего ${fmt(stockQty)} ${unit}.`, true);
    }
    return;
  }

  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      unit,
      qty: 1,
    });
  }
  renderCart();
  pulseCartBadge();
}

function changeQty(productId, delta) {
  const item = state.cart.find((i) => i.id === productId);
  if (!item) return;

  // Верхняя граница: не больше, чем есть на складе
  if (delta > 0) {
    const product = PRODUCTS.find((p) => p.id === productId);
    const stockQty = product ? Number(product.qty) : Infinity;
    if (Number.isFinite(stockQty) && item.qty >= stockQty) {
      const unit = (product && product.unit) || 'шт';
      notify(`Недостаточно товара на складе! Осталось всего ${fmt(stockQty)} ${unit}.`, true);
      return;
    }
  }

  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter((i) => i.id !== productId);
  }
  renderCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((i) => i.id !== productId);
  renderCart();
}

function clearCart() {
  if (state.cart.length === 0) return;
  state.cart = [];
  renderCart();
}

function getCartTotal() {
  return state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function getCartCount() {
  return state.cart.reduce((sum, i) => sum + i.qty, 0);
}

function renderCart() {
  const { cart } = state;
  const total = getCartTotal();
  const count = getCartCount();

  if (cart.length === 0) {
    el.cartItems.innerHTML = '';
    el.cartEmpty.hidden = false;
    el.cartItems.hidden = true;
  } else {
    el.cartEmpty.hidden = true;
    el.cartItems.hidden = false;
    el.cartItems.innerHTML = cart
      .map((i) => `
        <div class="cart-item" data-id="${escapeHtml(i.id)}">
          <div class="cart-item__info">
            <div class="cart-item__name">${escapeHtml(i.name)}</div>
            <div class="cart-item__meta">${fmt(i.price)} × ${i.qty} ${escapeHtml(i.unit || 'шт')}</div>
            <div class="cart-item__total">${fmt(i.price * i.qty)} KGS</div>
          </div>
          <div class="cart-item__controls" role="group" aria-label="Количество">
            <button class="qty-btn" type="button" data-act="dec" aria-label="Уменьшить">−</button>
            <span class="qty-value" aria-live="polite">${i.qty}</span>
            <button class="qty-btn" type="button" data-act="inc" aria-label="Увеличить">+</button>
          </div>
          <button class="qty-remove" type="button" data-act="remove" aria-label="Удалить позицию">×</button>
        </div>`)
      .join('');
  }

  el.cartCount.textContent = count;
  el.cartToggleCount.textContent = count;
  el.cartTotal.innerHTML = `${fmt(total)}<small>KGS</small>`;
  el.cartToggleSum.textContent = `${fmt(total)} KGS`;

  el.clearCartBtn.disabled = cart.length === 0;
  el.checkoutBtn.disabled = cart.length === 0;

  if (el.paymentModal.hidden === false) {
    el.paymentTotal.textContent = `${fmt(total)} KGS`;
  }
}

/** Лёгкая анимация счётчика при добавлении товара */
function pulseCartBadge() {
  if (!el.cartCount.animate) return;
  el.cartCount.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.25)' },
      { transform: 'scale(1)' },
    ],
    { duration: 220, easing: 'ease-out' }
  );
}

// =========================================================
// Модальные окна
// =========================================================

let lastFocused = null;

function openModal(modal) {
  lastFocused = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.hidden = true;
  document.body.style.overflow = '';
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
}

// =========================================================
// Оплата
// =========================================================

function openPaymentModal() {
  if (state.cart.length === 0) return;

  state.paymentMethod = null;
  state.customer = '';
  el.debtCustomer.value = '';
  el.debtBlock.hidden = true;
  el.confirmPayBtn.disabled = true;

  el.payMethods.querySelectorAll('.pay-method').forEach((btn) => {
    btn.classList.remove('is-active');
    btn.setAttribute('aria-checked', 'false');
  });

  el.paymentTotal.textContent = `${fmt(getCartTotal())} KGS`;

  renderCustomersDatalist();
  openModal(el.paymentModal);
}

function selectPaymentMethod(method) {
  state.paymentMethod = method;

  el.payMethods.querySelectorAll('.pay-method').forEach((btn) => {
    const isActive = btn.dataset.method === method;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });

  if (method === 'debt') {
    el.debtBlock.hidden = false;
    requestAnimationFrame(() => el.debtCustomer.focus());
    updateConfirmState();
  } else {
    el.debtBlock.hidden = true;
    el.debtCustomer.value = '';
    state.customer = '';
    el.confirmPayBtn.disabled = false;
  }
}

/** Кнопка «Подтвердить» активна, если для долга указано имя */
function updateConfirmState() {
  if (state.paymentMethod !== 'debt') {
    el.confirmPayBtn.disabled = false;
    return;
  }
  el.confirmPayBtn.disabled = state.customer.trim().length < 2;
}

// =========================================================
// Клиенты (для «В долг»)
// =========================================================

function getCustomers() {
  return readLS(STORAGE.CUSTOMERS, []);
}

function renderCustomersDatalist() {
  const list = getCustomers();
  el.debtList.innerHTML = list
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join('');
}

function rememberCustomer(name) {
  const clean = name.trim();
  if (!clean) return;
  const list = getCustomers();
  if (!list.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    list.push(clean);
    writeLS(STORAGE.CUSTOMERS, list);
  }
}

// =========================================================
// Проведение продажи (через ядро KUT)
// =========================================================

function confirmPayment() {
  if (state.cart.length === 0) return;
  if (!state.paymentMethod) return;
  if (state.paymentMethod === 'debt' && state.customer.trim().length < 2) return;

  // Страховка: если app.js не подключён — сообщаем понятную ошибку
  if (!window.KUT || typeof window.KUT.registerSale !== 'function') {
    console.error('[cash.js] Ядро KUT не загружено. Подключите js/app.js ДО js/cash.js');
    notify('Ошибка: ядро системы не загружено. Проверьте порядок скриптов.', true);
    return;
  }

  const total = getCartTotal();

  // Сквозная продажа: проверка остатков → запись продажи →
  // списание со склада → автосоздание долга (при «Несие»).
  const result = window.KUT.registerSale({
    cart: state.cart.map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      unit: i.unit || 'шт',
      qty: i.qty,
    })),
    total,
    paymentMethod: state.paymentMethod,
    customer: state.customer,
    customerPhone: '',
  });

  if (!result.ok) {
    if (result.error === 'stock') {
      const it = result.item;
      const msg = result.reason === 'missing'
        ? `Товар «${it.name}» больше не найден на складе. Каталог обновлён.`
        : `Недостаточно товара на складе! «${it.name}»: осталось всего ${fmt(it.available)} ${it.unit}.`;
      notify(msg, true);
      refreshProductsFromStock();
    }
    return;
  }

  // Запоминаем клиента, если долг оформлен
  if (state.paymentMethod === 'debt' && state.customer.trim()) {
    rememberCustomer(state.customer.trim());
  }

  // Показываем успех
  closeModal(el.paymentModal);
  el.successTotal.textContent = `${fmt(total)} KGS`;
  openModal(el.successModal);

  // Очистка чека
  state.cart = [];
  state.paymentMethod = null;
  state.customer = '';
  renderCart();

  // Закрываем мобильный чек, если открыт
  el.cart.classList.remove('is-open');

  // Перечитываем каталог: остатки уже могли измениться
  refreshProductsFromStock();
}

// =========================================================
// Обработчики событий
// =========================================================

function bindEvents() {
  // Поиск
  el.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderProducts();
  });

  // Категории (делегирование)
  el.categories.addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    state.category = chip.dataset.cat;
    renderCategories();
    renderProducts();
  });

  // Клик по товару (делегирование)
  el.productsGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.product');
    if (!card) return;
    if (card.getAttribute('aria-disabled') === 'true') return;
    addToCart(card.dataset.id);
  });

  // Управление позициями в чеке (делегирование)
  el.cartItems.addEventListener('click', (e) => {
    const row = e.target.closest('.cart-item');
    if (!row) return;
    const btn = e.target.closest('[data-act]');
    if (!btn) return;

    const id = row.dataset.id;
    const act = btn.dataset.act;

    if (act === 'inc') changeQty(id, +1);
    else if (act === 'dec') changeQty(id, -1);
    else if (act === 'remove') removeFromCart(id);
  });

  // Очистить чек
  el.clearCartBtn.addEventListener('click', () => {
    if (state.cart.length === 0) return;
    if (confirm('Очистить чек полностью?')) clearCart();
  });

  // Открыть модалку оплаты
  el.checkoutBtn.addEventListener('click', openPaymentModal);

  // Выбор способа оплаты
  el.payMethods.addEventListener('click', (e) => {
    const btn = e.target.closest('.pay-method');
    if (!btn) return;
    selectPaymentMethod(btn.dataset.method);
  });

  // Ввод имени должника
  el.debtCustomer.addEventListener('input', (e) => {
    state.customer = e.target.value;
    updateConfirmState();
  });

  // Подтвердить оплату
  el.confirmPayBtn.addEventListener('click', confirmPayment);

  // Закрытие модалок
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal);
    }
  });

  // Escape
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.paymentModal.hidden) closeModal(el.paymentModal);
    else if (!el.successModal.hidden) closeModal(el.successModal);
    else el.cart.classList.remove('is-open');
  });

  // Мобильный «Чек»
  el.cartToggle.addEventListener('click', () => {
    el.cart.classList.toggle('is-open');
    if (el.cart.classList.contains('is-open')) {
      const closeBtn = el.cart.querySelector('[data-close-cart]');
      if (!closeBtn) {
        const btn = document.createElement('button');
        btn.className = 'btn-ghost';
        btn.type = 'button';
        btn.dataset.closeCart = 'true';
        btn.textContent = 'Свернуть';
        btn.addEventListener('click', () => el.cart.classList.remove('is-open'));
        el.cart.querySelector('.cart__head').appendChild(btn);
      }
    }
  });

  // Реакция на изменения склада: если stock.js, app.js или другая вкладка
  // поменяли остатки — перечитываем каталог кассы.
  if (window.KUT?.onStorage) {
    window.KUT.onStorage(({ key }) => {
      if (key === window.KUT.keys.products) {
        refreshProductsFromStock();
        // Если в чеке были позиции, которые стали недоступны — не выкидываем
        // их молча, а просто перерисовываем корзину (проверка остатка
        // произойдёт при изменении количества или на подтверждении).
        renderCart();
      }
    });
  }
}

// =========================================================
// Инициализация
// =========================================================

function init() {
  // Проверка ядра — сразу говорим пользователю, если что-то не так
  if (!window.KUT) {
    console.error(
      '[cash.js] window.KUT не найден. Подключите <script src="./js/app.js"> ПЕРЕД js/cash.js в cash.html.'
    );
  }

  renderCategories();
  renderProducts();
  renderCart();
  bindEvents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
