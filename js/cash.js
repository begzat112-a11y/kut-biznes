/* =========================================================
   КУТ: БИЗНЕС — Модуль «Касса» (cash.js)
   Обновлено:
   • Каталог — из localStorage['kut_products'], демо-массив убран
   • Плашка «На складе нет товаров», если список пуст
   • Кнопка «📷 Сканировать штрихкод» + модалка с камерой
   • Cooldown 2 сек на каждый штрихкод — защита от дублей
   • Web Audio API — «пик» без аудиофайлов
   • Ручной ввод штрихкода + кнопка «Поиск»
   ========================================================= */

const STORAGE = {
  SALES: (window.KUT?.keys?.sales) || 'kut:sales',
  CUSTOMERS: (window.KUT?.keys?.customers) || 'kut:customers',
};

const CATEGORIES = ['Все', 'Выпечка', 'Напитки', 'Продукты', 'Хозтовары', 'Одежда', 'Услуги', 'Другое'];

// =========================================================
// КОНСТАНТЫ COOLDOWN
// =========================================================
const SCAN_COOLDOWN_MS = 2000;   // 2 секунды между одинаковыми штрихкодами
let lastScannedBarcode = null;
let lastScannedAt = 0;

// =========================================================
// ИНТЕГРАЦИЯ СО СКЛАДОМ
// =========================================================

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

function stockToCashProduct(p) {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.salePrice) || 0,
    costPrice: Number(p.costPrice) || 0,
    category: p.category || 'Другое',
    unit: p.unit || 'шт',
    qty: Number(p.qty) || 0,
    barcode: p.barcode || '',
    emoji: emojiForCategory(p.category),
  };
}

function loadProductsFromStock() {
  const stored = window.KUT?.getProducts ? window.KUT.getProducts() : null;
  return Array.isArray(stored) && stored.length ? stored.map(stockToCashProduct) : [];
}

let PRODUCTS = loadProductsFromStock();

function refreshProductsFromStock() {
  PRODUCTS = loadProductsFromStock();
  renderProducts();
}

// =========================================================
// СОСТОЯНИЕ
// =========================================================

const state = {
  cart: [],
  category: 'Все',
  search: '',
  paymentMethod: null,
  customer: '',
};

// =========================================================
// DOM ССЫЛКИ
// =========================================================

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
// УТИЛИТЫ
// =========================================================

const fmt = (n) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn('localStorage write failed:', e); }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function notify(message, isError = false) {
  if (window.KUT?.toast) window.KUT.toast(message, isError);
  else console.log('[toast]', message);
}

// =========================================================
// ЗВУК — Web Audio API (без файлов)
// =========================================================

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** Успешное сканирование: короткий «пик» 2000 Гц */
function playSuccessBeep() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(2000, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

/** Ошибка: двойной низкий тон */
function playErrorBeep() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  [0, 0.13].forEach((delay) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now + delay);
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.16, now + delay + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.12);
  });
}

// =========================================================
// ЗАГРУЗКА HTML5-QRCODE
// =========================================================

let html5QrcodePromise = null;

function loadHtml5Qrcode() {
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
  if (html5QrcodePromise) return html5QrcodePromise;

  html5QrcodePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.async = true;
    script.onload = () => {
      if (window.Html5Qrcode) resolve(window.Html5Qrcode);
      else reject(new Error('html5-qrcode не инициализирован'));
    };
    script.onerror = () => reject(new Error('Не удалось загрузить html5-qrcode'));
    document.head.appendChild(script);
  });

  return html5QrcodePromise;
}

// =========================================================
// МОДАЛЬНОЕ ОКНО СКАНЕРА (в кассе — остаётся открытым для серии сканов)
// =========================================================

let scannerModal = null;
let scannerInstance = null;
let scanFeedbackTimer = null;

