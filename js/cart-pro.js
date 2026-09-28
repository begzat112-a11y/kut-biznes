/* =========================================================
   КУТ: БИЗНЕС — Премиум-корзина (cart-pro.js) · v1.0
   
   Square-style Register UX:
   • Numpad для открытой цены (продать что-то без штрихкода)
   • Скидки: % и фикс, на позицию И на весь чек
   • Split payment: несколько методов оплаты в один чек
   • Автоматический расчёт сдачи / остатка
   • localStorage persistence (переживает перезагрузку)
   • Keyboard shortcuts: F2 поиск, Enter оплата, Esc отмена
   • Публичное API: window.KUT_CART
   ========================================================= */

(function () {
  'use strict';

  const LS_KEY = 'kut_cart_pro_v1';
  const MAX_QTY = 99999;
  const EPS = 0.01;

  const state = {
    items: [],        // [{id, name, price, costPrice, unit, qty, discount, note, isOpenPrice}]
    discount: null,   // {type:'percent'|'fixed', value:Number}
    payments: [],     // [{method:'cash'|'card'|'wallet'|'qr'|'debt', amount:Number, ts}]
    customer: null,   // {name, phone}
    note: '',
    mode: 'sale',     // 'sale' | 'refund'
    cashier: null,
  };

  const $ = (s) => document.querySelector(s);
  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg, err) {
    if (window.KUT?.toast) window.KUT.toast(msg, err);
    else console.log('[cart-pro]', msg);
  }

  // =========================================================
  // РАСЧЁТЫ
  // =========================================================
  function lineSubtotal(it) {
    return Number(it.price) * Number(it.qty);
  }
  function lineDiscount(it) {
    if (!it.discount) return 0;
    const sub = lineSubtotal(it);
    if (it.discount.type === 'percent')
      return Math.min(sub, sub * (Number(it.discount.value) / 100));
    return Math.min(sub, Number(it.discount.value));
  }
  function lineTotal(it) {
    return Math.max(0, lineSubtotal(it) - lineDiscount(it));
  }
  function cartSubtotal() {
    return state.items.reduce((s, i) => s + lineSubtotal(i), 0);
  }
  function cartLineDiscounts() {
    return state.items.reduce((s, i) => s + lineDiscount(i), 0);
  }
  function cartGlobalDiscount() {
    if (!state.discount) return 0;
    const base = cartSubtotal() - cartLineDiscounts();
    if (state.discount.type === 'percent')
      return Math.min(base, base * (Number(state.discount.value) / 100));
    return Math.min(base, Number(state.discount.value));
  }
  function cartDiscountTotal() {
    return cartLineDiscounts() + cartGlobalDiscount();
  }
  function cartTotal() {
    return Math.max(0, cartSubtotal() - cartDiscountTotal());
  }
  function cartCost() {
    return state.items.reduce(
      (s, i) => s + Number(i.costPrice || 0) * Number(i.qty), 0);
  }
  function cartProfit() {
    return cartTotal() - cartCost();
  }
  function paidAmount() {
    return state.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  }
  function remainingAmount() {
    return Math.max(0, cartTotal() - paidAmount());
  }
  function changeAmount() {
    return Math.max(0, paidAmount() - cartTotal());
  }
  function isFullyPaid() {
    return remainingAmount() < EPS;
  }

  // =========================================================
  // LOCALSTORAGE
  // =========================================================
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        items: state.items,
        discount: state.discount,
        payments: state.payments,
        customer: state.customer,
        note: state.note,
        mode: state.mode,
      }));
    } catch (_) {}
  }
  function restore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.items = Array.isArray(data.items) ? data.items : [];
      state.discount = data.discount || null;
      state.payments = Array.isArray(data.payments) ? data.payments : [];
      state.customer = data.customer || null;
      state.note = data.note || '';
      state.mode = data.mode === 'refund' ? 'refund' : 'sale';
    } catch (_) {}
  }
  function wipe() {
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
    state.items = [];
    state.discount = null;
    state.payments = [];
    state.customer = null;
    state.note = '';
    state.mode = 'sale';
  }

  // =========================================================
  // ОПЕРАЦИИ С КОРЗИНОЙ
  // =========================================================
  function addItem(product, qty) {
    qty = Math.max(1, Number(qty) || 1);
    const existing = state.items.find((i) => i.id === product.id);
    if (existing) {
      existing.qty = Math.min(MAX_QTY, existing.qty + qty);
    } else {
      state.items.push({
        id: String(product.id),
        name: String(product.name || ''),
        price: Number(product.price) || 0,
        costPrice: Number(product.costPrice) || 0,
        unit: product.unit || 'шт',
        qty,
        discount: null,
        note: '',
        isOpenPrice: false,
      });
    }
    save();
    render();
    pulseCount();
  }

  function addOpenPriceItem(name, price, qty) {
    state.items.push({
      id: 'open_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: String(name || 'Открытая цена').slice(0, 80),
      price: Math.max(0, Number(price) || 0),
      costPrice: 0,
      unit: 'шт',
      qty: Math.max(1, Number(qty) || 1),
      discount: null,
      note: '',
      isOpenPrice: true,
    });
    save();
    render();
  }

  function changeQty(id, delta) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return;
    it.qty = Math.max(0, Math.min(MAX_QTY, it.qty + delta));
    if (it.qty === 0) state.items = state.items.filter((x) => x.id !== id);
    save();
    render();
  }

  function setQty(id, qty) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return;
    it.qty = Math.max(0, Math.min(MAX_QTY, Number(qty) || 0));
    if (it.qty === 0) state.items = state.items.filter((x) => x.id !== id);
    save();
    render();
  }

  function removeItem(id) {
    state.items = state.items.filter((x) => x.id !== id);
    save();
    render();
  }

  function setItemDiscount(id, discount) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return;
    it.discount = discount;
    save();
    render();
  }

  function setItemNote(id, note) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return;
    it.note = String(note || '').slice(0, 120);
    save();
    render();
  }

  function setCartDiscount(discount) {
    state.discount = discount;
    save();
    render();
  }

  function setCustomer(customer) {
    state.customer = customer;
    save();
    render();
  }

  function setMode(mode) {
    state.mode = mode === 'refund' ? 'refund' : 'sale';
    save();
    render();
  }

  function clearCart() {
    wipe();
    render();
  }

  // =========================================================
  // NUMPAD (универсальный: цена / количество / скидка)
  // =========================================================
  function openNumpad({ title, value = '0', allowDecimal = true, onConfirm }) {
    const existing = document.getElementById('kutNumpadModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'kutNumpadModal';
    modal.className = 'kut-numpad-modal';
    modal.innerHTML = `
      <div class="kut-numpad-backdrop"></div>
      <div class="kut-numpad" role="dialog" aria-modal="true">
        <div class="kut-numpad__title">${esc(title)}</div>
        <div class="kut-numpad__display" id="kutNumpadDisplay">${esc(String(value))}</div>
        <div class="kut-numpad__grid">
          ${[1,2,3,4,5,6,7,8,9, allowDecimal ? '.' : '', 0, '⌫']
            .map((k) => k === '' ? '<div></div>' :
              `<button class="kut-numpad__key" data-key="${k}">${k}</button>`).join('')}
        </div>
        <div class="kut-numpad__actions">
          <button class="kut-numpad__cancel" type="button">Отмена</button>
          <button class="kut-numpad__confirm" type="button">Готово</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    let buf = String(value || '0').replace(',', '.');
    const display = modal.querySelector('#kutNumpadDisplay');
    const update = () => { display.textContent = buf; };

    modal.querySelectorAll('.kut-numpad__key').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.key;
        if (k === '⌫') buf = buf.slice(0, -1) || '0';
        else if (k === '.') { if (!buf.includes('.') && allowDecimal) buf += '.'; }
        else {
          if (buf === '0') buf = k;
          else if (buf.length < 12) buf += k;
        }
        update();
      });
    });

    const close = () => {
      modal.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
    const confirm = () => {
      const num = Number(buf) || 0;
      close();
      onConfirm(num);
    };

    modal.querySelector('.kut-numpad-backdrop').addEventListener('click', close);
    modal.querySelector('.kut-numpad__cancel').addEventListener('click', close);
    modal.querySelector('.kut-numpad__confirm').addEventListener('click', confirm);

    const onKey = (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Enter') { e.preventDefault(); confirm(); return; }
      if (/^[0-9]$/.test(e.key)) {
        if (buf === '0') buf = e.key;
        else if (buf.length < 12) buf += e.key;
        update();
      } else if (e.key === '.' && allowDecimal && !buf.includes('.')) {
        buf += '.'; update();
      } else if (e.key === 'Backspace') {
        buf = buf.slice(0, -1) || '0'; update(); e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
  }

  // =========================================================
  // МОДАЛКА СКИДКИ
  // =========================================================
  function openDiscountModal({ target = 'cart', itemId = null } = {}) {
    const existing = document.getElementById('kutDiscountModal');
    if (existing) existing.remove();

    const current = target === 'item'
      ? state.items.find((x) => x.id === itemId)?.discount
      : state.discount;

    const modal = document.createElement('div');
    modal.id = 'kutDiscountModal';
    modal.className = 'kut-discount-modal';
    modal.innerHTML = `
      <div class="kut-discount-backdrop"></div>
      <div class="kut-discount" role="dialog" aria-modal="true">
        <h3 class="kut-discount__title">Скидка${target === 'item' ? ' на позицию' : ' на чек'}</h3>
        <div class="kut-discount__tabs">
          <button class="kut-discount__tab ${(!current || current.type === 'percent') ? 'is-active' : ''}" data-type="percent">Проценты %</button>
          <button class="kut-discount__tab ${current && current.type === 'fixed' ? 'is-active' : ''}" data-type="fixed">Сумма KGS</button>
        </div>
        <input type="number" inputmode="decimal" class="kut-discount__input"
               id="kutDiscountInput" placeholder="0" step="0.01" min="0"
               value="${current ? current.value : ''}">
        <div class="kut-discount__quick">
          ${[5, 10, 15, 20, 25, 50].map((v) =>
            `<button class="kut-discount__chip" type="button" data-quick="${v}">${v}%</button>`).join('')}
        </div>
        <div class="kut-discount__actions">
          <button class="kut-discount__clear" type="button">Убрать</button>
          <button class="kut-discount__save" type="button">Применить</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    let type = current?.type || 'percent';
    const input = modal.querySelector('#kutDiscountInput');

    modal.querySelectorAll('.kut-discount__tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        type = tab.dataset.type;
        modal.querySelectorAll('.kut-discount__tab').forEach((t) =>
          t.classList.toggle('is-active', t === tab));
      });
    });

    modal.querySelectorAll('.kut-discount__chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.quick;
        type = 'percent';
        modal.querySelectorAll('.kut-discount__tab').forEach((t) =>
          t.classList.toggle('is-active', t.dataset.type === 'percent'));
      });
    });

    const close = () => {
      modal.remove();
      document.body.style.overflow = '';
    };
    const apply = (discount) => {
      if (target === 'item') setItemDiscount(itemId, discount);
      else setCartDiscount(discount);
      close();
    };

    modal.querySelector('.kut-discount-backdrop').addEventListener('click', close);
    modal.querySelector('.kut-discount__clear').addEventListener('click', () => apply(null));
    modal.querySelector('.kut-discount__save').addEventListener('click', () => {
      const val = Number(input.value) || 0;
      if (val <= 0) { apply(null); return; }
      if (type === 'percent' && val > 100) {
        toast('Скидка не может быть больше 100%', true); return;
      }
      apply({ type, value: val });
    });

    setTimeout(() => input.focus(), 100);
  }

  // =========================================================
  // МОДАЛКА SPLIT PAYMENT
  // =========================================================
  const PAYMENT_METHODS = [
    { id: 'cash',   label: 'Наличные',     icon: '💵' },
    { id: 'card',   label: 'Карта',        icon: '💳' },
    { id: 'wallet', label: 'MBANK/Элсом',  icon: '📱' },
    { id: 'qr',     label: 'QR-код',       icon: '🔳' },
    { id: 'debt',   label: 'В долг',       icon: '📝' },
  ];

  function openPaymentModal() {
    if (state.items.length === 0) { toast('Корзина пуста', true); return; }

    const existing = document.getElementById('kutPaymentModalPro');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'kutPaymentModalPro';
    modal.className = 'kut-pay-modal';
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    renderPayModal(modal);
  }

  function renderPayModal(modal) {
    const total = cartTotal();
    const paid = paidAmount();
    const remain = remainingAmount();
    const change = changeAmount();

    modal.innerHTML = `
      <div class="kut-pay-backdrop"></div>
      <div class="kut-pay" role="dialog" aria-modal="true">
        <div class="kut-pay__head">
          <h3>Оплата</h3>
          <button class="kut-pay__close" type="button" aria-label="Закрыть">✕</button>
        </div>

        <div class="kut-pay__summary">
          <div class="kut-pay__row"><span>К оплате</span><strong>${fmt(total)} KGS</strong></div>
          ${paid > 0 ? `<div class="kut-pay__row"><span>Внесено</span><strong>${fmt(paid)} KGS</strong></div>` : ''}
          ${remain > 0 && paid > 0 ? `<div class="kut-pay__row kut-pay__row--warn"><span>Осталось</span><strong>${fmt(remain)} KGS</strong></div>` : ''}
          ${change > 0 ? `<div class="kut-pay__row kut-pay__row--ok"><span>Сдача</span><strong>${fmt(change)} KGS</strong></div>` : ''}
        </div>

        ${state.payments.length > 0 ? `
          <div class="kut-payments-list">
            ${state.payments.map((p, i) => `
              <div class="kut-payment-row">
                <span class="kut-payment-row__method">${esc(PAYMENT_METHODS.find(m => m.id === p.method)?.label || p.method)}</span>
                <span class="kut-payment-row__amount">${fmt(p.amount)} KGS</span>
                <button class="kut-payment-row__del" data-del="${i}" aria-label="Убрать">×</button>
              </div>`).join('')}
          </div>` : ''}

        <div class="kut-pay__methods">
          ${PAYMENT_METHODS.map((m) => `
            <button class="kut-pay__method" data-method="${m.id}">
              <span class="kut-pay__method-icon">${m.icon}</span>
              <span class="kut-pay__method-label">${m.label}</span>
            </button>`).join('')}
        </div>

        <div class="kut-pay__actions">
          <button class="kut-pay__cancel" type="button">Отмена</button>
          <button class="kut-pay__confirm" type="button" ${isFullyPaid() ? '' : 'disabled'}>
            ${isFullyPaid() ? '✓ Завершить продажу' : 'Внесите оплату'}
          </button>
        </div>
      </div>
    `;

    const close = () => {
      modal.remove();
      document.body.style.overflow = '';
    };

    modal.querySelector('.kut-pay-backdrop').addEventListener('click', close);
    modal.querySelector('.kut-pay__close').addEventListener('click', close);
    modal.querySelector('.kut-pay__cancel').addEventListener('click', close);

    modal.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.payments.splice(Number(btn.dataset.del), 1);
        save();
        renderPayModal(modal);
      });
    });

    modal.querySelectorAll('.kut-pay__method').forEach((btn) => {
      btn.addEventListener('click', () => {
        const method = btn.dataset.method;
        const remain = remainingAmount();
        const amount = remain > 0 ? remain : cartTotal();
        openNumpad({
          title: PAYMENT_METHODS.find((m) => m.id === method)?.label || 'Оплата',
          value: String(amount.toFixed(2)),
          allowDecimal: true,
          onConfirm: (val) => {
            if (val <= 0) return;
            state.payments.push({ method, amount: val, ts: Date.now() });
            save();
            renderPayModal(modal);
          },
        });
      });
    });

    modal.querySelector('.kut-pay__confirm').addEventListener('click', async () => {
      if (!isFullyPaid()) return;
      await finalizeSale();
      close();
    });
  }

  // =========================================================
  // ФИНАЛИЗАЦИЯ ПРОДАЖИ (Firestore batch)
  // =========================================================
  async function finalizeSale() {
    if (state.items.length === 0) return { ok: false, error: 'empty_cart' };
    if (!isFullyPaid()) return { ok: false, error: 'not_paid' };

    const st = window.KUT?.getState?.();
    const bizId = window.FB?.getWriteBusinessId?.();
    if (!bizId) { toast('Нет привязанного бизнеса', true); return { ok: false, error: 'no_business' }; }

    // Проверка остатков (кроме open price)
    for (const it of state.items) {
      if (it.isOpenPrice) continue;
      const p = (st.products || []).find((x) => x.id === it.id);
      if (!p) return { ok: false, error: 'product_missing', item: it };
      if (Number(p.qty) < it.qty) {
        toast(`Недостаточно «${p.name}»: осталось ${p.qty} ${p.unit}`, true);
        return { ok: false, error: 'insufficient' };
      }
    }

    const { db, collection, doc, writeBatch, serverTimestamp } = window.FB;
    const profile = st.profile || {};
    const batch = writeBatch(db);

    const saleRef = doc(collection(db, 'businesses', bizId, 'sales'));
    const saleItems = state.items.map((it) => ({
      productId: it.id,
      id: it.id,
      name: it.name,
      price: Number(it.price),
      costPrice: Number(it.costPrice) || 0,
      unit: it.unit || 'шт',
      quantity: Number(it.qty),
      qty: Number(it.qty),
      discount: it.discount || null,
      lineTotal: lineTotal(it),
      note: it.note || '',
      isOpenPrice: Boolean(it.isOpenPrice),
    }));

    batch.set(saleRef, {
      items: saleItems,
      subtotal: cartSubtotal(),
      discountAmount: cartDiscountTotal(),
      discount: state.discount || null,
      total: cartTotal(),
      totalSum: cartTotal(),
      costTotal: cartCost(),
      profit: cartProfit(),
      payments: state.payments.map((p) => ({ method: p.method, amount: p.amount })),
      paymentMethod: state.payments.length === 1 ? state.payments[0].method : 'split',
      customer: state.customer?.name || null,
      customerPhone: state.customer?.phone || null,
      cashierUid: profile.uid || '',
      cashierName: profile.displayName || profile.email || '',
      cashierRole: profile.role || 'cashier',
      mode: state.mode,
      businessId: bizId,
      createdAt: serverTimestamp(),
    });

    // Списание остатков + складской лог
    for (const it of state.items) {
      if (it.isOpenPrice) continue;
      const p = (st.products || []).find((x) => x.id === it.id);
      if (!p) continue;

      const newQty = Math.max(0, Number(p.qty) - it.qty);
      const pRef = doc(db, 'businesses', bizId, 'products', it.id);
      batch.update(pRef, {
        qty: Number(newQty.toFixed(2)),
        businessId: bizId,
        updatedAt: serverTimestamp(),
      });

      const logRef = doc(collection(db, 'businesses', bizId, 'warehouse_logs'));
      batch.set(logRef, {
        actionType: state.mode === 'refund' ? 'in' : 'out',
        reason: state.mode === 'refund' ? 'refund' : 'sale',
        note: state.mode === 'refund' ? 'возврат' : 'продажа',
        saleId: saleRef.id,
        itemName: String(it.name).slice(0, 120),
        quantity: it.qty,
        unit: it.unit || 'шт',
        totalPrice: it.price * it.qty,
        workerName: profile.displayName || 'Кассир',
        businessId: bizId,
        timestamp: serverTimestamp(),
      });
    }

    // Если есть долговая часть — создаём запись в debts
    const debtPay = state.payments.find((p) => p.method === 'debt');
    if (debtPay && state.customer?.name && state.customer?.phone) {
      const debtRef = doc(collection(db, 'businesses', bizId, 'debts'));
      batch.set(debtRef, {
        customerName: state.customer.name,
        customerPhone: window.FB.normalizePhone(state.customer.phone),
        name: state.customer.name,
        phone: window.FB.normalizePhone(state.customer.phone),
        initialAmount: debtPay.amount,
        amount: debtPay.amount,
        date: new Date().toISOString().slice(0, 10),
        dueDate: '',
        note: 'Автоматически из продажи в кассе',
        status: 'active',
        payments: [],
        saleId: saleRef.id,
        source: 'cash',
        cashierUid: profile.uid,
        cashierName: profile.displayName || profile.email || '',
        businessId: bizId,
        createdAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
      const total = cartTotal();
      wipe();
      render();
      if (window.KUT?.toast) toast(`Продажа на ${fmt(total)} KGS проведена ✓`);
      if (window.KUT?.reloadAll) await window.KUT.reloadAll();
      return { ok: true, saleId: saleRef.id };
    } catch (err) {
      console.error('[cart-pro] finalize failed:', err);
      toast('Ошибка сохранения: ' + (err.code || err.message), true);
      return { ok: false, error: 'firestore', message: err.message };
    }
  }

  // =========================================================
  // РЕНДЕР
  // =========================================================
  function pulseCount() {
    const b = document.getElementById('cartCount');
    if (b && b.animate) {
      b.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
        { duration: 220, easing: 'ease-out' });
    }
  }

  function render() {
    const list = document.getElementById('cartItems');
    if (list) {
      if (state.items.length === 0) {
        list.innerHTML = '';
        list.hidden = true;
        const empty = document.getElementById('cartEmpty');
        if (empty) empty.hidden = false;
      } else {
        list.hidden = false;
        const empty = document.getElementById('cartEmpty');
        if (empty) empty.hidden = true;
        list.innerHTML = state.items.map((it) => `
          <div class="cart-item cart-item--pro" data-id="${esc(it.id)}">
            <div class="cart-item__info">
              <div class="cart-item__name">${esc(it.name)}${it.isOpenPrice ? ' <span class="cart-item__open">открытая</span>' : ''}</div>
              <div class="cart-item__meta">${fmt(it.price)} × ${it.qty} ${esc(it.unit)}</div>
              ${it.discount ? `<div class="cart-item__discount">Скидка −${fmt(lineDiscount(it))} KGS</div>` : ''}
              ${it.note ? `<div class="cart-item__note">💬 ${esc(it.note)}</div>` : ''}
              <div class="cart-item__total">${fmt(lineTotal(it))} KGS</div>
            </div>
            <div class="cart-item__controls">
              <button class="qty-btn" data-act="dec" type="button">−</button>
              <button class="qty-value" data-act="edit-qty" type="button">${it.qty}</button>
              <button class="qty-btn" data-act="inc" type="button">+</button>
            </div>
            <div class="cart-item__pro-actions">
              <button class="chip-mini" data-act="discount" type="button" title="Скидка">%</button>
              <button class="chip-mini" data-act="note" type="button" title="Заметка">💬</button>
              <button class="qty-remove" data-act="remove" type="button" aria-label="Удалить">×</button>
            </div>
          </div>
        `).join('');
      }
    }

    const totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.innerHTML = `${fmt(cartTotal())}<small>KGS</small>`;

    const cnt = state.items.reduce((s, i) => s + i.qty, 0);
    const cntEl = document.getElementById('cartCount');
    if (cntEl) cntEl.textContent = cnt;
    const togCnt = document.getElementById('cartToggleCount');
    if (togCnt) togCnt.textContent = cnt;
    const togSum = document.getElementById('cartToggleSum');
    if (togSum) togSum.textContent = `${fmt(cartTotal())} KGS`;

    const checkout = document.getElementById('checkoutBtn');
    if (checkout) checkout.disabled = state.items.length === 0;

    renderTotalsSection();
  }

  function renderTotalsSection() {
    let wrap = document.getElementById('cartProTotals');
    const foot = document.querySelector('.cart__foot');
    if (!foot) return;

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'cartProTotals';
      wrap.className = 'cart__totals';
      foot.insertBefore(wrap, foot.firstChild);
    }

    const rows = [];
    rows.push(`<div class="cart__row"><span>Подытог</span><span>${fmt(cartSubtotal())} KGS</span></div>`);
    if (cartLineDiscounts() > 0)
      rows.push(`<div class="cart__row cart__row--discount"><span>Скидки на позиции</span><span>−${fmt(cartLineDiscounts())} KGS</span></div>`);
    if (state.discount)
      rows.push(`<div class="cart__row cart__row--discount"><span>Скидка на чек ${state.discount.type === 'percent' ? state.discount.value + '%' : ''}</span><span>−${fmt(cartGlobalDiscount())} KGS</span></div>`);
    if (state.payments.length > 0)
      rows.push(`<div class="cart__row"><span>Внесено (${state.payments.length} плат.)</span><span>${fmt(paidAmount())} KGS</span></div>`);

    wrap.innerHTML = rows.join('');
  }

  // =========================================================
  // СОБЫТИЯ
  // =========================================================
  function bindEvents() {
    const list = document.getElementById('cartItems');
    if (list && !list.dataset.proWired) {
      list.dataset.proWired = '1';
      list.addEventListener('click', (e) => {
        const row = e.target.closest('.cart-item');
        if (!row) return;
        const id = row.dataset.id;
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;

        if (act === 'inc') changeQty(id, +1);
        else if (act === 'dec') changeQty(id, -1);
        else if (act === 'remove') removeItem(id);
        else if (act === 'discount') openDiscountModal({ target: 'item', itemId: id });
        else if (act === 'note') {
          const it = state.items.find((x) => x.id === id);
          const note = prompt('Заметка к позиции:', it?.note || '');
          if (note !== null) setItemNote(id, note);
        } else if (act === 'edit-qty') {
          const it = state.items.find((x) => x.id === id);
          openNumpad({
            title: `Количество — ${it?.name || ''}`,
            value: String(it?.qty || 1),
            allowDecimal: false,
            onConfirm: (v) => setQty(id, v),
          });
        }
      });
    }

    // Кнопка "Скидка на чек" — добавляем в шапку корзины если нет
    const cartHead = document.querySelector('.cart__head');
    if (cartHead && !cartHead.querySelector('[data-act="cart-discount"]')) {
      const btn = document.createElement('button');
      btn.className = 'btn-ghost';
      btn.type = 'button';
      btn.dataset.act = 'cart-discount';
      btn.textContent = '% Скидка';
      btn.addEventListener('click', () => openDiscountModal({ target: 'cart' }));
      const clearBtn = cartHead.querySelector('#clearCartBtn');
      if (clearBtn) cartHead.insertBefore(btn, clearBtn);
      else cartHead.appendChild(btn);
    }

    // Кнопка "Открытая цена" — добавим рядом с поиском
    const searchWrap = document.querySelector('.search');
    if (searchWrap && !document.getElementById('openPriceBtn')) {
      const btn = document.createElement('button');
      btn.id = 'openPriceBtn';
      btn.className = 'btn-open-price';
      btn.type = 'button';
      btn.innerHTML = '＋ Открытая цена';
      btn.addEventListener('click', () => {
        openNumpad({
          title: 'Открытая цена — сумма',
          value: '0',
          allowDecimal: true,
          onConfirm: (price) => {
            if (price <= 0) return;
            const name = prompt('Название позиции:', 'Товар') || 'Товар';
            addOpenPriceItem(name, price, 1);
          },
        });
      });
      searchWrap.parentElement.insertBefore(btn, searchWrap.nextSibling);
    }

    // Checkout ведёт в модалку оплаты
    const checkout = document.getElementById('checkoutBtn');
    if (checkout && !checkout.dataset.proWired) {
      checkout.dataset.proWired = '1';
      // Отвязываем старый обработчик, ставим наш
      checkout.replaceWith(checkout.cloneNode(true));
      const fresh = document.getElementById('checkoutBtn');
      fresh.addEventListener('click', openPaymentModal);
    }

    // Keyboard
    if (!window.__kutCartKeysBound) {
      window.__kutCartKeysBound = true;
      document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.key === 'F2') {
          e.preventDefault();
          document.getElementById('searchInput')?.focus();
        }
      });
    }
  }

  // =========================================================
  // СТИЛИ
  // =========================================================
  function injectStyles() {
    if (document.getElementById('cart-pro-styles')) return;
    const style = document.createElement('style');
    style.id = 'cart-pro-styles';
    style.textContent = `
      .cart-item--pro { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; padding: 12px; border-radius: 14px; }
      .cart-item__open { font-size: 10px; padding: 2px 6px; border-radius: 6px; background: rgba(212,175,55,.18); color: #E4C56A; margin-left: 6px; font-weight: 700; }
      .cart-item__discount { color: #F87171; font-size: 12px; font-weight: 700; margin-top: 2px; }
      .cart-item__note { color: var(--kut-text-3, #94A3B8); font-size: 11px; font-style: italic; margin-top: 2px; }
      .cart-item__pro-actions { display: flex; flex-direction: column; gap: 4px; }
      .chip-mini { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--kut-border, rgba(255,255,255,.08)); background: var(--kut-surface-2, #273449); color: var(--kut-text-2, #94A3B8); border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent; }
      .chip-mini:hover { background: var(--kut-gold-bg, rgba(212,175,55,.1)); color: var(--kut-gold-deep, #E4C56A); }
      .cart__totals { padding: 10px 16px 4px; display: flex; flex-direction: column; gap: 4px; }
      .cart__row { display: flex; justify-content: space-between; font-size: 13px; color: var(--kut-text-2, #94A3B8); }
      .cart__row--discount { color: #F87171; font-weight: 700; }
      .btn-open-price { margin: 10px 0; width: 100%; padding: 12px 14px; background: transparent; color: var(--kut-gold-deep, #E4C56A); border: 1.5px dashed var(--kut-gold-border, rgba(212,175,55,.4)); border-radius: 12px; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .btn-open-price:active { transform: scale(.98); }

      /* NUMPAD */
      .kut-numpad-modal { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 16px; }
      .kut-numpad-backdrop { position: absolute; inset: 0; background: rgba(2,8,18,.7); backdrop-filter: blur(8px); }
      .kut-numpad { position: relative; width: 100%; max-width: 360px; padding: 20px; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55); color: var(--kut-text-1, #F1F5F9); }
      .kut-numpad__title { font-size: 14px; color: var(--kut-text-2, #94A3B8); margin-bottom: 12px; text-align: center; }
      .kut-numpad__display { font-size: 38px; font-weight: 800; text-align: right; color: var(--kut-money, #10B981); padding: 16px 18px; margin-bottom: 16px; background: var(--kut-surface-2, #273449); border-radius: 14px; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; letter-spacing: -.5px; }
      .kut-numpad__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .kut-numpad__key { padding: 16px 0; font-size: 20px; font-weight: 700; background: var(--kut-surface-2, #273449); color: var(--kut-text-1, #F1F5F9); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 12px; cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent; transition: transform .1s, background .15s; }
      .kut-numpad__key:active { transform: scale(.94); background: rgba(212,175,55,.15); }
      .kut-numpad__actions { display: flex; gap: 8px; margin-top: 16px; }
      .kut-numpad__actions button { flex: 1; padding: 14px; border-radius: 12px; border: none; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-numpad__cancel { background: var(--kut-surface-2, #273449); color: var(--kut-text-1, #F1F5F9); }
      .kut-numpad__confirm { background: linear-gradient(135deg, #10B981, #059669); color: #fff; }

      /* DISCOUNT */
      .kut-discount-modal { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 16px; }
      .kut-discount-backdrop { position: absolute; inset: 0; background: rgba(2,8,18,.7); backdrop-filter: blur(8px); }
      .kut-discount { position: relative; width: 100%; max-width: 380px; padding: 22px; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55); color: var(--kut-text-1, #F1F5F9); }
      .kut-discount__title { margin: 0 0 16px; font-size: 17px; font-weight: 800; text-align: center; }
      .kut-discount__tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 5px; background: var(--kut-surface-2, #273449); border-radius: 12px; margin-bottom: 14px; }
      .kut-discount__tab { padding: 10px; border: none; background: transparent; border-radius: 9px; font-family: inherit; font-size: 13px; font-weight: 700; color: var(--kut-text-2, #94A3B8); cursor: pointer; }
      .kut-discount__tab.is-active { background: var(--kut-gold-gradient, linear-gradient(135deg,#E7C14A,#B88F1D)); color: #06150F; }
      .kut-discount__input { width: 100%; height: 56px; padding: 0 18px; font-size: 24px; font-weight: 800; text-align: center; background: var(--kut-surface-2, #273449); border: 1.5px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 14px; color: var(--kut-money, #10B981); outline: none; font-family: inherit; -webkit-appearance: none; font-variant-numeric: tabular-nums; }
      .kut-discount__input:focus { border-color: var(--kut-gold, #E4C56A); }
      .kut-discount__quick { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
      .kut-discount__chip { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--kut-border, rgba(255,255,255,.1)); background: var(--kut-surface-2, #273449); color: var(--kut-text-1, #F1F5F9); font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-discount__chip:hover { border-color: var(--kut-gold, #E4C56A); color: var(--kut-gold-deep, #E4C56A); }
      .kut-discount__actions { display: flex; gap: 8px; margin-top: 14px; }
      .kut-discount__actions button { flex: 1; padding: 14px; border-radius: 12px; border: none; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-discount__clear { background: var(--kut-surface-2, #273449); color: #F87171; }
      .kut-discount__save { background: linear-gradient(135deg, #10B981, #059669); color: #fff; }

      /* PAYMENT */
      .kut-pay-modal { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 12px; }
      .kut-pay-backdrop { position: absolute; inset: 0; background: rgba(2,8,18,.75); backdrop-filter: blur(8px); }
      .kut-pay { position: relative; width: 100%; max-width: 460px; max-height: 96dvh; overflow-y: auto; padding: 20px; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55); color: var(--kut-text-1, #F1F5F9); }
      .kut-pay__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
      .kut-pay__head h3 { margin: 0; font-size: 19px; font-weight: 800; }
      .kut-pay__close { width: 36px; height: 36px; display: grid; place-items: center; background: var(--kut-surface-2, #273449); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 10px; color: var(--kut-text-2, #94A3B8); cursor: pointer; font-size: 16px; }
      .kut-pay__summary { padding: 14px 16px; background: var(--kut-surface-2, #273449); border-radius: 14px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 8px; }
      .kut-pay__row { display: flex; justify-content: space-between; font-size: 14px; color: var(--kut-text-2, #94A3B8); }
      .kut-pay__row strong { color: var(--kut-text-1, #F1F5F9); font-variant-numeric: tabular-nums; font-size: 15px; }
      .kut-pay__row--warn strong { color: #FBBF24; }
      .kut-pay__row--ok strong { color: #34D399; font-size: 18px; font-weight: 800; }
      .kut-payments-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
      .kut-payment-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px; background: var(--kut-surface-2, #273449); border-radius: 10px; font-size: 13px; }
      .kut-payment-row__method { font-weight: 700; }
      .kut-payment-row__amount { color: var(--kut-money, #10B981); font-weight: 700; font-variant-numeric: tabular-nums; }
      .kut-payment-row__del { background: none; border: none; color: #F87171; cursor: pointer; font-size: 20px; padding: 0 6px; font-family: inherit; }
      .kut-pay__methods { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px; }
      .kut-pay__method { padding: 14px 10px; background: var(--kut-surface-2, #273449); border: 1.5px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 14px; color: var(--kut-text-1, #F1F5F9); font-family: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 4px; align-items: center; -webkit-tap-highlight-color: transparent; transition: border-color .15s, background .15s; }
      .kut-pay__method:hover { border-color: var(--kut-gold, #E4C56A); background: rgba(212,175,55,.08); }
      .kut-pay__method:active { transform: scale(.97); }
      .kut-pay__method-icon { font-size: 22px; }
      .kut-pay__method-label { font-size: 12px; font-weight: 700; }
      .kut-pay__actions { display: flex; gap: 10px; }
      .kut-pay__actions button { flex: 1; padding: 15px; border-radius: 14px; border: none; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-pay__cancel { background: var(--kut-surface-2, #273449); color: var(--kut-text-1, #F1F5F9); }
      .kut-pay__confirm { background: linear-gradient(135deg, #10B981, #059669); color: #fff; }
      .kut-pay__confirm:disabled { background: var(--kut-surface-2, #273449); color: var(--kut-text-3, #64748B); cursor: not-allowed; }

      @media (max-width: 480px) {
        .kut-pay__methods { grid-template-columns: 1fr 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  // =========================================================
  // ПУБЛИЧНОЕ API
  // =========================================================
  window.KUT_CART = {
    // Операции
    addItem, addOpenPriceItem, changeQty, setQty, removeItem,
    setItemDiscount, setItemNote, setCartDiscount, setCustomer, setMode,
    clearCart,
    // Платежи
    addPayment: (method, amount) => { state.payments.push({ method, amount, ts: Date.now() }); save(); render(); },
    removePayment: (i) => { state.payments.splice(i, 1); save(); render(); },
    // Расчёты
    cartTotal, cartSubtotal, cartCost, cartProfit, cartDiscountTotal,
    paidAmount, remainingAmount, changeAmount, isFullyPaid,
    // Процесс
    finalizeSale, openNumpad, openDiscountModal, openPaymentModal,
    // Управление
    getState: () => state,
    render, save, restore,
  };

  // =========================================================
  // BOOT
  // =========================================================
  function boot() {
    injectStyles();
    restore();
    bindEvents();
    render();
    console.info('[cart-pro v1.0] Square-style register готов');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
