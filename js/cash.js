/* =========================================================
   КУТ: БИЗНЕС — Модуль «Касса» (cash.js) · Firebase v5
   + QR-оплата для «MBANK / Элсом / О!Деньги»
   + Сканер штрихкода через центральную кнопку app.js
   + Убрано поле ручного ввода штрихкода (по требованию)
   + Фиксирует себестоимость costPrice в каждом item продажи.
   ========================================================= */

(function () {
  'use strict';

  const SCAN_COOLDOWN_MS = 2000;
  const CATEGORIES_FALLBACK = ['Все', 'Выпечка', 'Напитки', 'Продукты', 'Хозтовары', 'Одежда', 'Услуги', 'Другое'];

  const state = {
    products: [],
    cart: [],
    category: 'Все',
    search: '',
    paymentMethod: null,
    customer: '',
    unsubProducts: null,
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
    debtList:       $('#debtCustomersList'),
    confirmPayBtn:  $('#confirmPayBtn'),
    successModal:   $('#successModal'),
    successTotal:   $('#successTotal'),
    scanBtn:           $('#cashScanBtn'),

    // QR-оплата
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

  // ===== Звук =====
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

  // ===== Сканер =====
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
          Наводите камеру на штрихкоды — товары добавляются в чек.
        </p>
        <div style="position:relative;">
          <div id="cashScannerReader" style="width:100%; border-radius:14px; overflow:hidden; background:#000; min-height:220px;"></div>
          <div id="cashScannerFeedback" style="position:absolute; left:12px; right:12px; bottom:12px;
               padding:10px 14px; border-radius:12px; font-family:inherit; font-size:14px;
               font-weight:600; text-align:center; color:#fff; background:rgba(0,95,64,.92);
               box-shadow:0 6px 18px rgba(0,0,0,.25); opacity:0; transform:translateY(8px);
               transition:opacity .2s ease, transform .2s ease; pointer-events:none;"></div>
        </div>
        <div style="display:flex; gap:10px; margin-top:16px;">
          <button class="btn btn--primary btn--block" type="button" data-close-scanner>Готово</button>
        </div>
      </div>`;
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
    box.style.background = (kind === 'error') ? 'rgba(192,57,43,.92)' : 'rgba(0,95,64,.92)';
    box.style.opacity = '1';
    box.style.transform = 'translateY(0)';
    clearTimeout(scanFeedbackTimer);
    scanFeedbackTimer = setTimeout(() => {
      box.style.opacity = '0';
      box.style.transform = 'translateY(8px)';
    }, 1400);
  }

  async function openScanner() {
    if (!window.Html5Qrcode) {
      notify('Сканер ещё загружается. Попробуйте через секунду.', true);
      return;
    }
    try {
      const Html5Qrcode = window.Html5Qrcode;
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
        (decodedText) => { handleDecodedBarcode(String(decodedText).trim(), true); },
        () => {}
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
        showScanFeedback(`Товар «${code}» не найден на складе`, 'error');
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
        showScanFeedback(msg, 'error');
      } else notify(msg, true);
      return;
    }

    if (existing) existing.qty += 1;
    else state.cart.push({
      id: product.id, name: product.name, price: product.price,
      costPrice: product.costPrice,   // ← фиксируем себестоимость
      unit: product.unit, qty: 1,
    });

    if (fromCamera) {
      if (navigator.vibrate) navigator.vibrate(80);
      playSuccessBeep();
      showScanFeedback(`+1 ${product.name}`, 'success');
    } else {
      playSuccessBeep();
      notify(`Добавлено: ${product.name}`);
    }

    renderCart();
    pulseCartBadge();
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
            isOut ? '#C0392B' : qty < 5 ? '#E08A1E' : '#64776E'
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

  const getCartTotal = () => state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const getCartCount = () => state.cart.reduce((s, i) => s + i.qty, 0);

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

  // =========================================================
  // МОДАЛКА ОПЛАТЫ
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
      return;
    }

    // Скрываем долговой блок
    if (el.debtBlock) el.debtBlock.hidden = true;
    if (el.debtCustomer) el.debtCustomer.value = '';
    state.customer = '';

    if (method === 'wallet') {
      // QR-оплата: запускается только после нажатия «Подтвердить»
      if (el.confirmPayBtn) el.confirmPayBtn.disabled = false;
      return;
    }

    // Наличные — обычный путь
    if (el.confirmPayBtn) el.confirmPayBtn.disabled = false;
  }

  function updateConfirmState() {
    if (!el.confirmPayBtn) return;
    if (state.paymentMethod !== 'debt') { el.confirmPayBtn.disabled = false; return; }
    el.confirmPayBtn.disabled = state.customer.trim().length < 2;
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

  // =========================================================
  // QR-ОПЛАТА
  // =========================================================
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

    // Показываем загрузку, пока рисуем QR
    if (el.qrCodeContainer) {
      el.qrCodeContainer.innerHTML = `
        <div class="qr-frame__loading">
          <div class="spinner-qr"></div>
          Генерируем QR...
        </div>`;
    }

    // Прячем модалку выбора способа и открываем QR
    if (el.paymentModal && !el.paymentModal.hidden) {
      el.paymentModal.hidden = true;
    }
    openModal(el.qrPaymentModal);

    // Генерируем QR-код (с небольшой задержкой, чтобы библиотека успела загрузиться)
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
      const bizName = profile?.displayName || profile?.email || 'КУТ: БИЗНЕС';

      const payload = JSON.stringify({
        t: 'kut_pay',
        b: bizName,
        bid: bizId,
        a: Number(total) || 0,
        c: 'KGS',
        ts: Date.now(),
      });

      const qr = window.qrcode(0, 'M');
      qr.addData(payload);
      qr.make();

      const svg = qr.createSvgTag({
        cellSize: 6,
        margin: 8,
        scalable: true,
      });

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
    // Сбрасываем выбранный способ оплаты (продажа ещё не проведена)
    state.paymentMethod = null;
    if (el.qrCodeContainer) el.qrCodeContainer.innerHTML = '';
  }

  // =========================================================
  // ЗАВЕРШЕНИЕ ПРОДАЖИ
  // =========================================================
  async function confirmPayment() {
    if (state.cart.length === 0) return;
    if (!state.paymentMethod) return;
    if (state.paymentMethod === 'debt' && state.customer.trim().length < 2) return;

    // QR-оплата: перехватываем и открываем модалку с QR-кодом.
    // Транзакция полетит в Firebase только после нажатия «Я получил перевод».
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
    // Продажа улетает в Firebase ТОЛЬКО сейчас — с paymentMethod: 'qr'
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
      customerPhone: '',
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

    // Закрываем все модалки
    if (el.qrPaymentModal && !el.qrPaymentModal.hidden) {
      el.qrPaymentModal.hidden = true;
      document.body.style.overflow = '';
    }
    if (el.paymentModal && !el.paymentModal.hidden) {
      closeModal(el.paymentModal);
    }

    if (el.qrCodeContainer) el.qrCodeContainer.innerHTML = '';

    if (el.successTotal) el.successTotal.textContent = `${fmt(total)} KGS`;
    openModal(el.successModal);

    state.cart = [];
    state.paymentMethod = null;
    state.customer = '';
    renderCart();
    if (el.cart) el.cart.classList.remove('is-open');
  }

  // =========================================================
  // СОБЫТИЯ
  // =========================================================
  function bindEvents() {
    if (el.searchInput) el.searchInput.addEventListener('input', (e) => {
      state.search = e.target.value; renderProducts();
    });
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
      state.customer = e.target.value; updateConfirmState();
    });
    if (el.confirmPayBtn) el.confirmPayBtn.addEventListener('click', confirmPayment);

    // === QR-оплата ===
    if (el.qrConfirmBtn) el.qrConfirmBtn.addEventListener('click', confirmQrPayment);
    if (el.qrCancelBtn) el.qrCancelBtn.addEventListener('click', closeQrPaymentModal);

    if (el.scanBtn) el.scanBtn.addEventListener('click', openScanner);

    document.addEventListener('click', (e) => {
      // Закрытие QR-модалки по клику на фон
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

    window.addEventListener('beforeunload', () => {
      if (state.unsubProducts) state.unsubProducts();
    });
  }

  // =========================================================
  // ИНИЦИАЛИЗАЦИЯ
  // =========================================================
  async function init() {
    const st = await waitForReady();
    if (!st) { console.warn('[cash] Не дождались businessId'); return; }
    state.unsubProducts = window.FB.subscribeCollection('products', (items) => {
      state.products = items.map(stockToCashProduct);
      renderCategories();
      renderProducts();
    });
    renderCategories();
    renderProducts();
    renderCart();
    bindEvents();
    console.info('[cash] Касса подключена · бизнес:', st.businessId, '· QR-оплата активна');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
