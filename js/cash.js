/* =========================================================
   NexusBiz — Модуль «Касса» (cash.js) · v11.1 «Square»
   
   НАДЁЖНОЕ СОХРАНЕНИЕ КОРЗИНЫ:
   • Синхронно при КАЖДОМ изменении корзины
   • visibilitychange (сворачивание браузера)
   • pagehide (мобильный аналог beforeunload)
   • beforeunload (десктоп)
   • Восстановление — в самом начале init(), до Firebase
   • Миграция со старых ключей v1/v2
   • Отладка через console + window.__KUT_CART__

   🆕 v11.1 SQUARE:
   • Интеграция со сканером штрихкодов (kut:barcode)
   • Автопоиск товара в Firestore + добавление в корзину
   • Приоритет cart-pro.js, если он подключён
   ========================================================= */

(function () {
  'use strict';

  const SCAN_COOLDOWN_MS = 2000;
  const PRODUCTS_PAGE_SIZE = 200;
  const CATEGORIES_FALLBACK = ['Все', 'Выпечка', 'Напитки', 'Продукты', 'Хозтовары', 'Одежда', 'Услуги', 'Другое'];

  const PHONE_REGEX = /^\+?[0-9\s\-()]{9,20}$/;
  const digitsOnly = (s) => String(s || '').replace(/\D/g, '');

  const CART_LS_KEYS = ['kut_cart_v3', 'kut_cart_v2', 'kut_cart_v1'];
  const CART_LS_PRIMARY = 'kut_cart_v3';

  const state = {
    products: [],
    cart: [],
    category: 'Все',
    search: '',
    paymentMethod: null,
    customer: '',
    customerPhone: '',
    unsubProducts: null,
    cartRestored: false,
    productsLoaded: false,
  };

  let lastScannedBarcode = null;
  let lastScannedAt = 0;

  const $ = (s) => document.querySelector(s);
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
    debtPhone:      $('#debtPhone'),
    debtHint:       $('#debtHint'),
    debtList:       $('#debtCustomersList'),
    confirmPayBtn:  $('#confirmPayBtn'),
    successModal:   $('#successModal'),
    successTotal:   $('#successTotal'),
    scanBtn:           $('#cashScanBtn'),

    qrPaymentModal:   $('#qrPaymentModal'),
    qrCodeContainer:  $('#qrCodeContainer'),
    qrPaymentTotal:   $('#qrPaymentTotal'),
    qrConfirmBtn:     $('#qrConfirmBtn'),
    qrCancelBtn:      $('#qrCancelBtn'),
  };

  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function notify(message, isError) {
    if (window.KUT?.toast) window.KUT.toast(message, isError);
    else console.log('[cash]', message);
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function waitForReady(timeoutMs) {
    timeoutMs = timeoutMs || 25000;
    const start = Date.now();
    while (!window.KUT) {
      if (Date.now() - start > timeoutMs) return null;
      await sleep(50);
    }
    while (true) {
      const st = window.KUT.getState ? window.KUT.getState() : null;
      if (st && st.businessId) return st;
      if (Date.now() - start > timeoutMs) return null;
      await sleep(100);
    }
  }

  function saveCartToLS() {
    try {
      const full = state.cart.map((i) => ({
        id:        String(i.id),
        name:      String(i.name || ''),
        price:     Number(i.price) || 0,
        costPrice: Number(i.costPrice) || 0,
        unit:      String(i.unit || 'шт'),
        qty:       Number(i.qty) || 0,
      }));

      localStorage.setItem(CART_LS_PRIMARY, JSON.stringify(full));
      window.__KUT_CART__ = full;

      console.log('[cash] 💾 Корзина сохранена:', full.length, 'поз.',
                  full.map((x) => x.name + '×' + x.qty).join(', '));
    } catch (e) {
      console.warn('[cash] saveCartToLS error:', e);
    }
  }

  function readCartFromLS() {
    for (const key of CART_LS_KEYS) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || arr.length === 0) continue;

        const parsed = arr
          .filter((x) => x && typeof x.id === 'string' && Number(x.qty) > 0)
          .map((x) => ({
            id:        String(x.id),
            name:      String(x.name || ''),
            price:     Number(x.price) || 0,
            costPrice: Number(x.costPrice) || 0,
            unit:      String(x.unit || 'шт'),
            qty:       Number(x.qty) || 0,
          }));

        if (parsed.length > 0) {
          console.log('[cash] 📖 Корзина найдена в LS[' + key + ']:', parsed.length, 'поз.');
          if (key !== CART_LS_PRIMARY) {
            try { localStorage.setItem(CART_LS_PRIMARY, JSON.stringify(parsed)); } catch (_) {}
          }
          return parsed;
        }
      } catch (e) {
        console.warn('[cash] readCartFromLS key=' + key + ' error:', e);
      }
    }
    console.log('[cash] 📖 Корзина в LS не найдена (все ключи пусты)');
    return [];
  }

  function clearCartFromLS() {
    try {
      CART_LS_KEYS.forEach((k) => localStorage.removeItem(k));
      window.__KUT_CART__ = [];
      console.log('[cash] 🗑️ Корзина очищена из LS');
    } catch (_) {}
  }

  function restoreCartFromLS() {
    if (state.cartRestored) return;
    state.cartRestored = true;

    const saved = readCartFromLS();
    if (saved.length === 0) return;

    state.cart = saved;
    renderCart();
    console.log('[cash] ✓ Корзина восстановлена мгновенно:', state.cart.length, 'поз.');
  }

  function mergeCartWithProducts() {
    if (state.cart.length === 0) return;
    if (state.products.length === 0) return;

    const merged = [];
    let changed = false;

    state.cart.forEach((item) => {
      const fresh = state.products.find((p) => p.id === item.id);
      if (!fresh) {
        changed = true;
        console.log('[cash] ✗ Товар удалён со склада:', item.name);
        return;
      }

      const stockQty = Number(fresh.qty);
      let qty = Number(item.qty) || 0;

      if (Number.isFinite(stockQty) && stockQty > 0 && qty > stockQty) {
        qty = stockQty;
        changed = true;
      }
      if (qty <= 0) {
        changed = true;
        return;
      }

      if (Number(item.price) !== Number(fresh.price)) changed = true;
      if (String(item.name) !== String(fresh.name)) changed = true;

      merged.push({
        id: fresh.id,
        name: fresh.name,
        price: fresh.price,
        costPrice: fresh.costPrice,
        unit: fresh.unit || 'шт',
        qty,
      });
    });

    state.cart = merged;
    renderCart();
    if (changed) saveCartToLS();
    console.log('[cash] 🔄 Корзина синхронизирована со складом:', merged.length, 'поз.');
  }

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
      name: p.name || '',
      price: Number(p.salePrice) || 0,
      costPrice: Number(p.costPrice) || 0,
      category: p.category || 'Другое',
      unit: p.unit || 'шт',
      qty: Number(p.qty) || 0,
      barcode: p.barcode || '',
      emoji: emojiForCategory(p.category),
    };
  }

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
  function playSuccessBeep() {
    const ctx = getAudioCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'square'; osc.frequency.setValueAtTime(2000, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.1);
  }
  function playErrorBeep() {
    const ctx = getAudioCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.13].forEach((delay) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(320, now + delay);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.16, now + delay + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + delay); osc.stop(now + delay + 0.12);
    });
  }

  function speakAmount(total) {
    try {
      if (!('speechSynthesis' in window)) return;
      const amount = Math.round(Number(total) || 0);
      if (amount <= 0) return;

      let lang = 'ru';
      try {
        const saved = localStorage.getItem('kut_lang');
        if (saved === 'kg' || saved === 'en') lang = saved;
      } catch (_) {}

      let text;
      if (lang === 'kg') text = 'Төлөндү ' + amount + ' сом';
      else if (lang === 'en') text = 'Paid ' + amount + ' som';
      else text = 'Товар продан. Сумма ' + amount + ' сомов';

      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'kg' ? 'ru-RU' : (lang === 'en' ? 'en-US' : 'ru-RU');
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 0.9;

      try { window.speechSynthesis.cancel(); } catch (_) {}
      window.speechSynthesis.speak(u);
    } catch (err) {
      console.warn('[cash] speakAmount error:', err);
    }
  }

  async function openScanner() {
    if (window.KUTScanner && typeof window.KUTScanner.open === 'function') {
      window.KUTScanner.open((code) => {
        handleDecodedBarcode(String(code).trim(), true);
      });
      return;
    }
    if (!window.Html5Qrcode) {
      notify('Сканер ещё загружается. Попробуйте через секунду.', true);
      return;
    }
    notify('Сканер недоступен. Обновите страницу.', true);
  }

  function handleDecodedBarcode(code, fromCamera) {
    if (!code) return;
    const now = Date.now();
    if (code === lastScannedBarcode && (now - lastScannedAt) < SCAN_COOLDOWN_MS) return;
    lastScannedBarcode = code;
    lastScannedAt = now;

    const product = state.products.find((p) => String(p.barcode) === String(code));
    if (!product) {
      if (fromCamera) {
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
        playErrorBeep();
        notify(`Товар «${code}» не найден на складе`, true);
      } else notify(`Товар со штрихкодом ${code} не найден`, true);
      return;
    }

    const existing = state.cart.find((i) => i.id === product.id);
    const currentQty = existing ? existing.qty : 0;
    const stockQty = Number(product.qty);

    if (Number.isFinite(stockQty) && currentQty >= stockQty) {
      const msg = stockQty <= 0
        ? `«${product.name}» закончился на складе`
        : `«${product.name}»: осталось всего ${fmt(stockQty)} ${product.unit}`;
      if (fromCamera) {
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
        playErrorBeep();
        notify(msg, true);
      } else notify(msg, true);
      return;
    }

    if (existing) existing.qty += 1;
    else state.cart.push({
      id: product.id, name: product.name, price: product.price,
      costPrice: product.costPrice,
      unit: product.unit, qty: 1,
    });

    if (fromCamera) {
      if (navigator.vibrate) navigator.vibrate(80);
    }
    playSuccessBeep();
    notify(`+1 ${product.name}`);

    renderCart();
    pulseCartBadge();
    saveCartToLS();
  }

  function renderCategories() {
    if (!el.categories) return;
    const available = ['Все', ...new Set(state.products.map((p) => p.category).filter(Boolean))];
    const list = available.length > 1 ? available : CATEGORIES_FALLBACK;
    el.categories.innerHTML = list.map((cat) => {
      const active = cat === state.category ? ' is-active' : '';
      return `<button class="cat-chip${active}" type="button" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    }).join('');
  }

  function getVisibleProducts() {
    const q = state.search.trim().toLowerCase();
    return state.products.filter((p) => {
      const matchCat = state.category === 'Все' || p.category === state.category;
      const matchSearch = !q || p.name.toLowerCase().includes(q) || String(p.barcode || '').includes(q);
      return matchCat && matchSearch;
    });
  }

  function renderProducts() {
    if (!el.productsGrid) return;
    if (state.products.length === 0) {
      el.productsGrid.innerHTML = `
        <div class="empty-stock">
          <div class="empty-stock__icon">📦</div>
          <h3>На складе нет товаров</h3>
          <p>Добавьте их в разделе Склад — и они появятся здесь.</p>
          <a href="./stock.html">Перейти в Склад →</a>
        </div>`;
      return;
    }
    const items = getVisibleProducts();
    if (items.length === 0) {
      el.productsGrid.innerHTML = `<div class="products__empty">Ничего не найдено.</div>`;
      return;
    }
    el.productsGrid.innerHTML = items.map((p) => {
      const qty = Number(p.qty);
      const isFiniteQty = Number.isFinite(qty);
      const isOut = isFiniteQty && qty <= 0;
      const unit = p.unit || 'шт';
      const stockLine = isFiniteQty
        ? `<span style="font-size:11px;font-weight:600;margin-top:2px;color:${
            isOut ? 'var(--kut-danger)' : qty < 5 ? 'var(--kut-warning)' : 'var(--kut-text-3)'
          };">${isOut ? 'нет в наличии' : 'осталось ' + fmt(qty) + ' ' + escapeHtml(unit)}</span>`
        : '';
      return `
        <button class="product" type="button" data-id="${escapeHtml(p.id)}"
          ${isOut ? 'aria-disabled="true"' : ''} style="${isOut ? 'opacity:.55;' : ''}">
          <span class="product__emoji" aria-hidden="true">${p.emoji}</span>
          <span class="product__name">${escapeHtml(p.name)}</span>
          <span class="product__price">${fmt(p.price)}<small>KGS</small></span>
          ${stockLine}
        </button>`;
    }).join('');
  }

  function addToCart(productId) {
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;
    const existing = state.cart.find((i) => i.id === productId);
    const currentQty = existing ? existing.qty : 0;
    const stockQty = Number(product.qty);
    const unit = product.unit || 'шт';
    if (Number.isFinite(stockQty) && currentQty >= stockQty) {
      if (stockQty <= 0) notify(`Товар «${product.name}» закончился.`, true);
      else notify(`Недостаточно товара! Осталось всего ${fmt(stockQty)} ${unit}.`, true);
      return;
    }
    if (existing) existing.qty += 1;
    else state.cart.push({
      id: product.id, name: product.name, price: product.price,
      costPrice: product.costPrice,
      unit, qty: 1,
    });
    renderCart();
    pulseCartBadge();
    saveCartToLS();
  }

  function changeQty(productId, delta) {
    const item = state.cart.find((i) => i.id === productId);
    if (!item) return;
    if (delta > 0) {
      const product = state.products.find((p) => p.id === productId);
      const stockQty = product ? Number(product.qty) : Infinity;
      if (Number.isFinite(stockQty) && item.qty >= stockQty) {
        notify(`Недостаточно товара! Осталось ${fmt(stockQty)} ${(product && product.unit) || 'шт'}.`, true);
        return;
      }
    }
    item.qty += delta;
    if (item.qty <= 0) state.cart = state.cart.filter((i) => i.id !== productId);
    renderCart();
    saveCartToLS();
  }

  function removeFromCart(productId) {
    state.cart = state.cart.filter((i) => i.id !== productId);
    renderCart();
    saveCartToLS();
  }

  function clearCart() {
    if (state.cart.length === 0) return;
    state.cart = [];
    renderCart();
    clearCartFromLS();
  }

  const getCartTotal = () => state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const getCartCount = () => state.cart.reduce((s, i) => s + i.qty, 0);

  function renderCart() {
    const { cart } = state;
    const total = getCartTotal();
    const count = getCartCount();

    if (cart.length === 0) {
      if (el.cartItems) {
        el.cartItems.innerHTML = '';
        el.cartItems.hidden = true;
      }
      if (el.cartEmpty) el.cartEmpty.hidden = false;
    } else {
      if (el.cartEmpty) el.cartEmpty.hidden = true;
      if (el.cartItems) {
        el.cartItems.hidden = false;
        el.cartItems.innerHTML = cart.map((i) => `
          <div class="cart-item" data-id="${escapeHtml(i.id)}">
            <div class="cart-item__info">
              <div class="cart-item__name">${escapeHtml(i.name)}</div>
              <div class="cart-item__meta">${fmt(i.price)} × ${i.qty} ${escapeHtml(i.unit || 'шт')}</div>
              <div class="cart-item__total">${fmt(i.price * i.qty)} KGS</div>
            </div>
            <div class="cart-item__controls">
              <button class="qty-btn" type="button" data-act="dec">−</button>
              <span class="qty-value">${i.qty}</span>
              <button class="qty-btn" type="button" data-act="inc">+</button>
            </div>
            <button class="qty-remove" type="button" data-act="remove">×</button>
          </div>`).join('');
      }
    }

    if (el.cartCount) el.cartCount.textContent = count;
    if (el.cartToggleCount) el.cartToggleCount.textContent = count;
    if (el.cartTotal) el.cartTotal.innerHTML = `${fmt(total)}<small>KGS</small>`;
    if (el.cartToggleSum) el.cartToggleSum.textContent = `${fmt(total)} KGS`;
    if (el.clearCartBtn) el.clearCartBtn.disabled = cart.length === 0;
    if (el.checkoutBtn) el.checkoutBtn.disabled = cart.length === 0;
    if (el.paymentModal && !el.paymentModal.hidden && el.paymentTotal) {
      el.paymentTotal.textContent = `${fmt(total)} KGS`;
    }
    if (el.qrPaymentModal && !el.qrPaymentModal.hidden && el.qrPaymentTotal) {
      el.qrPaymentTotal.innerHTML = `${fmt(total)}<small>KGS</small>`;
    }
  }

  function pulseCartBadge() {
    if (!el.cartCount || !el.cartCount.animate) return;
    el.cartCount.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
      { duration: 220, easing: 'ease-out' }
    );
  }

  let lastFocused = null;
  function openModal(modal) {
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function openPaymentModal() {
    if (state.cart.length === 0) return;
    state.paymentMethod = null;
    state.customer = '';
    state.customerPhone = '';

    if (el.debtCustomer) {
      el.debtCustomer.value = '';
      el.debtCustomer.classList.remove('is-invalid');
    }
    if (el.debtPhone) {
      el.debtPhone.value = '';
      el.debtPhone.classList.remove('is-invalid');
    }
    if (el.debtHint) {
      el.debtHint.textContent = 'Имя и телефон обязательны — без них нельзя оформить долг.';
      el.debtHint.classList.remove('is-error');
    }

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
      return;
    }

    if (el.debtBlock) el.debtBlock.hidden = true;
    if (el.debtCustomer) el.debtCustomer.value = '';
    if (el.debtPhone) el.debtPhone.value = '';
    state.customer = '';
    state.customerPhone = '';

    if (el.confirmPayBtn) el.confirmPayBtn.disabled = false;
  }

  function updateConfirmState() {
    if (!el.confirmPayBtn) return;

    if (state.paymentMethod !== 'debt') {
      el.confirmPayBtn.disabled = false;
      return;
    }

    const nameOk = state.customer.trim().length >= 2;
    const phoneOk = PHONE_REGEX.test(state.customerPhone.trim())
                    && digitsOnly(state.customerPhone).length >= 9;

    el.confirmPayBtn.disabled = !(nameOk && phoneOk);
  }

  function readCustomersLS() {
    try {
      const raw = localStorage.getItem('kut_customers');
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function rememberCustomer(name) {
    const clean = String(name || '').trim();
    if (!clean) return;
    const list = readCustomersLS();
    if (!list.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      list.push(clean);
      try { localStorage.setItem('kut_customers', JSON.stringify(list)); } catch (_) {}
    }
  }
  function renderCustomersDatalist() {
    if (!el.debtList) return;
    const list = readCustomersLS();
    el.debtList.innerHTML = list.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
  }

  function openQrPaymentModal() {
    if (state.cart.length === 0) {
      closeModal(el.paymentModal);
      return;
    }
    if (!el.qrPaymentModal) return;

    const total = getCartTotal();
    if (el.qrPaymentTotal) {
      el.qrPaymentTotal.innerHTML = `${fmt(total)}<small>KGS</small>`;
    }

    if (el.qrCodeContainer) {
      el.qrCodeContainer.innerHTML = `
        <div class="qr-frame__loading">
          <div class="spinner-qr"></div>
          Генерируем QR...
        </div>`;
    }

    if (el.paymentModal && !el.paymentModal.hidden) {
      el.paymentModal.hidden = true;
    }
    openModal(el.qrPaymentModal);

    generateQrCode(total, 0);
  }

  function generateQrCode(total, attempt) {
    attempt = attempt || 0;
    if (!el.qrCodeContainer) return;

    if (typeof window.qrcode !== 'function') {
      if (attempt < 25) {
        setTimeout(() => generateQrCode(total, attempt + 1), 120);
        return;
      }
      el.qrCodeContainer.innerHTML =
        '<div class="qr-frame__error">QR-библиотека не загрузилась.<br>Проверьте интернет.</div>';
      return;
    }

    try {
      const profile = window.KUT?.getState?.()?.profile || null;
      const bizId = window.KUT?.getState?.()?.businessId || '';
      const bizName = profile?.displayName || profile?.email || 'NexusBiz';

      const payload = JSON.stringify({
        t: 'nexus_pay',
        b: bizName,
        bid: bizId,
        a: Number(total) || 0,
        c: 'KGS',
        ts: Date.now(),
      });

      const qr = window.qrcode(0, 'M');
      qr.addData(payload);
      qr.make();

      const svg = qr.createSvgTag({ cellSize: 6, margin: 8, scalable: true });
      el.qrCodeContainer.innerHTML = svg;
    } catch (err) {
      console.error('[cash] QR generation error:', err);
      el.qrCodeContainer.innerHTML =
        '<div class="qr-frame__error">Не удалось сгенерировать QR.</div>';
    }
  }

  function closeQrPaymentModal() {
    if (el.qrPaymentModal && !el.qrPaymentModal.hidden) {
      closeModal(el.qrPaymentModal);
    }
    state.paymentMethod = null;
    if (el.qrCodeContainer) el.qrCodeContainer.innerHTML = '';
  }

  async function confirmPayment() {
    if (state.cart.length === 0) return;
    if (!state.paymentMethod) return;

    if (state.paymentMethod === 'debt') {
      let ok = true;

      if (state.customer.trim().length < 2) {
        if (el.debtCustomer) el.debtCustomer.classList.add('is-invalid');
        ok = false;
      }
      if (!PHONE_REGEX.test(state.customerPhone.trim()) || digitsOnly(state.customerPhone).length < 9) {
        if (el.debtPhone) el.debtPhone.classList.add('is-invalid');
        ok = false;
      }

      if (!ok) {
        if (el.debtHint) {
          el.debtHint.textContent = 'Заполните имя и телефон — без них нельзя оформить долг.';
          el.debtHint.classList.add('is-error');
        }
        notify('Введите имя и телефон клиента', true);
        return;
      }
    }

    if (state.paymentMethod === 'wallet') {
      openQrPaymentModal();
      return;
    }

    await executeSale(state.paymentMethod, el.confirmPayBtn);
  }

  async function confirmQrPayment() {
    if (state.cart.length === 0) {
      closeQrPaymentModal();
      return;
    }
    await executeSale('qr', el.qrConfirmBtn);
  }

  async function executeSale(paymentMethod, btnEl) {
    if (state.cart.length === 0) return;

    if (!window.KUT || typeof window.KUT.registerSale !== 'function') {
      notify('Ошибка: ядро не загружено.', true);
      return;
    }

    const currentState = window.KUT.getState ? window.KUT.getState() : null;
    const profile = currentState?.profile || null;
    const cashier = profile ? {
      uid:   profile.uid || '',
      name:  profile.displayName || profile.email || '',
      email: profile.email || '',
      role:  profile.role || 'cashier',
    } : null;

    const total = getCartTotal();

    if (btnEl) {
      btnEl.disabled = true;
      const originalText = btnEl.textContent;
      btnEl.dataset.originalText = originalText;
      btnEl.textContent = 'Сохраняем...';
    }

    const result = await window.KUT.registerSale({
      cart: state.cart.map((i) => ({
        productId: i.id,
        id: i.id,
        name: i.name,
        price: i.price,
        costPrice: i.costPrice,
        unit: i.unit || 'шт',
        quantity: i.qty,
        qty: i.qty,
      })),
      total,
      paymentMethod,
      customer: paymentMethod === 'debt' ? state.customer : '',
      customerPhone: paymentMethod === 'debt' ? state.customerPhone : '',
      cashier: cashier,
    });

    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = btnEl.dataset.originalText || 'Подтвердить';
      delete btnEl.dataset.originalText;
    }

    if (!result.ok) {
      if (result.error === 'stock') {
        const it = result.item;
        const msg = result.reason === 'missing'
          ? `Товар «${it.name}» больше не найден на складе.`
          : `Недостаточно товара «${it.name}»: осталось ${fmt(it.available)} ${it.unit}.`;
        notify(msg, true);
      } else {
        notify('Ошибка: ' + (result.error || '') + ' ' + (result.message || ''), true);
      }
      return;
    }

    if (paymentMethod === 'debt' && state.customer.trim()) {
      rememberCustomer(state.customer.trim());
    }

    if (el.qrPaymentModal && !el.qrPaymentModal.hidden) {
      el.qrPaymentModal.hidden = true;
      document.body.style.overflow = '';
    }
    if (el.paymentModal && !el.paymentModal.hidden) {
      closeModal(el.paymentModal);
    }

    if (el.qrCodeContainer) el.qrCodeContainer.innerHTML = '';

    speakAmount(total);

    if (el.successTotal) el.successTotal.textContent = `${fmt(total)} KGS`;
    openModal(el.successModal);

    state.cart = [];
    state.paymentMethod = null;
    state.customer = '';
    state.customerPhone = '';
    clearCartFromLS();
    renderCart();
    if (el.cart) el.cart.classList.remove('is-open');
  }

  function bindEvents() {
    if (el.searchInput) {
      el.searchInput.addEventListener('input', (e) => {
        state.search = e.target.value;
        renderProducts();
      });

      el.searchInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const visible = getVisibleProducts();
        if (visible.length > 0) {
          e.preventDefault();
          addToCart(visible[0].id);
          el.searchInput.value = '';
          state.search = '';
          renderProducts();
        }
      });
    }

    if (el.categories) el.categories.addEventListener('click', (e) => {
      const chip = e.target.closest('.cat-chip');
      if (!chip) return;
      state.category = chip.dataset.cat;
      renderCategories(); renderProducts();
    });

    if (el.productsGrid) el.productsGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.product');
      if (!card || card.getAttribute('aria-disabled') === 'true') return;
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
      if (e.target.classList.contains('is-invalid') && state.customer.trim().length >= 2) {
        e.target.classList.remove('is-invalid');
      }
      if (el.debtHint && el.debtHint.classList.contains('is-error')) {
        el.debtHint.textContent = 'Имя и телефон обязательны — без них нельзя оформить долг.';
        el.debtHint.classList.remove('is-error');
      }
      updateConfirmState();
    });

    if (el.debtPhone) el.debtPhone.addEventListener('input', (e) => {
      state.customerPhone = e.target.value;
      const valid = PHONE_REGEX.test(state.customerPhone.trim())
                    && digitsOnly(state.customerPhone).length >= 9;
      if (e.target.classList.contains('is-invalid') && valid) {
        e.target.classList.remove('is-invalid');
      }
      if (el.debtHint && el.debtHint.classList.contains('is-error') && valid) {
        el.debtHint.textContent = 'Имя и телефон обязательны — без них нельзя оформить долг.';
        el.debtHint.classList.remove('is-error');
      }
      updateConfirmState();
    });

    if (el.confirmPayBtn) el.confirmPayBtn.addEventListener('click', confirmPayment);
    if (el.qrConfirmBtn) el.qrConfirmBtn.addEventListener('click', confirmQrPayment);
    if (el.qrCancelBtn) el.qrCancelBtn.addEventListener('click', closeQrPaymentModal);

    if (el.scanBtn) el.scanBtn.addEventListener('click', openScanner);

    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-close-qr]')) {
        closeQrPaymentModal();
        return;
      }
      if (e.target.matches('[data-close]')) {
        const modal = e.target.closest('.modal');
        if (modal) closeModal(modal);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (el.qrPaymentModal && !el.qrPaymentModal.hidden) closeQrPaymentModal();
      else if (el.paymentModal && !el.paymentModal.hidden) closeModal(el.paymentModal);
      else if (el.successModal && !el.successModal.hidden) closeModal(el.successModal);
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
  }

  function bindGlobalPersistence() {
    window.addEventListener('pagehide', () => {
      console.log('[cash] 📌 pagehide → сохраняем корзину');
      try { saveCartToLS(); } catch (_) {}
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('[cash] 📌 visibilitychange → сохраняем корзину');
        try { saveCartToLS(); } catch (_) {}
      } else {
        const saved = readCartFromLS();
        if (saved.length > 0 && state.cart.length === 0) {
          console.log('[cash] 📌 вернулись на страницу — корзина была пуста в JS, но есть в LS');
          state.cart = saved;
          renderCart();
        }
      }
    });

    window.addEventListener('beforeunload', () => {
      try { saveCartToLS(); } catch (_) {}
    });

    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        console.log('[cash] 📌 pageshow (bfcache) → восстанавливаем корзину');
        state.cartRestored = false;
        restoreCartFromLS();
      }
    });
  }

  function bindBarcodeListener() {
    window.addEventListener('kut:barcode', async (e) => {
      const code = String(e.detail?.code || '').trim();
      if (!code) return;

      console.log('[cash] 📷 Barcode получен:', code);

      let product = state.products.find((p) => String(p.barcode) === code);

      if (!product && window.FB?.db) {
        const kst = window.KUT?.getState?.();
        const bizId = kst?.businessId || window.FB?.getBusinessId?.();
        if (bizId) {
          try {
            const { db, collection, query, where, limit, getDocs } = window.FB;
            const snap = await getDocs(query(
              collection(db, 'businesses', bizId, 'products'),
              where('barcode', '==', code),
              limit(1)
            ));
            if (!snap.empty) {
              const docSnap = snap.docs[0];
              product = stockToCashProduct({ id: docSnap.id, ...docSnap.data() });
              console.log('[cash] ✓ Товар найден в Firestore:', product.name);
            }
          } catch (err) {
            console.warn('[cash] barcode lookup failed:', err);
          }
        }
      }

      if (!product) {
        notify(`Товар со штрихкодом ${code} не найден`, true);
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
        playErrorBeep();
        return;
      }

      if (window.KUT_CART && typeof window.KUT_CART.addItem === 'function') {
        window.KUT_CART.addItem({
          id: product.id,
          name: product.name,
          price: product.price,
          costPrice: product.costPrice,
          unit: product.unit,
        }, 1);
        notify(`+ ${product.name}`);
        if (navigator.vibrate) navigator.vibrate(80);
        playSuccessBeep();
        return;
      }

      addToCart(product.id);
      notify(`+ ${product.name}`);
      if (navigator.vibrate) navigator.vibrate(80);
      playSuccessBeep();
    });

    console.log('[cash] 📷 Слушатель сканера штрихкодов активирован');
  }

  async function init() {
    console.log('[cash] 🚀 init() · v11.1 SQUARE');
    console.log('[cash] 📦 LS ключи:', CART_LS_KEYS.map((k) => k + '=' + (localStorage.getItem(k)?.length || 0) + 'b').join(', '));

    restoreCartFromLS();

    const st = await waitForReady();
    if (!st) { console.warn('[cash] Не дождались businessId'); return; }

    state.unsubProducts = window.FB.subscribePage('products', ({ items }) => {
      state.products = items.map(stockToCashProduct);
      renderCategories();
      renderProducts();

      if (!state.productsLoaded) {
        state.productsLoaded = true;
        mergeCartWithProducts();
      }
    }, {
      pageSize: PRODUCTS_PAGE_SIZE,
      orderByField: 'name',
      orderDirection: 'asc',
    });

    renderCategories();
    renderProducts();
    renderCart();
    bindEvents();
    bindGlobalPersistence();
    bindBarcodeListener();

    console.log('[cash] ✓ v11.1 SQUARE запущена · бизнес:', st.businessId);
    console.log('[cash] 💡 Отладка: window.__KUT_CART__ покажет текущую корзину');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