function ensureScannerModal() {
  if (scannerModal) return scannerModal;

  scannerModal = document.createElement('div');
  scannerModal.className = 'modal';
  scannerModal.id = 'cashScannerModal';
  scannerModal.hidden = true;
  scannerModal.innerHTML = `
    <div class="modal__backdrop" data-close-scanner></div>
    <div class="modal__dialog" role="dialog" aria-modal="true" style="max-width: 520px;">
      <h3 style="margin:0 0 4px;">📷 Сканер штрихкода</h3>
      <p style="margin:0 0 14px; color:#64776E; font-size:13px;">
        Наводите камеру на штрихкоды — товары добавляются в чек. Повторное срабатывание на тот же код — не раньше 2 секунд.
      </p>
      <div style="position:relative;">
        <div id="cashScannerReader" style="width:100%; border-radius:14px; overflow:hidden; background:#000; min-height:220px;"></div>
        <div id="cashScannerFeedback"
             style="position:absolute; left:12px; right:12px; bottom:12px;
                    padding:10px 14px; border-radius:12px;
                    font-family:inherit; font-size:14px; font-weight:600;
                    text-align:center; color:#fff;
                    background:rgba(0,95,64,.92);
                    box-shadow:0 6px 18px rgba(0,0,0,.25);
                    opacity:0; transform:translateY(8px);
                    transition:opacity .2s ease, transform .2s ease;
                    pointer-events:none;">
        </div>
      </div>
      <div style="display:flex; gap:10px; margin-top:16px;">
        <button class="btn btn--primary btn--block" type="button" data-close-scanner>
          Готово
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(scannerModal);

  scannerModal.addEventListener('click', (e) => {
    if (e.target.matches('[data-close-scanner]')) stopScanner();
  });

  return scannerModal;
}

function showScanFeedback(text, kind) {
  const box = scannerModal?.querySelector('#cashScannerFeedback');
  if (!box) return;
  box.textContent = text;
  if (kind === 'error') {
    box.style.background = 'rgba(192,57,43,.92)';
  } else {
    box.style.background = 'rgba(0,95,64,.92)';
  }
  box.style.opacity = '1';
  box.style.transform = 'translateY(0)';
  clearTimeout(scanFeedbackTimer);
  scanFeedbackTimer = setTimeout(() => {
    box.style.opacity = '0';
    box.style.transform = 'translateY(8px)';
  }, 1400);
}

async function openScanner() {
  try {
    const Html5Qrcode = await loadHtml5Qrcode();
    const modal = ensureScannerModal();
    const readerEl = modal.querySelector('#cashScannerReader');
    readerEl.innerHTML = '';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    scannerInstance = new Html5Qrcode('cashScannerReader');

    const config = {
      fps: 10,
      qrbox: { width: 280, height: 180 },
      aspectRatio: 1.0,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.QR_CODE,
      ],
    };

    await scannerInstance.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        // Дёргаем общий обработчик — он сам решит, что делать с дублями
        handleDecodedBarcode(String(decodedText).trim(), true);
      },
      () => { /* ignore scan errors */ }
    );
  } catch (err) {
    console.error('[scanner]', err);
    notify('Не удалось запустить камеру. Проверьте разрешения.', true);
    stopScanner();
  }
}

function stopScanner() {
  try {
    if (scannerInstance) {
      const inst = scannerInstance;
      scannerInstance = null;
      inst.stop().then(() => inst.clear()).catch(() => {});
    }
  } catch (_) {}
  if (scannerModal) scannerModal.hidden = true;
  document.body.style.overflow = '';
}

// =========================================================
// ЯДРО ЛОГИКИ СКАНИРОВАНИЯ — С ЗАЩИТОЙ ОТ ДУБЛЕЙ
// =========================================================

/**
 * @param {string} code — распознанный штрихкод
 * @param {boolean} fromCamera — true, если вызвано камерой (для вибрации и feedback)
 */
function handleDecodedBarcode(code, fromCamera) {
  if (!code) return;

  const now = Date.now();

  // ---------- ЗАЩИТА ОТ ДУБЛЕЙ ----------
  // Если этот же штрихкод сканировался менее SCAN_COOLDOWN_MS назад — игнорируем.
  // Ни добавления, ни звука, ни вибрации — просто тихий выход.
  if (code === lastScannedBarcode && (now - lastScannedAt) < SCAN_COOLDOWN_MS) {
    return;
  }

  // Запоминаем факт сканирования ДО проверки остатка —
  // иначе при попытке сканировать отсутствующий товар опять получим лавину.
  lastScannedBarcode = code;
  lastScannedAt = now;

  // ---------- Ищем товар на складе ----------
  const product = PRODUCTS.find((p) => String(p.barcode) === String(code));

  if (!product) {
    if (fromCamera) {
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      playErrorBeep();
      showScanFeedback(`Товар «${code}» не найден на складе`, 'error');
    } else {
      notify(`Товар со штрихкодом ${code} не найден`, true);
    }
    return;
  }

  // ---------- Проверка остатка ----------
  const existing = state.cart.find((i) => i.id === product.id);
  const currentQty = existing ? existing.qty : 0;
  const stockQty = Number(product.qty);

  if (Number.isFinite(stockQty) && currentQty >= stockQty) {
    if (fromCamera) {
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      playErrorBeep();
      showScanFeedback(
        stockQty <= 0
          ? `«${product.name}» закончился на складе`
          : `«${product.name}»: осталось всего ${fmt(stockQty)} ${product.unit}`,
        'error'
      );
    } else {
      notify(`Недостаточно товара «${product.name}». Осталось ${fmt(stockQty)} ${product.unit}`, true);
    }
    return;
  }

  // ---------- Добавляем в чек ----------
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit || 'шт',
      qty: 1,
    });
  }

  // ---------- Обратная связь ----------
  if (fromCamera) {
    if (navigator.vibrate) navigator.vibrate(80);
    playSuccessBeep();
    showScanFeedback(`+1 ${product.name}`, 'success');
  } else {
    // Ручной ввод — тоже короткий пик (как «касса приняла»)
    playSuccessBeep();
    notify(`Добавлено: ${product.name}`);
  }

  renderCart();
  pulseCartBadge();
}

// =========================================================
// КНОПКИ В КАТАЛОГЕ: СКАНЕР + РУЧНОЙ ВВОД
// =========================================================

function ensureScanButton() {
  if (document.getElementById('cashScanBtn')) return;

  const catalog = document.querySelector('.pos__catalog');
  if (!catalog) return;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:10px;';
  wrap.innerHTML = `
    <button id="cashScanBtn" type="button"
            style="width:100%; padding:14px 16px; border:none; border-radius:14px;
                   background:linear-gradient(135deg,#005F40,#003F2A); color:#fff;
                   font-family:inherit; font-size:15px; font-weight:700; cursor:pointer;
                   box-shadow:0 8px 20px rgba(0,95,64,.28);">
      📷 Сканировать штрихкод
    </button>
  `;
  catalog.insertBefore(wrap, catalog.firstChild);
  wrap.querySelector('#cashScanBtn').addEventListener('click', openScanner);
}

function ensureManualBarcodeInput() {
  if (document.getElementById('cashBarcodeInput')) return;

  const catalog = document.querySelector('.pos__catalog');
  if (!catalog) return;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex; gap:8px; align-items:stretch; margin-bottom:10px;';
  wrap.innerHTML = `
    <input type="text" id="cashBarcodeInput" inputmode="numeric"
           placeholder="Введите штрихкод вручную"
           autocomplete="off"
           style="flex:1; min-width:0; padding:12px 14px;
                  border:1px solid var(--kut-border,#E3EAE6); border-radius:12px;
                  font-size:15px; outline:none;">
    <button type="button" id="cashBarcodeSearchBtn" class="btn btn--ghost"
            style="white-space:nowrap; padding:0 14px;">Поиск</button>
  `;
  catalog.insertBefore(wrap, catalog.firstChild);

  const input = wrap.querySelector('#cashBarcodeInput');
  const btn = wrap.querySelector('#cashBarcodeSearchBtn');

  const doSearch = () => {
    const code = input.value.trim();
    if (!code) return;
    // Сбрасываем cooldown для ручного ввода, чтобы можно было
    // принудительно найти тот же товар повторно
    if (code === lastScannedBarcode && (Date.now() - lastScannedAt) < SCAN_COOLDOWN_MS) {
      // всё равно добавляем — это осознанный ручной ввод
      lastScannedBarcode = null;
    }
    handleDecodedBarcode(code, false);
    input.value = '';
  };

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });
}

// =========================================================
// КАТАЛОГ
// =========================================================

function renderCategories() {
  if (!el.categories) return;
  const available = ['Все', ...new Set(PRODUCTS.map((p) => p.category).filter(Boolean))];
  const list = available.length > 1 ? available : CATEGORIES;

  el.categories.innerHTML = list
    .map((cat) => {
      const active = cat === state.category ? ' is-active' : '';
      const label = window.KUT_LANG?.tCategory(cat) || cat;
      return `<button class="cat-chip${active}" type="button" role="tab"
              aria-selected="${cat === state.category}"
              data-cat="${escapeHtml(cat)}">${escapeHtml(label)}</button>`;
    })
    .join('');
}

function getVisibleProducts() {
  const q = state.search.trim().toLowerCase();
  return PRODUCTS.filter((p) => {
    const matchCat = state.category === 'Все' || p.category === state.category;
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      String(p.barcode || '').includes(q);
    return matchCat && matchSearch;
  });
}

function renderProducts() {
  if (!el.productsGrid) return;

  if (PRODUCTS.length === 0) {
    el.productsGrid.innerHTML = `
      <div class="products__empty" style="grid-column:1 / -1; padding:60px 20px; text-align:center;">
        <div style="font-size:48px; margin-bottom:12px; opacity:.8;">📦</div>
        <h3 style="margin:0 0 8px; color:var(--kut-text,#14211C); font-size:17px;">
          На складе нет товаров
        </h3>
        <p style="margin:0 0 18px; color:var(--kut-muted,#64776E); font-size:14px;">
          Добавьте их в разделе Склад — и они появятся здесь.
        </p>
        <a href="./stock.html" class="btn btn--gold" style="text-decoration:none;">
          Перейти в Склад →
        </a>
      </div>`;
    return;
  }

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
          <span class="product__name">${escapeHtml(window.KUT_LANG?.tProduct(p.name) || p.name)}</span>
          <span class="product__price">${fmt(p.price)}<small>KGS</small></span>
          ${stockLine}
        </button>`;
    })
    .join('');
}

