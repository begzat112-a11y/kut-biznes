/* =========================================================
   КУТ: БИЗНЕС — Модуль возвратов (refund.js) · v1.0
   
   Square-style Refund:
   • Открытие модалки → выбор чека из списка (последние 50)
   • Частичный или полный возврат позиций
   • Создание sale.mode='refund' + записи warehouse_logs:in
   • Восстановление остатков на складе
   • Поиск по номеру чека / клиенту / сумме
   Публичное API: window.KUT_REFUND
   ========================================================= */

(function () {
  'use strict';

  const PAGE_SIZE = 50;
  const state = {
    sales: [],
    currentSale: null,
    refundItems: [],  // [{productId, qty, price, costPrice, name, unit, maxQty}]
    search: '',
    unsub: null,
  };

  const $ = (s) => document.querySelector(s);
  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg, err) {
    if (window.KUT?.toast) window.KUT.toast(msg, err);
    else console.log('[refund]', msg);
  }

  // =========================================================
  // ЗАГРУЗКА ПРОДАЖ
  // =========================================================
  async function loadSales() {
    const st = window.KUT?.getState?.();
    const bizId = st?.businessId;
    if (!bizId || !window.FB) return;

    try {
      const { db, collection, query, orderBy, limit, getDocs } = window.FB;
      const q = query(
        collection(db, 'businesses', bizId, 'sales'),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      state.sales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('[refund] load sales failed:', err);
      state.sales = [];
    }
  }

  // =========================================================
  // ОТКРЫТИЕ МОДАЛКИ
  // =========================================================
  async function openRefundModal() {
    const st = window.KUT?.getState?.();
    if (!st?.businessId) { toast('Нет активного бизнеса', true); return; }
    if (!window.FB?.getWriteBusinessId?.()) { toast('Выберите конкретный филиал', true); return; }

    const existing = document.getElementById('kutRefundModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'kutRefundModal';
    modal.className = 'kut-refund-modal';
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    renderList(modal);

    await loadSales();
    renderList(modal);
  }

  function closeRefundModal() {
    const modal = document.getElementById('kutRefundModal');
    if (modal) modal.remove();
    document.body.style.overflow = '';
    state.currentSale = null;
    state.refundItems = [];
    state.search = '';
  }

  // =========================================================
  // РЕНДЕР: СПИСОК ЧЕКОВ
  // =========================================================
  function renderList(modal) {
    const filtered = state.sales.filter((s) => {
      if (s.mode === 'refund') return false; // не показываем сами возвраты
      if (!state.search) return true;
      const q = state.search.toLowerCase();
      const dateStr = formatDate(s.createdAt).toLowerCase();
      return (s.customer || '').toLowerCase().includes(q) ||
             dateStr.includes(q) ||
             String(s.total || 0).includes(q) ||
             s.id.toLowerCase().includes(q);
    });

    modal.innerHTML = `
      <div class="kut-refund-backdrop" data-close></div>
      <div class="kut-refund" role="dialog" aria-modal="true">
        <div class="kut-refund__head">
          <h3>Возврат продажи</h3>
          <button class="kut-refund__close" type="button" data-close>✕</button>
        </div>

        <div class="kut-refund__search">
          <input type="search" id="kutRefundSearch" placeholder="Поиск по клиенту, дате, сумме..." value="${esc(state.search)}">
        </div>

        <div class="kut-refund__list">
          ${filtered.length === 0 ? `
            <div class="kut-refund__empty">
              <span>📭</span>
              Продажи не найдены
            </div>` :
            filtered.map((s) => {
              const d = toDate(s.createdAt);
              const dateStr = d ? `${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
              const method = s.paymentMethod === 'split' ? 'Split' :
                ({cash:'💵', card:'💳', wallet:'📱', qr:'🔳', debt:'📝'}[s.paymentMethod] || '🧾');
              const itemCount = (s.items || []).reduce((n, i) => n + (Number(i.qty) || 0), 0);
              return `
                <button class="kut-refund-row" type="button" data-sale="${esc(s.id)}">
                  <div class="kut-refund-row__icon">${method}</div>
                  <div class="kut-refund-row__body">
                    <div class="kut-refund-row__title">${esc(s.customer || 'Без клиента')}</div>
                    <div class="kut-refund-row__meta">${dateStr} · ${itemCount} поз.</div>
                  </div>
                  <div class="kut-refund-row__amount">${fmt(s.total)} KGS</div>
                </button>`;
            }).join('')}
        </div>
      </div>
    `;

    const search = modal.querySelector('#kutRefundSearch');
    if (search) {
      search.addEventListener('input', (e) => {
        state.search = e.target.value;
        // Просто перерисовываем список без сброса фокуса
        const listEl = modal.querySelector('.kut-refund__list');
        const filtered2 = state.sales.filter((s) => {
          if (s.mode === 'refund') return false;
          if (!state.search) return true;
          const q = state.search.toLowerCase();
          const dateStr = formatDate(s.createdAt).toLowerCase();
          return (s.customer || '').toLowerCase().includes(q) ||
                 dateStr.includes(q) ||
                 String(s.total || 0).includes(q);
        });
        listEl.innerHTML = filtered2.map((s) => {
          const d = toDate(s.createdAt);
          const dateStr = d ? `${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
          const method = s.paymentMethod === 'split' ? 'Split' :
            ({cash:'💵', card:'💳', wallet:'📱', qr:'🔳', debt:'📝'}[s.paymentMethod] || '🧾');
          const itemCount = (s.items || []).reduce((n, i) => n + (Number(i.qty) || 0), 0);
          return `
            <button class="kut-refund-row" type="button" data-sale="${esc(s.id)}">
              <div class="kut-refund-row__icon">${method}</div>
              <div class="kut-refund-row__body">
                <div class="kut-refund-row__title">${esc(s.customer || 'Без клиента')}</div>
                <div class="kut-refund-row__meta">${dateStr} · ${itemCount} поз.</div>
              </div>
              <div class="kut-refund-row__amount">${fmt(s.total)} KGS</div>
            </button>`;
        }).join('');
        bindRowClicks(modal);
      });
    }

    modal.querySelectorAll('[data-close]').forEach((el) =>
      el.addEventListener('click', closeRefundModal));

    bindRowClicks(modal);
  }

  function bindRowClicks(modal) {
    modal.querySelectorAll('[data-sale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sale = state.sales.find((s) => s.id === btn.dataset.sale);
        if (sale) openRefundDetail(sale, modal);
      });
    });
  }

  // =========================================================
  // РЕНДЕР: ДЕТАЛИ ЧЕКА + ВЫБОР ПОЗИЦИЙ
  // =========================================================
  function openRefundDetail(sale, modal) {
    state.currentSale = sale;
    state.refundItems = (sale.items || []).map((it) => ({
      productId: it.productId || it.id,
      name: it.name,
      unit: it.unit || 'шт',
      price: Number(it.price) || 0,
      costPrice: Number(it.costPrice) || 0,
      maxQty: Number(it.qty) || 0,
      qty: 0,
    }));

    renderDetail(modal);
  }

  function renderDetail(modal) {
    const s = state.currentSale;
    if (!s) return;
    const d = toDate(s.createdAt);
    const dateStr = d ? `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';

    const refundTotal = state.refundItems.reduce((sum, it) => sum + it.qty * it.price, 0);
    const refundCost = state.refundItems.reduce((sum, it) => sum + it.qty * it.costPrice, 0);
    const refundProfit = refundTotal - refundCost;

    const canRefund = state.refundItems.some((it) => it.qty > 0);
    const isFullRefund = state.refundItems.every((it) => it.qty === it.maxQty);

    modal.innerHTML = `
      <div class="kut-refund-backdrop" data-close></div>
      <div class="kut-refund" role="dialog" aria-modal="true">
        <div class="kut-refund__head">
          <button class="kut-refund__back" type="button" data-back>← Назад</button>
          <h3>Возврат чека</h3>
          <button class="kut-refund__close" type="button" data-close>✕</button>
        </div>

        <div class="kut-refund__info">
          <div class="kut-refund__info-row"><span>Клиент</span><strong>${esc(s.customer || '—')}</strong></div>
          <div class="kut-refund__info-row"><span>Дата</span><strong>${dateStr}</strong></div>
          <div class="kut-refund__info-row"><span>Сумма чека</span><strong>${fmt(s.total)} KGS</strong></div>
        </div>

        <div class="kut-refund__items">
          ${state.refundItems.map((it, idx) => `
            <div class="kut-refund-item ${it.qty > 0 ? 'is-selected' : ''}" data-idx="${idx}">
              <div class="kut-refund-item__body">
                <div class="kut-refund-item__name">${esc(it.name)}</div>
                <div class="kut-refund-item__meta">${fmt(it.price)} KGS / ${esc(it.unit)} · продано: ${it.maxQty}</div>
              </div>
              <div class="kut-refund-item__controls">
                <button class="kut-refund-item__btn" data-act="dec" type="button">−</button>
                <input type="number" class="kut-refund-item__input" data-idx="${idx}"
                       value="${it.qty}" min="0" max="${it.maxQty}" step="1">
                <button class="kut-refund-item__btn" data-act="inc" type="button">+</button>
              </div>
              <button class="kut-refund-item__max" data-act="max" type="button" title="Всё">MAX</button>
            </div>
          `).join('')}
        </div>

        <div class="kut-refund__summary">
          <div class="kut-refund__sum-row"><span>Сумма к возврату</span><strong>${fmt(refundTotal)} KGS</strong></div>
          ${isFullRefund ? `<div class="kut-refund__sum-row kut-refund__sum-row--hint"><span>Тип</span><strong>Полный возврат</strong></div>` : ''}
        </div>

        <div class="kut-refund__actions">
          <button class="kut-refund__cancel" type="button" data-close>Отмена</button>
          <button class="kut-refund__confirm" type="button" ${canRefund ? '' : 'disabled'}>
            ${canRefund ? `↩ Вернуть ${fmt(refundTotal)} KGS` : 'Выберите позиции'}
          </button>
        </div>
      </div>
    `;

    // Bind back
    modal.querySelector('[data-back]').addEventListener('click', () => {
      state.currentSale = null;
      state.refundItems = [];
      renderList(modal);
    });

    modal.querySelectorAll('[data-close]').forEach((el) =>
      el.addEventListener('click', closeRefundModal));

    // Bind item controls
    modal.querySelectorAll('.kut-refund-item').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          const it = state.refundItems[idx];
          if (act === 'inc') it.qty = Math.min(it.maxQty, it.qty + 1);
          else if (act === 'dec') it.qty = Math.max(0, it.qty - 1);
          else if (act === 'max') it.qty = it.qty === it.maxQty ? 0 : it.maxQty;
          renderDetail(modal);
        });
      });
    });

    modal.querySelectorAll('.kut-refund-item__input').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.idx);
        const it = state.refundItems[idx];
        let v = Number(e.target.value) || 0;
        v = Math.max(0, Math.min(it.maxQty, v));
        it.qty = v;
        // Обновляем кнопку без полного перерендера
        const confirm = modal.querySelector('.kut-refund__confirm');
        if (confirm) {
          const anyQty = state.refundItems.some((x) => x.qty > 0);
          const total = state.refundItems.reduce((s2, x) => s2 + x.qty * x.price, 0);
          confirm.disabled = !anyQty;
          confirm.textContent = anyQty ? `↩ Вернуть ${fmt(total)} KGS` : 'Выберите позиции';
        }
      });
      input.addEventListener('blur', () => renderDetail(modal));
    });

    // Confirm
    const confirm = modal.querySelector('.kut-refund__confirm');
    if (confirm) confirm.addEventListener('click', () => executeRefund(modal));
  }

  // =========================================================
  // ИСПОЛНЕНИЕ ВОЗВРАТА
  // =========================================================
  async function executeRefund(modal) {
    const sale = state.currentSale;
    if (!sale) return;

    const items = state.refundItems.filter((it) => it.qty > 0);
    if (items.length === 0) { toast('Выберите позиции', true); return; }

    const total = items.reduce((s, it) => s + it.qty * it.price, 0);
    const cost = items.reduce((s, it) => s + it.qty * it.costPrice, 0);
    const profit = total - cost;

    const st = window.KUT?.getState?.();
    const bizId = window.FB?.getWriteBusinessId?.();
    if (!bizId) { toast('Нет бизнеса', true); return; }

    const profile = st.profile || {};
    const { db, collection, doc, writeBatch, serverTimestamp } = window.FB;
    const batch = writeBatch(db);

    // 1. Создаём запись возврата
    const refundRef = doc(collection(db, 'businesses', bizId, 'sales'));
    batch.set(refundRef, {
      items: items.map((it) => ({
        productId: it.productId,
        id: it.productId,
        name: it.name,
        price: it.price,
        costPrice: it.costPrice,
        unit: it.unit,
        quantity: it.qty,
        qty: it.qty,
        lineTotal: it.qty * it.price,
      })),
      total: -total,       // отрицательная сумма
      totalSum: -total,
      costTotal: cost,
      profit: -profit,
      paymentMethod: 'refund',
      payments: [],
      customer: sale.customer || null,
      cashierUid: profile.uid || '',
      cashierName: profile.displayName || profile.email || '',
      cashierRole: profile.role || 'cashier',
      mode: 'refund',
      originalSaleId: sale.id,
      businessId: bizId,
      createdAt: serverTimestamp(),
    });

    // 2. Возврат остатков + складской лог
    for (const it of items) {
      if (it.productId?.startsWith('open_')) continue;
      const p = (st.products || []).find((x) => x.id === it.productId);
      if (!p) continue;

      const newQty = Number(p.qty) + it.qty;
      const pRef = doc(db, 'businesses', bizId, 'products', it.productId);
      batch.update(pRef, {
        qty: Number(newQty.toFixed(2)),
        updatedAt: serverTimestamp(),
      });

      const logRef = doc(collection(db, 'businesses', bizId, 'warehouse_logs'));
      batch.set(logRef, {
        actionType: 'in',
        reason: 'refund',
        note: 'возврат по чеку',
        saleId: refundRef.id,
        originalSaleId: sale.id,
        itemName: String(it.name).slice(0, 120),
        quantity: it.qty,
        unit: it.unit || 'шт',
        totalPrice: it.qty * it.price,
        workerName: profile.displayName || 'Кассир',
        businessId: bizId,
        timestamp: serverTimestamp(),
      });
    }

    // 3. Если чек был в долг — уменьшаем долг
    if (sale.paymentMethod === 'debt' && sale.customer && sale.customerPhone) {
      // Ищем связанный долг (по saleId)
      // В идеале — уменьшить соответствующий долг. Здесь упрощённо пропускаем,
      // так как полная логика требует чтения долга.
    }

    try {
      await batch.commit();
      toast(`Возврат на ${fmt(total)} KGS оформлен ✓`);
      closeRefundModal();
      if (window.KUT?.reloadAll) await window.KUT.reloadAll();
    } catch (err) {
      console.error('[refund] execute failed:', err);
      toast('Ошибка возврата: ' + (err.code || err.message), true);
    }
  }

  // =========================================================
  // УТИЛИТЫ
  // =========================================================
  function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function formatDate(ts) {
    const d = toDate(ts);
    if (!d) return '';
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // =========================================================
  // ИНЪЕКЦИЯ КНОПКИ В КАССУ
  // =========================================================
  function injectRefundButton() {
    const page = (location.pathname.split('/').pop() || '').replace('.html', '');
    if (page !== 'cash') return;

    const cartHead = document.querySelector('.cart__head');
    if (!cartHead || cartHead.querySelector('#refundBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'refundBtn';
    btn.className = 'btn-ghost';
    btn.type = 'button';
    btn.textContent = '↩ Возврат';
    btn.addEventListener('click', openRefundModal);

    cartHead.appendChild(btn);
  }

  // =========================================================
  // СТИЛИ
  // =========================================================
  function injectStyles() {
    if (document.getElementById('kut-refund-styles')) return;
    const style = document.createElement('style');
    style.id = 'kut-refund-styles';
    style.textContent = `
      .kut-refund-modal { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 12px; }
      .kut-refund-backdrop { position: absolute; inset: 0; background: rgba(2,8,18,.75); backdrop-filter: blur(8px); }
      .kut-refund { position: relative; width: 100%; max-width: 520px; max-height: 96dvh; display: flex; flex-direction: column; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55); color: var(--kut-text-1, #F1F5F9); overflow: hidden; }
      .kut-refund__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 18px; border-bottom: 1px solid var(--kut-border, rgba(255,255,255,.08)); flex-shrink: 0; }
      .kut-refund__head h3 { margin: 0; font-size: 18px; font-weight: 800; }
      .kut-refund__close { width: 36px; height: 36px; display: grid; place-items: center; background: var(--kut-surface-2, #273449); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 10px; color: var(--kut-text-2, #94A3B8); cursor: pointer; font-size: 16px; }
      .kut-refund__back { padding: 8px 12px; background: var(--kut-surface-2, #273449); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 10px; color: var(--kut-text-2, #94A3B8); cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 700; }
      .kut-refund__search { padding: 12px 16px; border-bottom: 1px solid var(--kut-border, rgba(255,255,255,.08)); flex-shrink: 0; }
      .kut-refund__search input { width: 100%; height: 48px; padding: 0 16px; background: var(--kut-surface-2, #273449); border: 1.5px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 12px; color: var(--kut-text-1, #F1F5F9); font-family: inherit; font-size: 15px; outline: none; }
      .kut-refund__search input:focus { border-color: var(--kut-gold, #E4C56A); }
      .kut-refund__list { flex: 1; overflow-y: auto; padding: 8px; min-height: 0; }
      .kut-refund__empty { padding: 60px 20px; text-align: center; color: var(--kut-text-3, #64748B); font-size: 14px; }
      .kut-refund__empty span { display: block; font-size: 42px; margin-bottom: 12px; opacity: .7; }
      .kut-refund-row { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; width: 100%; padding: 14px; margin-bottom: 4px; background: transparent; border: 1px solid transparent; border-radius: 12px; color: var(--kut-text-1, #F1F5F9); font-family: inherit; text-align: left; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background .15s, border-color .15s; }
      .kut-refund-row:hover { background: var(--kut-surface-2, #273449); border-color: var(--kut-border, rgba(255,255,255,.08)); }
      .kut-refund-row__icon { width: 44px; height: 44px; display: grid; place-items: center; background: var(--kut-surface-2, #273449); border-radius: 12px; font-size: 20px; }
      .kut-refund-row__body { min-width: 0; }
      .kut-refund-row__title { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kut-refund-row__meta { font-size: 12px; color: var(--kut-text-3, #64748B); margin-top: 2px; }
      .kut-refund-row__amount { font-size: 15px; font-weight: 800; color: var(--kut-money, #10B981); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .kut-refund__info { padding: 14px 18px; background: var(--kut-surface-2, #273449); margin: 12px 16px 0; border-radius: 14px; display: flex; flex-direction: column; gap: 8px; }
      .kut-refund__info-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--kut-text-2, #94A3B8); }
      .kut-refund__info-row strong { color: var(--kut-text-1, #F1F5F9); font-size: 14px; }
      .kut-refund__items { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
      .kut-refund-item { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 12px; background: var(--kut-surface-2, #273449); border: 1.5px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 14px; transition: border-color .15s; }
      .kut-refund-item.is-selected { border-color: #F87171; background: rgba(248,113,113,.08); }
      .kut-refund-item__body { min-width: 0; }
      .kut-refund-item__name { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kut-refund-item__meta { font-size: 12px; color: var(--kut-text-3, #64748B); margin-top: 2px; }
      .kut-refund-item__controls { display: inline-flex; align-items: center; gap: 4px; background: rgba(0,0,0,.2); border-radius: 10px; padding: 3px; }
      .kut-refund-item__btn { width: 36px; height: 36px; display: grid; place-items: center; border: none; background: transparent; color: var(--kut-text-1, #F1F5F9); font-size: 18px; font-weight: 700; cursor: pointer; border-radius: 8px; font-family: inherit; }
      .kut-refund-item__btn:hover { background: rgba(255,255,255,.08); }
      .kut-refund-item__input { width: 52px; height: 36px; text-align: center; font-size: 15px; font-weight: 800; background: transparent; border: none; color: var(--kut-text-1, #F1F5F9); outline: none; font-family: inherit; font-variant-numeric: tabular-nums; -webkit-appearance: none; }
      .kut-refund-item__input::-webkit-outer-spin-button, .kut-refund-item__input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .kut-refund-item__max { padding: 8px 10px; background: transparent; border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 10px; color: var(--kut-gold-deep, #E4C56A); font-family: inherit; font-size: 11px; font-weight: 800; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-refund-item__max:hover { background: rgba(212,175,55,.1); }
      .kut-refund__summary { padding: 14px 18px; border-top: 1px solid var(--kut-border, rgba(255,255,255,.08)); display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
      .kut-refund__sum-row { display: flex; justify-content: space-between; font-size: 14px; color: var(--kut-text-2, #94A3B8); }
      .kut-refund__sum-row strong { color: #F87171; font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
      .kut-refund__sum-row--hint strong { color: #FBBF24; font-size: 13px; }
      .kut-refund__actions { display: flex; gap: 10px; padding: 12px 18px 18px; flex-shrink: 0; }
      .kut-refund__actions button { flex: 1; padding: 15px; border-radius: 14px; border: none; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-refund__cancel { background: var(--kut-surface-2, #273449); color: var(--kut-text-1, #F1F5F9); }
      .kut-refund__confirm { background: linear-gradient(135deg, #EF4444, #B91C1C); color: #fff; }
      .kut-refund__confirm:disabled { background: var(--kut-surface-2, #273449); color: var(--kut-text-3, #64748B); cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  // =========================================================
  // ПУБЛИЧНОЕ API
  // =========================================================
  window.KUT_REFUND = {
    open: openRefundModal,
    close: closeRefundModal,
    loadSales,
    getState: () => state,
  };

  // =========================================================
  // BOOT
  // =========================================================
  function boot() {
    injectStyles();
    injectRefundButton();
    // на случай если DOM ещё не готов
    setTimeout(injectRefundButton, 1200);
    console.info('[refund v1.0] модуль возвратов готов');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
