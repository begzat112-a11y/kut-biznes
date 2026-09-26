/* =========================================================
   КУТ: БИЗНЕС — Модуль «Несие / Долги» · v2.0
   Схема Firestore: businesses/{bizId}/debts/{debtId}
   
   Новая схема:
     customerName, customerPhone, totalDebt, updatedAt, history[]
   
   Совместимость (mirror) — читаем и пишем также старые поля:
     name, phone, amount, status, payments[]
   ========================================================= */

(function () {
  'use strict';

  // ===== STATE =====
  const state = {
    debts: [],
    search: '',
    tab: 'active',
    editingId: null,
    deletingId: null,
    detailId: null,
    payingId: null,
    unsub: null,
    isOwner: true,
  };

  // ===== DOM =====
  const $ = (s) => document.querySelector(s);
  const el = {
    openAddBtn:    $('#openAddBtn'),
    emptyAddBtn:   $('#emptyAddBtn'),
    searchInput:   $('#searchInput'),
    statTotal:     $('#statTotal'),
    statCount:     $('#statCount'),
    statOverdue:   $('#statOverdue'),
    tabActive:     $('#tabActive'),
    tabArchive:    $('#tabArchive'),
    tabActiveCount:$('#tabActiveCount'),
    tabArchiveCount:$('#tabArchiveCount'),
    list:          $('#debtsList'),
    empty:         $('#debtsEmpty'),
    emptyTitle:    $('#emptyTitle'),
    emptyText:     $('#emptyText'),

    addModal:      $('#addModal'),
    addForm:       $('#addForm'),
    fName:         $('#fName'),
    fPhone:        $('#fPhone'),
    fAmount:       $('#fAmount'),
    fNote:         $('#fNote'),
    addSaveBtn:    $('#addSaveBtn'),

    detailModal:   $('#detailModal'),
    detailName:    $('#detailName'),
    detailPhone:   $('#detailPhone'),
    detailTotal:   $('#detailTotal'),
    detailHistory: $('#detailHistory'),
    detailTakeBtn: $('#detailTakeBtn'),
    detailPayBtn:  $('#detailPayBtn'),
    detailWaBtn:   $('#detailWaBtn'),
    detailEditBtn: $('#detailEditBtn'),
    detailDelBtn:  $('#detailDelBtn'),

    payModal:      $('#payModal'),
    payTitle:      $('#payTitle'),
    payForm:       $('#payForm'),
    payAmount:     $('#payAmount'),
    payHint:       $('#payHint'),
    paySaveBtn:    $('#paySaveBtn'),
    quickAmounts:  $('#quickAmounts'),

    deleteModal:   $('#deleteModal'),
    deleteName:    $('#deleteName'),
    confirmDeleteBtn:$('#confirmDeleteBtn'),
  };

  // ===== UTILS =====
  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const fmtMoney = (n) => fmt(n) + ' KGS';

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }
  function showToast(msg, isErr) {
    if (window.KUT?.toast) window.KUT.toast(msg, isErr);
    else console.log('[debts]', msg);
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

  function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(ts) {
    const d = toDate(ts); if (!d) return '—';
    const z = (n) => String(n).padStart(2, '0');
    return `${z(d.getDate())}.${z(d.getMonth()+1)}.${d.getFullYear()}`;
  }
  function fmtDateTime(ts) {
    const d = toDate(ts); if (!d) return '—';
    const z = (n) => String(n).padStart(2, '0');
    return `${z(d.getDate())}.${z(d.getMonth()+1)} ${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  function daysAgo(ts) {
    const d = toDate(ts); if (!d) return 0;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function normalizePhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('996')) d = d.slice(3);
    else if (d.startsWith('0')) d = d.slice(1);
    d = d.slice(0, 9);
    return '+996' + d;
  }
  function maskPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('996')) d = d.slice(3);
    else if (d.startsWith('0')) d = d.slice(1);
    d = d.slice(0, 9);
    if (!d) return '';
    let out = '+996 ';
    if (d.length <= 3) return out + d;
    out += d.slice(0,3) + ' ';
    if (d.length <= 6) return out + d.slice(3);
    out += d.slice(3,6) + ' ';
    return out + d.slice(6);
  }
  function isValidPhone(n) { return /^\+996\d{9}$/.test(n); }

  // ===== НОРМАЛИЗАЦИЯ ДОЛГА (поддержка 2 схем) =====
  function normalizeDebt(raw) {
    const id = raw.id;
    const customerName  = String(raw.customerName || raw.name || 'Без имени').trim();
    const customerPhone = String(raw.customerPhone || raw.phone || '');
    const totalDebt = Number(
      raw.totalDebt != null ? raw.totalDebt :
      (raw.amount != null ? raw.amount : 0)
    ) || 0;
    const status = raw.status || (totalDebt <= 0 ? 'paid' : 'active');
    const updatedAt = raw.updatedAt || raw.paidAt || raw.createdAt || raw.date || null;

    // Собираем историю
    let history = [];
    if (Array.isArray(raw.history)) {
      history = raw.history.map((h) => ({
        date: h.date || h.ts || null,
        amount: Number(h.amount) || 0,
        type: h.type === 'pay' ? 'pay' : 'take',
        note: h.note || '',
      }));
    }
    // Дополняем из старых полей, если history пусто
    if (history.length === 0) {
      const initialAmount = Number(raw.initialAmount) || totalDebt;
      if (initialAmount > 0) {
        history.push({
          date: raw.createdAt || raw.date || null,
          amount: initialAmount,
          type: 'take',
          note: raw.note || (raw.source === 'cash' ? 'Из кассы' : ''),
        });
      }
      if (Array.isArray(raw.payments)) {
        raw.payments.forEach((p) => {
          history.push({
            date: p.date || null,
            amount: Number(p.amount) || 0,
            type: 'pay',
            note: '',
          });
        });
      }
    }
    // Сортируем по дате (старые сверху)
    history.sort((a, b) => {
      const ta = toDate(a.date)?.getTime() || 0;
      const tb = toDate(b.date)?.getTime() || 0;
      return ta - tb;
    });

    return {
      id,
      customerName,
      customerPhone,
      totalDebt,
      status,
      updatedAt,
      history,
      _raw: raw,
    };
  }

  function isActive(d) {
    return d.status !== 'paid' && Number(d.totalDebt) > 0;
  }
  function getActiveDebts()  { return state.debts.filter(isActive); }
  function getArchiveDebts() { return state.debts.filter((d) => !isActive(d)); }

  // ===== API: СУММА ВСЕХ ДОЛГОВ =====
  function getTotalDebtsSum() {
    return state.debts.reduce((sum, d) => {
      return isActive(d) ? sum + Number(d.totalDebt || 0) : sum;
    }, 0);
  }
  window.getTotalDebtsSum = getTotalDebtsSum;

  // ===== API: ДОБАВИТЬ ДОЛЖНИКА =====
  async function addNewDebtor(name, phone, amount, note) {
    if (!window.FB || !window.FB.db) return { ok: false, error: 'no_fb' };
    const st = window.KUT?.getState?.() || {};
    const bizId = st.businessId;
    if (!bizId) return { ok: false, error: 'no_business' };

    const cleanName = String(name || '').trim();
    const cleanPhone = normalizePhone(phone);
    const cleanAmount = Number(amount) || 0;
    if (cleanName.length < 2) return { ok: false, error: 'bad_name' };
    if (!isValidPhone(cleanPhone)) return { ok: false, error: 'bad_phone' };
    if (cleanAmount <= 0) return { ok: false, error: 'bad_amount' };

    try {
      const { db, collection, addDoc, serverTimestamp } = window.FB;
      const ref = collection(db, 'businesses', bizId, 'debts');
      const now = new Date();
      const docRef = await addDoc(ref, {
        // Новая схема
        customerName: cleanName,
        customerPhone: cleanPhone,
        totalDebt: cleanAmount,
        history: [
          { date: now, amount: cleanAmount, type: 'take', note: note || '' },
        ],
        // Старая схема (mirror для cash.js / app.js)
        name: cleanName,
        phone: cleanPhone,
        amount: cleanAmount,
        initialAmount: cleanAmount,
        date: now.toISOString().slice(0, 10),
        dueDate: '',
        note: note || '',
        status: 'active',
        payments: [],
        source: 'manual',
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      return { ok: true, id: docRef.id };
    } catch (err) {
      console.error('[debts] addNewDebtor:', err);
      return { ok: false, error: err.code || err.message };
    }
  }
  window.addNewDebtor = addNewDebtor;

  // ===== API: ИЗМЕНИТЬ СУММУ =====
  // type: 'pay' — клиент возвращает (сумма уменьшается)
  //       'take' — берёт ещё товар (сумма увеличивается)
  async function updateDebtAmount(debtorId, changeAmount, type) {
    if (!window.FB || !window.FB.db) return { ok: false, error: 'no_fb' };
    const st = window.KUT?.getState?.() || {};
    const bizId = st.businessId;
    if (!bizId) return { ok: false, error: 'no_business' };

    const debt = state.debts.find((d) => d.id === debtorId);
    if (!debt) return { ok: false, error: 'not_found' };

    const change = Math.abs(Number(changeAmount) || 0);
    if (change <= 0) return { ok: false, error: 'bad_amount' };

    const current = Number(debt.totalDebt) || 0;
    let next;
    if (type === 'pay') {
      next = Math.max(0, current - change);
    } else {
      next = current + change;
    }

    const newHistory = (debt.history || []).concat([{
      date: new Date(),
      amount: change,
      type: type === 'pay' ? 'pay' : 'take',
      note: '',
    }]);

    const newStatus = next <= 0 ? 'paid' : 'active';

    try {
      const { db, doc, updateDoc, serverTimestamp } = window.FB;
      const ref = doc(db, 'businesses', bizId, 'debts', debtorId);
      await updateDoc(ref, {
        // Новая схема
        totalDebt: next,
        history: newHistory,
        status: newStatus,
        updatedAt: serverTimestamp(),
        // Старая схема (mirror)
        amount: next,
        paidAt: newStatus === 'paid' ? serverTimestamp() : null,
      });
      return { ok: true, next };
    } catch (err) {
      console.error('[debts] updateDebtAmount:', err);
      return { ok: false, error: err.code || err.message };
    }
  }
  window.updateDebtAmount = updateDebtAmount;

  // ===== РЕНДЕР =====
  function renderStats() {
    const active = getActiveDebts();
    const total = active.reduce((s, d) => s + d.totalDebt, 0);
    const overdue = active.filter((d) => daysAgo(d.updatedAt) > 30).length;

    if (el.statTotal) el.statTotal.innerHTML = `${fmt(Math.round(total))}<small>KGS</small>`;
    if (el.statCount) el.statCount.innerHTML = `${fmt(active.length)}<small>чел.</small>`;
    if (el.statOverdue) el.statOverdue.innerHTML = `${fmt(overdue)}<small>чел.</small>`;
    if (el.tabActiveCount) el.tabActiveCount.textContent = String(active.length);
    if (el.tabArchiveCount) el.tabArchiveCount.textContent = String(getArchiveDebts().length);
  }

  function renderList() {
    if (!el.list) return;
    const q = state.search.trim().toLowerCase();
    const source = state.tab === 'archive' ? getArchiveDebts() : getActiveDebts();

    const items = source
      .filter((d) => {
        if (!q) return true;
        return d.customerName.toLowerCase().includes(q) ||
               d.customerPhone.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const ta = toDate(a.updatedAt)?.getTime() || 0;
        const tb = toDate(b.updatedAt)?.getTime() || 0;
        return tb - ta;
      });

    if (items.length === 0) {
      el.list.innerHTML = '';
      if (el.empty) {
        el.empty.hidden = false;
        if (el.emptyTitle) el.emptyTitle.textContent =
          state.tab === 'archive' ? 'Архив пуст' : 'Пока долгов нет';
        if (el.emptyText) el.emptyText.textContent =
          state.tab === 'archive'
            ? 'Погашенные долги появятся здесь.'
            : 'Отличная работа — все клиенты расплатились!';
      }
      return;
    }
    if (el.empty) el.empty.hidden = true;

    el.list.innerHTML = items.map((d) => {
      const active = isActive(d);
      const overdue = active && daysAgo(d.updatedAt) > 30;
      const initial = d.history.find((h) => h.type === 'take');
      const total = d.history.filter((h) => h.type === 'take').reduce((s, h) => s + h.amount, 0);
      const isPartial = active && total > 0 && d.totalDebt < total;

      return `
        <div class="debt-card ${active ? '' : 'is-archived'} ${overdue ? 'is-overdue' : ''}"
             data-id="${escapeHtml(d.id)}" role="button" tabindex="0">
          <div class="debt-card__avatar">${escapeHtml(initials(d.customerName))}</div>
          <div class="debt-card__body">
            <div class="debt-card__name">${escapeHtml(d.customerName)}</div>
            <div class="debt-card__meta">
              ${d.customerPhone ? `📞 ${escapeHtml(d.customerPhone)}` : 'Без телефона'}
              ${d.history.length ? ` · ${d.history.length} операц.` : ''}
            </div>
            ${overdue ? '<div class="debt-card__badge">⚠ Просрочен > 30 дней</div>' : ''}
            ${isPartial ? `<div class="debt-card__partial">Погашено из ${fmt(total)} KGS</div>` : ''}
          </div>
          <div class="debt-card__right">
            <div class="debt-card__amount ${active ? '' : 'is-paid'}">
              ${fmt(Math.round(d.totalDebt))}<small>KGS</small>
            </div>
            ${active
              ? '<div class="debt-card__hint">Погасить →</div>'
              : '<div class="debt-card__hint">Погашен</div>'}
          </div>
        </div>`;
    }).join('');
  }

  function initials(name) {
    const p = String(name || '').trim().split(/\s+/);
    if (p.length === 0) return '—';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return ((p[0][0] || '') + (p[1][0] || '')).toUpperCase();
  }

  // ===== МОДАЛКИ =====
  let lastFocused = null;
  function openModal(m) {
    lastFocused = document.activeElement;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal(m) {
    m.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  // ===== ДОБАВЛЕНИЕ ДОЛЖНИКА =====
  function openAddModal() {
    if (!el.addForm) return;
    el.addForm.reset();
    if (el.fName)    el.fName.value = '';
    if (el.fPhone)   el.fPhone.value = '';
    if (el.fAmount)  el.fAmount.value = '';
    if (el.fNote)    el.fNote.value = '';
    clearFieldErrors();
    openModal(el.addModal);
    requestAnimationFrame(() => el.fName && el.fName.focus());
  }

  async function submitAdd(e) {
    e.preventDefault();
    clearFieldErrors();

    const name = el.fName.value.trim();
    const phone = el.fPhone.value;
    const amount = Number(el.fAmount.value);
    const note = el.fNote.value.trim();

    let ok = true;
    if (name.length < 2) { setErr('fName', 'Минимум 2 символа'); ok = false; }
    if (!isValidPhone(normalizePhone(phone))) { setErr('fPhone', 'Введите 9 цифр номера'); ok = false; }
    if (!amount || amount <= 0) { setErr('fAmount', 'Сумма > 0'); ok = false; }
    if (!ok) return;

    if (el.addSaveBtn) { el.addSaveBtn.disabled = true; el.addSaveBtn.textContent = 'Сохраняем...'; }
    const res = await addNewDebtor(name, phone, amount, note);
    if (el.addSaveBtn) { el.addSaveBtn.disabled = false; el.addSaveBtn.textContent = 'Записать долг'; }

    if (!res.ok) {
      showToast('Не удалось: ' + res.error, true);
      return;
    }
    showToast(`Долг «${name}» записан`);
    closeModal(el.addModal);
  }

  // ===== ДЕТАЛИ ДОЛГА =====
  function openDetail(id) {
    const d = state.debts.find((x) => x.id === id);
    if (!d) return;
    state.detailId = id;

    if (el.detailName)  el.detailName.textContent = d.customerName;
    if (el.detailPhone) el.detailPhone.textContent = d.customerPhone || 'Без телефона';
    if (el.detailTotal) el.detailTotal.innerHTML = `${fmt(Math.round(d.totalDebt))}<small>KGS</small>`;

    // Кнопка WA доступна только если есть телефон
    if (el.detailWaBtn) el.detailWaBtn.hidden = !d.customerPhone;

    // Рендер истории
    if (el.detailHistory) {
      if (d.history.length === 0) {
        el.detailHistory.innerHTML = `<div class="debt-history__empty">История пуста</div>`;
      } else {
        el.detailHistory.innerHTML = d.history.map((h) => {
          const isPay = h.type === 'pay';
          return `
            <div class="debt-history__row debt-history__row--${isPay ? 'pay' : 'take'}">
              <div class="debt-history__icon">${isPay ? '✓' : '＋'}</div>
              <div class="debt-history__body">
                <div class="debt-history__title">${isPay ? 'Погашение' : 'Взял в долг'}</div>
                <div class="debt-history__date">${fmtDateTime(h.date)}</div>
                ${h.note ? `<div class="debt-history__note">${escapeHtml(h.note)}</div>` : ''}
              </div>
              <div class="debt-history__amount debt-history__amount--${isPay ? 'pay' : 'take'}">
                ${isPay ? '−' : '+'}${fmt(h.amount)} KGS
              </div>
            </div>`;
        }).join('');
      }
    }
    openModal(el.detailModal);
  }

  // ===== МОДАЛКА ОПЛАТЫ / ВЗЯТИЯ =====
  function openPayModal(type) {
    const d = state.debts.find((x) => x.id === state.detailId);
    if (!d) return;
    state.payingId = d.id;
    state.payType = type;

    if (el.payTitle) {
      el.payTitle.textContent = type === 'pay'
        ? `Погашение: ${d.customerName}`
        : `Ещё в долг: ${d.customerName}`;
    }
    if (el.payHint) {
      el.payHint.textContent = type === 'pay'
        ? `Текущий долг: ${fmtMoney(d.totalDebt)}`
        : `Текущий долг: ${fmtMoney(d.totalDebt)} → станет больше`;
    }
    if (el.payAmount) el.payAmount.value = '';
    clearFieldErrors();

    // Быстрые кнопки
    if (el.quickAmounts) {
      if (type === 'pay') {
        el.quickAmounts.innerHTML = `
          <button type="button" class="quick-amount" data-q="full">Весь долг</button>
          <button type="button" class="quick-amount" data-q="1000">1 000</button>
          <button type="button" class="quick-amount" data-q="500">500</button>
          <button type="button" class="quick-amount" data-q="200">200</button>`;
      } else {
        el.quickAmounts.innerHTML = `
          <button type="button" class="quick-amount" data-q="500">500</button>
          <button type="button" class="quick-amount" data-q="1000">1 000</button>
          <button type="button" class="quick-amount" data-q="2000">2 000</button>`;
      }
    }

    openModal(el.payModal);
    requestAnimationFrame(() => el.payAmount && el.payAmount.focus());
  }

  async function submitPay(e) {
    e.preventDefault();
    const d = state.debts.find((x) => x.id === state.payingId);
    if (!d) return;
    clearFieldErrors();

    const amount = Number(el.payAmount.value);
    if (!amount || amount <= 0) {
      setErr('payAmount', 'Введите сумму > 0');
      return;
    }
    if (state.payType === 'pay' && amount > d.totalDebt + 0.01) {
      setErr('payAmount', `Не больше ${fmtMoney(d.totalDebt)}`);
      return;
    }

    if (el.paySaveBtn) {
      el.paySaveBtn.disabled = true;
      el.paySaveBtn.textContent = 'Сохраняем...';
    }
    const res = await updateDebtAmount(d.id, amount, state.payType);
    if (el.paySaveBtn) {
      el.paySaveBtn.disabled = false;
      el.paySaveBtn.textContent = state.payType === 'pay' ? 'Погасить' : 'Добавить';
    }

    if (!res.ok) {
      showToast('Ошибка: ' + res.error, true);
      return;
    }

    if (state.payType === 'pay') {
      if (res.next === 0) showToast(`Долг «${d.customerName}» полностью погашен ✓`);
      else showToast(`Принято ${fmtMoney(amount)}. Остаток: ${fmtMoney(res.next)}`);
    } else {
      showToast(`Долг «${d.customerName}» увеличен на ${fmtMoney(amount)}`);
    }
    closeModal(el.payModal);
    closeModal(el.detailModal);
  }

  // ===== WA-НАПОМИНАНИЕ =====
  function openWhatsApp() {
    const d = state.debts.find((x) => x.id === state.detailId);
    if (!d || !d.customerPhone) return;
    const amount = fmt(d.totalDebt);
    const text = `Салам, ${d.customerName}! Напоминаем о задолженности ${amount} сомов в магазине. Спасибо!`;
    const digits = d.customerPhone.replace(/\D/g, '');
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }

  // ===== УДАЛЕНИЕ =====
  function openDeleteModal(id) {
    const d = state.debts.find((x) => x.id === id);
    if (!d) return;
    state.deletingId = id;
    if (el.deleteName) el.deleteName.textContent = `Запись о долге «${d.customerName}» будет удалена.`;
    openModal(el.deleteModal);
  }
  async function confirmDelete() {
    const id = state.deletingId;
    if (!id) return;
    const d = state.debts.find((x) => x.id === id);
    if (el.confirmDeleteBtn) { el.confirmDeleteBtn.disabled = true; el.confirmDeleteBtn.textContent = 'Удаляем...'; }
    try {
      await window.FB.deleteItem('debts', id);
      showToast(d ? `Запись «${d.customerName}» удалена` : 'Удалено');
      state.deletingId = null;
      closeModal(el.deleteModal);
      closeModal(el.detailModal);
    } catch (err) {
      console.error('[debts] delete:', err);
      showToast('Не удалось удалить', true);
    } finally {
      if (el.confirmDeleteBtn) { el.confirmDeleteBtn.disabled = false; el.confirmDeleteBtn.textContent = 'Удалить'; }
    }
  }

  // ===== ФОРМА-ВАЛИДАЦИЯ =====
  function setErr(fieldId, msg) {
    const input = document.getElementById(fieldId);
    const hint = document.querySelector(`.field__hint[data-for="${fieldId}"]`);
    if (input) input.classList.add('is-invalid');
    if (hint) { hint.textContent = msg; hint.classList.add('is-error'); }
  }
  function clearFieldErrors() {
    document.querySelectorAll('.field__hint').forEach((h) => {
      h.textContent = ''; h.classList.remove('is-error');
    });
    document.querySelectorAll('.modal input, .modal textarea').forEach((i) => {
      i.classList.remove('is-invalid');
    });
  }

  // ===== СОБЫТИЯ =====
  function bindEvents() {
    if (el.openAddBtn)  el.openAddBtn.addEventListener('click', openAddModal);
    if (el.emptyAddBtn) el.emptyAddBtn.addEventListener('click', openAddModal);
    if (el.addForm)     el.addForm.addEventListener('submit', submitAdd);
    if (el.payForm)     el.payForm.addEventListener('submit', submitPay);

    if (el.searchInput) {
      el.searchInput.addEventListener('input', (e) => {
        state.search = e.target.value;
        renderList();
      });
    }

    // Табы
    if (el.tabActive) {
      el.tabActive.addEventListener('click', () => {
        state.tab = 'active';
        el.tabActive.classList.add('is-active');
        el.tabArchive.classList.remove('is-active');
        renderList();
      });
    }
    if (el.tabArchive) {
      el.tabArchive.addEventListener('click', () => {
        state.tab = 'archive';
        el.tabArchive.classList.add('is-active');
        el.tabActive.classList.remove('is-active');
        renderList();
      });
    }

    // Клик по карточке — открыть детали
    if (el.list) {
      el.list.addEventListener('click', (e) => {
        const card = e.target.closest('.debt-card');
        if (!card) return;
        openDetail(card.dataset.id);
      });
    }

    // Кнопки в деталях
    if (el.detailPayBtn)  el.detailPayBtn.addEventListener('click', () => openPayModal('pay'));
    if (el.detailTakeBtn) el.detailTakeBtn.addEventListener('click', () => openPayModal('take'));
    if (el.detailWaBtn)   el.detailWaBtn.addEventListener('click', openWhatsApp);
    if (el.detailDelBtn)  el.detailDelBtn.addEventListener('click', () => openDeleteModal(state.detailId));
    if (el.confirmDeleteBtn) el.confirmDeleteBtn.addEventListener('click', confirmDelete);

    // Быстрые суммы
    if (el.quickAmounts) {
      el.quickAmounts.addEventListener('click', (e) => {
        const btn = e.target.closest('.quick-amount');
        if (!btn) return;
        const d = state.debts.find((x) => x.id === state.payingId);
        if (!d) return;
        if (btn.dataset.q === 'full') el.payAmount.value = Math.round(d.totalDebt);
        else el.payAmount.value = btn.dataset.q;
        el.payAmount.focus();
      });
    }

    // Маска телефона в форме
    if (el.fPhone) {
      el.fPhone.addEventListener('input', (e) => {
        e.target.value = maskPhone(e.target.value);
      });
    }

    // Закрытие модалок
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]')) {
        const m = e.target.closest('.modal');
        if (m) closeModal(m);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const modals = [el.addModal, el.detailModal, el.payModal, el.deleteModal];
      const open = modals.find((m) => m && !m.hidden);
      if (open) closeModal(open);
    });
  }

  // ===== ПОДПИСКА =====
  function subscribe() {
    state.unsub = window.FB.subscribeCollection('debts', (items) => {
      state.debts = items.map(normalizeDebt);
      renderStats();
      renderList();
      // Обновить открытую деталь
      if (el.detailModal && !el.detailModal.hidden && state.detailId) {
        const d = state.debts.find((x) => x.id === state.detailId);
        if (d) openDetail(state.detailId);
        else closeModal(el.detailModal);
      }
    });
  }

  // ===== INIT =====
  async function init() {
    const st = await waitForReady();
    if (!st) { console.warn('[debts] нет businessId'); return; }

    const role = st.profile?.role;
    state.isOwner = role === 'owner' || role === 'super_admin';

    renderStats();
    renderList();
    subscribe();
    bindEvents();

    console.info('[debts] Подключено · роль:', role);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