// =========================================================
// КОРЗИНА
// =========================================================

function addToCart(productId) {
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) return;

  const existing = state.cart.find((i) => i.id === productId);
  const currentQty = existing ? existing.qty : 0;
  const stockQty = Number(product.qty);
  const unit = product.unit || 'шт';

  if (Number.isFinite(stockQty) && currentQty >= stockQty) {
    if (stockQty <= 0) notify(`Товар «${product.name}» закончился на складе.`, true);
    else notify(`Недостаточно товара на складе! Осталось всего ${fmt(stockQty)} ${unit}.`, true);
    return;
  }

  if (existing) existing.qty += 1;
  else state.cart.push({ id: product.id, name: product.name, price: product.price, unit, qty: 1 });

  renderCart();
  pulseCartBadge();
}

function changeQty(productId, delta) {
  const item = state.cart.find((i) => i.id === productId);
  if (!item) return;

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
  if (item.qty <= 0) state.cart = state.cart.filter((i) => i.id !== productId);
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

function getCartTotal() { return state.cart.reduce((sum, i) => sum + i.price * i.qty, 0); }
function getCartCount() { return state.cart.reduce((sum, i) => sum + i.qty, 0); }

function renderCart() {
  const { cart } = state;
  const total = getCartTotal();
  const count = getCartCount();

  if (cart.length === 0) {
    if (el.cartItems) el.cartItems.innerHTML = '';
    if (el.cartEmpty) el.cartEmpty.hidden = false;
    if (el.cartItems) el.cartItems.hidden = true;
  } else {
    if (el.cartEmpty) el.cartEmpty.hidden = true;
    if (el.cartItems) {
      el.cartItems.hidden = false;
      el.cartItems.innerHTML = cart
        .map((i) => `
          <div class="cart-item" data-id="${escapeHtml(i.id)}">
            <div class="cart-item__info">
              <div class="cart-item__name">${escapeHtml(window.KUT_LANG?.tProduct(i.name) || i.name)}</div>
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
  }

  if (el.cartCount) el.cartCount.textContent = count;
  if (el.cartToggleCount) el.cartToggleCount.textContent = count;
  if (el.cartTotal) el.cartTotal.innerHTML = `${fmt(total)}<small>KGS</small>`;
  if (el.cartToggleSum) el.cartToggleSum.textContent = `${fmt(total)} KGS`;
  if (el.clearCartBtn) el.clearCartBtn.disabled = cart.length === 0;
  if (el.checkoutBtn) el.checkoutBtn.disabled = cart.length === 0;
  if (el.paymentModal && el.paymentModal.hidden === false && el.paymentTotal) {
    el.paymentTotal.textContent = `${fmt(total)} KGS`;
  }
}

function pulseCartBadge() {
  if (!el.cartCount || !el.cartCount.animate) return;
  el.cartCount.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
    { duration: 220, easing: 'ease-out' }
  );
}

// =========================================================
// МОДАЛЬНЫЕ ОКНА (общие)
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
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
}

// =========================================================
// ОПЛАТА
// =========================================================

function openPaymentModal() {
  if (state.cart.length === 0) return;
  state.paymentMethod = null;
  state.customer = '';
  if (el.debtCustomer) el.debtCustomer.value = '';
  if (el.debtBlock) el.debtBlock.hidden = true;
  if (el.confirmPayBtn) el.confirmPayBtn.disabled = true;

  if (el.payMethods) {
    el.payMethods.querySelectorAll('.pay-method').forEach((btn) => {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-checked', 'false');
    });
  }

  if (el.paymentTotal) el.paymentTotal.textContent = `${fmt(getCartTotal())} KGS`;
  renderCustomersDatalist();
  openModal(el.paymentModal);
}

function selectPaymentMethod(method) {
  state.paymentMethod = method;
  if (el.payMethods) {
    el.payMethods.querySelectorAll('.pay-method').forEach((btn) => {
      const isActive = btn.dataset.method === method;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-checked', String(isActive));
    });
  }

  if (method === 'debt') {
    if (el.debtBlock) el.debtBlock.hidden = false;
    requestAnimationFrame(() => el.debtCustomer && el.debtCustomer.focus());
    updateConfirmState();
  } else {
    if (el.debtBlock) el.debtBlock.hidden = true;
    if (el.debtCustomer) el.debtCustomer.value = '';
    state.customer = '';
    if (el.confirmPayBtn) el.confirmPayBtn.disabled = false;
  }
}

function updateConfirmState() {
  if (!el.confirmPayBtn) return;
  if (state.paymentMethod !== 'debt') { el.confirmPayBtn.disabled = false; return; }
  el.confirmPayBtn.disabled = state.customer.trim().length < 2;
}

function getCustomers() { return readLS(STORAGE.CUSTOMERS, []); }

function renderCustomersDatalist() {
  if (!el.debtList) return;
  const list = getCustomers();
  el.debtList.innerHTML = list.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
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
// ПОДТВЕРЖДЕНИЕ ПРОДАЖИ
// =========================================================

function confirmPayment() {
  if (state.cart.length === 0) return;
  if (!state.paymentMethod) return;
  if (state.paymentMethod === 'debt' && state.customer.trim().length < 2) return;

  if (!window.KUT || typeof window.KUT.registerSale !== 'function') {
    console.error('[cash.js] Ядро KUT не загружено.');
    notify('Ошибка: ядро системы не загружено.', true);
    return;
  }

  const total = getCartTotal();

  const result = window.KUT.registerSale({
    cart: state.cart.map((i) => ({
      id: i.id, name: i.name, price: i.price, unit: i.unit || 'шт', qty: i.qty,
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

  if (state.paymentMethod === 'debt' && state.customer.trim()) {
    rememberCustomer(state.customer.trim());
  }

  closeModal(el.paymentModal);
  if (el.successTotal) el.successTotal.textContent = `${fmt(total)} KGS`;
  openModal(el.successModal);

  state.cart = [];
  state.paymentMethod = null;
  state.customer = '';
  renderCart();
  if (el.cart) el.cart.classList.remove('is-open');
  refreshProductsFromStock();
}

// =========================================================
// СОБЫТИЯ
// =========================================================

function bindEvents() {
  if (el.searchInput) el.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderProducts();
  });

  if (el.categories) el.categories.addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    state.category = chip.dataset.cat;
    renderCategories();
    renderProducts();
  });

  if (el.productsGrid) el.productsGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.product');
    if (!card) return;
    if (card.getAttribute('aria-disabled') === 'true') return;
    addToCart(card.dataset.id);
  });

  if (el.cartItems) el.cartItems.addEventListener('click', (e) => {
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

  if (el.clearCartBtn) el.clearCartBtn.addEventListener('click', () => {
    if (state.cart.length === 0) return;
    if (confirm('Очистить чек полностью?')) clearCart();
  });

  if (el.checkoutBtn) el.checkoutBtn.addEventListener('click', openPaymentModal);

  if (el.payMethods) el.payMethods.addEventListener('click', (e) => {
    const btn = e.target.closest('.pay-method');
    if (!btn) return;
    selectPaymentMethod(btn.dataset.method);
  });

  if (el.debtCustomer) el.debtCustomer.addEventListener('input', (e) => {
    state.customer = e.target.value;
    updateConfirmState();
  });

  if (el.confirmPayBtn) el.confirmPayBtn.addEventListener('click', confirmPayment);

  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (el.paymentModal && !el.paymentModal.hidden) closeModal(el.paymentModal);
    else if (el.successModal && !el.successModal.hidden) closeModal(el.successModal);
    else if (scannerModal && !scannerModal.hidden) stopScanner();
    else if (el.cart) el.cart.classList.remove('is-open');
  });

  if (el.cartToggle) el.cartToggle.addEventListener('click', () => {
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

  if (window.KUT?.onStorage) {
    window.KUT.onStorage(({ key }) => {
      if (key === window.KUT.keys.products) {
        refreshProductsFromStock();
        renderCart();
      }
    });
  }

  window.addEventListener('kut:lang', () => {
    renderCategories();
    renderProducts();
    renderCart();
  });
}

// =========================================================
// ИНИЦИАЛИЗАЦИЯ
// =========================================================

function init() {
  if (!window.KUT) {
    console.error('[cash.js] window.KUT не найден. Подключите js/app.js ПЕРЕД js/cash.js');
  }

  renderCategories();
  renderProducts();
  renderCart();
  ensureScanButton();
  ensureManualBarcodeInput();
  bindEvents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
