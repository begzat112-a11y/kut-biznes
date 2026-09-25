/* =========================================================
   КУТ: БИЗНЕС — Модуль «Несие / Учёт долгов» (debts.js) · Firebase v2
   Работает с Firestore через window.KUT и window.FB.
   Коллекция: businesses/{businessId}/debts/{docId}
   Схема: { name, phone, initialAmount, amount, date, dueDate, note,
            status, payments[], createdAt, updatedAt }
   ========================================================= */

(function () {
  'use strict';

  // =========================================================
  // 1. КОНСТАНТЫ
  // =========================================================
  const OVERDUE_DAYS = 30;
  const KG_PHONE_CODE = '+996';

  // =========================================================
  // 2. СОСТОЯНИЕ
  // =========================================================
  const state = {
    debts: [],
    search: '',
    tab: 'active',          // 'active' | 'paid'
    editingId: null,
    deletingId: null,
    payingId: null,
    waDebtId: null,
    isOwner: true,
    unsubDebts: null,
  };

  // =========================================================
  // 3. DOM
  // =========================================================
  const $ = (sel) => document.querySelector(sel);
  const el = {
    openAddBtn:    $('#openAddBtn'),
    emptyAddBtn:   $('#emptyAddBtn'),
    searchInput:   $('#searchInput'),

    statTotal:     $('#statTotal'),
    statCount:     $('#statCount'),
    statOverdue:   $('#statOverdue'),

    tabs:          document.querySelectorAll('.tab[data-tab]'),
    tabActiveCount:$('#tabActiveCount'),
    tabPaidCount:  $('#tabPaidCount'),

    debtsTable:    $('#debtsTable'),
    debtsBody:     $('#debtsBody'),
    debtsEmpty:    $('#debtsEmpty'),
    emptyTitle:    $('#emptyTitle'),
    emptyText:     $('#emptyText'),

    debtModal:     $('#debtModal'),
    debtModalTitle:$('#debtModalTitle'),
    debtModalSub:  $('#debtModalSub'),
    debtForm:      $('#debtForm'),
    debtId:        $('#debtId'),
    fName:         $('#fName'),
    fPhone:        $('#fPhone'),
    fAmount:       $('#fAmount'),
    fDate:         $('#fDate'),
    fDueDate:      $('#fDueDate'),
    fNote:         $('#fNote'),
    saveBtn:       $('#saveBtn'),

    payModal:      $('#payModal'),
    payClientName: $('#payClientName'),
    payCurrentDebt:$('#payCurrentDebt'),
    payOriginalDate: $('#payOriginalDate'),
    payForm:       $('#payForm'),
    payAmount:     $('#payAmount'),
    quickAmounts:  $('#quickAmounts'),
    paymentsHistory: $('#paymentsHistory'),
    confirmPayBtn: $('#confirmPayBtn'),

    waModal:       $('#waModal'),
    waClientInfo:  $('#waClientInfo'),
    previewRu:     $('#previewRu'),
    previewKg:     $('#previewKg'),

    deleteModal:   $('#deleteModal'),
    deleteName:    $('#deleteName'),
    confirmDeleteBtn: $('#confirmDeleteBtn'),

    toast:         $('#toast'),
  };

  // =========================================================
  // 4. УТИЛИТЫ
  // =========================================================

  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);

  const fmtMoney = (n) => fmt(n) + ' KGS';

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  let toastTimer = null;
  function showToast(message, isError = false) {
    if (window.KUT?.toast) { window.KUT.toast(message, isError); return; }
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.toggle('toast--error', isError);
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
  }

  function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    // Если это ISO-строка "YYYY-MM-DD"
    if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split('-');
      return `${d}.${m}.${y}`;
    }
    const d = toDate(iso);
    if (!d) return '—';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function todayISO() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  function daysBetween(fromISO, toISO) {
    if (!fromISO) return 0;
    const a = new Date(fromISO + 'T00:00:00');
    const b = toISO ? new Date(toISO + 'T00:00:00') : new Date();
    return Math.floor((b - a) / (1000 * 60 * 60 * 24));
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function waitForReady(timeoutMs) {
    timeoutMs = timeoutMs || 20000;
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

  // ---------- Телефон ----------
  function normalizePhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('996')) d = d.slice(3);
    else if (d.startsWith('0')) d = d.slice(1);
    d = d.slice(0, 9);
    return KG_PHONE_CODE + d;
  }

  function maskPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('996')) d = d.slice(3);
    else if (d.startsWith('0')) d = d.slice(1);
    d = d.slice(0, 9);

    if (d.length === 0) return '';
    let out = KG_PHONE_CODE + ' ';
    if (d.length <= 3) return out + d;
    out += d.slice(0, 3) + ' ';
    if (d.length <= 6) return out + d.slice(3);
    out += d.slice(3, 6) + ' ';
    out += d.slice(6);
    return out;
  }

  function isValidPhone(normalized) {
    return /^\+996\d{9}$/.test(normalized);
  }

  // =========================================================
  // 5. ВЫЧИСЛЕНИЯ
  // =========================================================

  const isActive = (d) => d.status !== 'paid' && Number(d.amount) > 0;
  const getActiveDebts = () => state.debts.filter(isActive);
  const getPaidDebts = () => state.debts.filter((d) => d.status === 'paid' || Number(d.amount) <= 0);

  function isOverdue(debt) {
    if (!isActive(debt)) return false;
    return daysBetween(debt.date, null) > OVERDUE_DAYS;
  }

  // =========================================================
  // 6. РЕНДЕР
  // =========================================================

  function renderStats() {
    const active = getActiveDebts();
    const total = active.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const overdue = active.filter(isOverdue).length;

    if (el.statTotal) el.statTotal.innerHTML = `${fmt(Math.round(total))}<small>KGS</small>`;
    if (el.statCount) el.statCount.innerHTML = `${fmt(active.length)}<small>чел.</small>`;
    if (el.statOverdue) el.statOverdue.innerHTML = `${fmt(overdue)}<small>чел.</small>`;
    if (el.tabActiveCount) el.tabActiveCount.textContent = String(active.length);
    if (el.tabPaidCount) el.tabPaidCount.textContent = String(getPaidDebts().length);
  }

  function getVisibleDebts() {
    const q = state.search.trim().toLowerCase();
    const list = state.tab === 'active' ? getActiveDebts() : getPaidDebts();

    const filtered = list.filter((d) => {
      if (!q) return true;
      return String(d.name || '').toLowerCase().includes(q) ||
             String(d.phone || '').toLowerCase().includes(q);
    });

    return filtered.sort((a, b) => {
      const aOver = isOverdue(a) ? 0 : 1;
      const bOver = isOverdue(b) ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2);
    return (parts[0][0] || '') + (parts[1][0] || '');
  }

  function renderTable() {
    if (!el.debtsBody) return;
    const list = getVisibleDebts();
    const hasAny = state.tab === 'active' ? getActiveDebts().length > 0 : getPaidDebts().length > 0;

    if (!hasAny && !state.search) {
      if (el.debtsTable) el.debtsTable.hidden = true;
      if (el.debtsEmpty) el.debtsEmpty.hidden = false;
      el.debtsBody.innerHTML = '';

      if (state.tab === 'active') {
        if (el.emptyTitle) el.emptyTitle.textContent = 'Пока долгов нет';
        if (el.emptyText) el.emptyText.textContent = 'Отличная работа — все клиенты расплатились!';
        if (el.emptyAddBtn) el.emptyAddBtn.style.display = '';
      } else {
        if (el.emptyTitle) el.emptyTitle.textContent = 'Архив пуст';
        if (el.emptyText) el.emptyText.textContent = 'Здесь появятся погашенные долги.';
        if (el.emptyAddBtn) el.emptyAddBtn.style.display = 'none';
      }
      return;
    }

    if (el.debtsTable) el.debtsTable.hidden = false;
    if (el.debtsEmpty) el.debtsEmpty.hidden = true;

    if (list.length === 0) {
      el.debtsBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:40px 16px; color:var(--kut-muted);">
            По вашему запросу ничего не найдено.
          </td>
        </tr>`;
      return;
    }

    el.debtsBody.innerHTML = list.map(renderRow).join('');
  }

  function renderRow(d) {
    const paid = d.status === 'paid' || Number(d.amount) <= 0;
    const overdue = isOverdue(d);
    const days = daysBetween(d.date, null);
    const amount = Number(d.amount) || 0;
    const initial = Number(d.initialAmount) || amount;

    let dateSub = `${days} дн. назад`;
    let dateSubCls = '';
    if (paid) {
      const paidDate = d.paidAt ? toDate(d.paidAt) : null;
      dateSub = paidDate ? `Погашено ${paidDate.toLocaleDateString('ru-RU')}` : 'Погашено';
    } else if (overdue) {
      dateSub = `⚠ Просрочено ${days} дн.`;
      dateSubCls = days > 60 ? 'is-danger' : 'is-overdue';
    } else if (d.dueDate) {
      const daysLeft = daysBetween(todayISO(), d.dueDate);
      if (daysLeft >= 0) dateSub = `Вернуть до ${formatDate(d.dueDate)} (${daysLeft} дн.)`;
    }

    let amountHTML;
    if (paid) {
      amountHTML = `<span class="amount amount--paid">${fmt(initial)}<small>KGS</small></span>`;
    } else if (amount < initial) {
      amountHTML = `
        <span class="amount">${fmt(amount)}<small>KGS</small></span>
        <div class="date-cell__sub">из ${fmt(initial)} KGS</div>`;
    } else {
      amountHTML = `<span class="amount">${fmt(amount)}<small>KGS</small></span>`;
    }

    let actions;
    if (paid) {
      actions = state.isOwner ? `
        <div class="row-actions">
          <button class="icon-btn" type="button" data-act="edit" aria-label="Редактировать" title="Редактировать">✏️</button>
          <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Удалить" title="Удалить">🗑️</button>
        </div>` : '';
    } else {
      const ownerExtra = state.isOwner ? `
        <button class="icon-btn" type="button" data-act="edit" aria-label="Редактировать" title="Редактировать">✏️</button>
        <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Удалить" title="Удалить">🗑️</button>
      ` : '';
      actions = `
        <div class="row-actions">
          <button class="icon-btn icon-btn--wa" type="button" data-act="wa" aria-label="Напомнить в WhatsApp" title="Напомнить в WhatsApp">💬</button>
          <button class="icon-btn icon-btn--pay" type="button" data-act="pay" aria-label="Погасить долг" title="Погасить долг">💵</button>
          ${ownerExtra}
        </div>`;
    }

    return `
      <tr data-id="${escapeHtml(d.id)}" class="${overdue ? 'is-overdue' : ''}">
        <td data-label="Клиент">
          <div class="client">
            <div class="client__avatar" aria-hidden="true">${escapeHtml(initials(d.name))}</div>
            <div class="client__text">
              <div class="client__name">${escapeHtml(d.name)}</div>
              ${d.note ? `<div class="client__note" title="${escapeHtml(d.note)}">${escapeHtml(d.note)}</div>` : ''}
            </div>
          </div>
        </td>
        <td data-label="Телефон">
          ${d.phone ? `<a class="phone-link" href="tel:${escapeHtml(d.phone)}">📞 ${escapeHtml(d.phone)}</a>` : '—'}
        </td>
        <td data-label="Сумма долга">${amountHTML}</td>
        <td data-label="Дата">
          <div class="date-cell">${formatDate(d.date)}</div>
          <div class="date-cell__sub ${dateSubCls}">${escapeHtml(dateSub)}</div>
        </td>
        <td data-label="Действия">${actions}</td>
      </tr>
    `;
  }

  // =========================================================
  // 7. ДАННЫЕ — Firestore
  // =========================================================

  async function loadDebts() {
    try {
      const items = await window.FB.getCollection('debts');
      state.debts = items;
      renderStats();
      renderTable();
    } catch (err) {
      console.error('[debts] loadDebts failed:', err);
      showToast('Не удалось загрузить долги', true);
    }
  }

  function subscribeDebts() {
    if (state.unsubDebts) state.unsubDebts();
    state.unsubDebts = window.FB.subscribeCollection('debts', (items) => {
      state.debts = items;
      renderStats();
      renderTable();
    });
  }

  // =========================================================
  // 8. МОДАЛЬНЫЕ ОКНА
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
  // 9. ФОРМА ДОЛГА
  // =========================================================

  function clearFieldErrors() {
    document.querySelectorAll('.field__hint').forEach((h) => {
      h.textContent = '';
      h.classList.remove('is-error');
    });
    document.querySelectorAll('input, select, textarea').forEach((i) => {
      i.classList.remove('is-invalid');
    });
  }

  function setFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const hint = document.querySelector(`.field__hint[data-for="${fieldId}"]`);
    if (input) input.classList.add('is-invalid');
    if (hint) {
      hint.textContent = message || '';
      hint.classList.toggle('is-error', Boolean(message));
    }
  }

  function openAddModal() {
    state.editingId = null;
    if (el.debtModalTitle) el.debtModalTitle.textContent = 'Новый долг';
    if (el.debtModalSub) el.debtModalSub.textContent = 'Запишите клиента и сумму — потом напомним в WhatsApp в один клик.';
    if (el.saveBtn) el.saveBtn.textContent = 'Записать долг';

    if (el.debtForm) el.debtForm.reset();
    if (el.debtId) el.debtId.value = '';
    if (el.fDate) el.fDate.value = todayISO();
    if (el.fDueDate) el.fDueDate.value = '';
    clearFieldErrors();

    openModal(el.debtModal);
    if (el.fName) requestAnimationFrame(() => el.fName.focus());
  }

  function openEditModal(id) {
    const d = state.debts.find((x) => x.id === id);
    if (!d) return;

    state.editingId = d.id;
    if (el.debtModalTitle) el.debtModalTitle.textContent = 'Редактировать запись';
    if (el.debtModalSub) el.debtModalSub.textContent = 'Обновите данные и сохраните.';
    if (el.saveBtn) el.saveBtn.textContent = 'Сохранить';

    if (el.debtId) el.debtId.value = d.id;
    if (el.fName) el.fName.value = d.name || '';
    if (el.fPhone) el.fPhone.value = maskPhone(d.phone || '');
    if (el.fAmount) el.fAmount.value = d.amount ?? '';
    if (el.fDate) el.fDate.value = d.date || todayISO();
    if (el.fDueDate) el.fDueDate.value = d.dueDate || '';
    if (el.fNote) el.fNote.value = d.note || '';
    clearFieldErrors();

    openModal(el.debtModal);
    if (el.fName) requestAnimationFrame(() => el.fName.focus());
  }

  function validateDebtForm() {
    clearFieldErrors();
    let ok = true;

    const name = el.fName.value.trim();
    if (name.length < 2) { setFieldError('fName', 'Имя минимум 2 символа'); ok = false; }

    const phoneNorm = normalizePhone(el.fPhone.value);
    if (!isValidPhone(phoneNorm)) {
      setFieldError('fPhone', 'Введите корректный номер (например 0700 12 34 56)');
      ok = false;
    }

    const amount = Number(el.fAmount.value);
    if (el.fAmount.value === '' || Number.isNaN(amount) || amount <= 0) {
      setFieldError('fAmount', 'Сумма должна быть больше 0');
      ok = false;
    }

    if (!el.fDate.value) { setFieldError('fDate', 'Укажите дату взятия'); ok = false; }

    return ok;
  }

  async function saveDebt(event) {
    event.preventDefault();
    if (!validateDebtForm()) return;

    const phoneNorm = normalizePhone(el.fPhone.value);
    const amount = Number(el.fAmount.value) || 0;
    const name = el.fName.value.trim();

    const data = {
      name,
      phone: phoneNorm,
      amount,
      date: el.fDate.value,
      dueDate: el.fDueDate.value || '',
      note: el.fNote.value.trim(),
    };

    if (el.saveBtn) {
      el.saveBtn.disabled = true;
      el.saveBtn.textContent = state.editingId ? 'Сохраняем...' : 'Записываем...';
    }

    try {
      if (state.editingId) {
        const existing = state.debts.find((x) => x.id === state.editingId);
        const initial = existing ? (Number(existing.initialAmount) || Number(existing.amount) || amount) : amount;
        const newInitial = amount >= (Number(existing?.amount) || 0) ? amount : initial;
        const newStatus = amount <= 0 ? 'paid' : 'active';
        await window.FB.updateItem('debts', state.editingId, {
          ...data,
          initialAmount: newInitial,
          status: newStatus,
          paidAt: newStatus === 'paid' ? (existing?.paidAt || new Date()) : null,
        });
        showToast(`Запись «${name}» обновлена`);
      } else {
        await window.FB.addItem('debts', {
          ...data,
          initialAmount: amount,
          status: 'active',
          payments: [],
          source: 'manual',
        });
        showToast(`Долг «${name}» записан`);
      }
      closeModal(el.debtModal);
    } catch (err) {
      console.error('[debts] save failed:', err);
      showToast('Не удалось сохранить долг', true);
    } finally {
      if (el.saveBtn) {
        el.saveBtn.disabled = false;
        el.saveBtn.textContent = state.editingId ? 'Сохранить' : 'Записать долг';
      }
    }
  }

  // =========================================================
  // 10. ПОГАШЕНИЕ
  // =========================================================

  function openPayModal(id) {
    const d = state.debts.find((x) => x.id === id);
    if (!d) return;
    if (d.status === 'paid') return;

    state.payingId = d.id;
    const amount = Number(d.amount) || 0;

    if (el.payClientName) el.payClientName.innerHTML = `Клиент: <strong>${escapeHtml(d.name)}</strong>`;
    if (el.payCurrentDebt) el.payCurrentDebt.textContent = fmtMoney(amount);
    if (el.payOriginalDate) el.payOriginalDate.textContent = formatDate(d.date);
    if (el.payAmount) {
      el.payAmount.value = amount;
      el.payAmount.max = amount;
    }

    renderPaymentsHistory(d);
    clearFieldErrors();
    openModal(el.payModal);
    if (el.payAmount) requestAnimationFrame(() => el.payAmount.focus());
  }

  function renderPaymentsHistory(d) {
    if (!el.paymentsHistory) return;
    const list = Array.isArray(d.payments) ? d.payments : [];
    if (list.length === 0) {
      el.paymentsHistory.innerHTML = '';
      return;
    }
    el.paymentsHistory.innerHTML = `
      <h4>История платежей</h4>
      ${list.slice().reverse().map((p) => {
        const pd = toDate(p.date);
        const dateStr = pd ? pd.toLocaleDateString('ru-RU') : '—';
        return `
          <div class="payment-row">
            <span class="payment-row__date">${dateStr}</span>
            <span class="payment-row__amount">+ ${fmt(p.amount)} KGS</span>
          </div>`;
      }).join('')}
    `;
  }

  async function confirmPayment(event) {
    event.preventDefault();
    const d = state.debts.find((x) => x.id === state.payingId);
    if (!d) return;

    const pay = Number(el.payAmount.value);
    const debt = Number(d.amount) || 0;

    if (el.payAmount.value === '' || Number.isNaN(pay) || pay <= 0) {
      setFieldError('payAmount', 'Сумма должна быть больше 0');
      return;
    }
    if (pay > debt + 0.001) {
      setFieldError('payAmount', `Не может быть больше долга (${fmt(debt)} KGS)`);
      return;
    }

    const newAmount = Number((debt - pay).toFixed(2));
    const fullyPaid = newAmount <= 0.001;

    const payments = Array.isArray(d.payments) ? d.payments.slice() : [];
    payments.push({ amount: pay, date: new Date() });

    const updateData = {
      amount: fullyPaid ? 0 : newAmount,
      payments,
    };
    if (fullyPaid) {
      updateData.status = 'paid';
      updateData.paidAt = new Date();
    }

    if (el.confirmPayBtn) {
      el.confirmPayBtn.disabled = true;
      el.confirmPayBtn.textContent = 'Погашаем...';
    }

    try {
      await window.FB.updateItem('debts', d.id, updateData);

      if (fullyPaid) showToast(`Долг «${d.name}» полностью погашен ✓`);
      else showToast(`Принято ${fmt(pay)} KGS. Остаток: ${fmt(newAmount)} KGS`);

      state.payingId = null;
      closeModal(el.payModal);
    } catch (err) {
      console.error('[debts] payment failed:', err);
      showToast('Не удалось провести платёж', true);
    } finally {
      if (el.confirmPayBtn) {
        el.confirmPayBtn.disabled = false;
        el.confirmPayBtn.textContent = 'Погасить';
      }
    }
  }

  // =========================================================
  // 11. WHATSAPP
  // =========================================================

  function openWaModal(id) {
    const d = state.debts.find((x) => x.id === id);
    if (!d) return;

    state.waDebtId = d.id;
    const amount = Number(d.amount) || 0;

    if (el.waClientInfo) {
      el.waClientInfo.innerHTML = `Клиент: <strong>${escapeHtml(d.name)}</strong> · Долг: <strong>${fmtMoney(amount)}</strong>`;
    }
    if (el.previewRu) el.previewRu.textContent = ruMessage(d, amount, true);
    if (el.previewKg) el.previewKg.textContent = kgMessage(d, amount, true);

    openModal(el.waModal);
  }

  function ruMessage(d, amount, preview) {
    const base = `Салам, ${d.name}! Напоминаем о задолженности ${fmt(amount)} сомов в магазине. Спасибо!`;
    if (preview) return base.length > 60 ? base.slice(0, 60) + '…' : base;
    const from = d.date ? ' от ' + formatDate(d.date) : '';
    return `Салам, ${d.name}!\nНапоминаем о задолженности ${fmt(amount)} сомов${from}.\nПожалуйста, погасите при удобной возможности. Спасибо! 🙏`;
  }

  function kgMessage(d, amount, preview) {
    const base = `Салам, ${d.name}! Карызды унутпаңыз: ${fmt(amount)} сом. Рахмат!`;
    if (preview) return base.length > 60 ? base.slice(0, 60) + '…' : base;
    const from = d.date ? formatDate(d.date) + ' күнү алынган ' : '';
    return `Салам, ${d.name}!\n${from}${fmt(amount)} сом карызыңызды унутпаңыз.\nЫңгайлуу убакытта төлөп берсеңиз. Рахмат! 🙏`;
  }

  function sendWhatsApp(lang) {
    const d = state.debts.find((x) => x.id === state.waDebtId);
    if (!d) return;

    const amount = Number(d.amount) || 0;
    const text = lang === 'kg' ? kgMessage(d, amount) : ruMessage(d, amount);
    const phoneDigits = String(d.phone || '').replace(/\D/g, '');
    const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;

    window.open(url, '_blank', 'noopener');
    closeModal(el.waModal);
    state.waDebtId = null;
  }

  // =========================================================
  // 12. УДАЛЕНИЕ
  // =========================================================

  function openDeleteModal(id) {
    const d = state.debts.find((x) => x.id === id);
    if (!d) return;
    state.deletingId = d.id;
    if (el.deleteName) el.deleteName.textContent = `Запись о долге «${d.name}» (${fmtMoney(d.amount)}) будет удалена.`;
    openModal(el.deleteModal);
  }

  async function confirmDelete() {
    const id = state.deletingId;
    if (!id) return;
    const d = state.debts.find((x) => x.id === id);

    if (el.confirmDeleteBtn) {
      el.confirmDeleteBtn.disabled = true;
      el.confirmDeleteBtn.textContent = 'Удаляем...';
    }

    try {
      await window.FB.deleteItem('debts', id);
      state.deletingId = null;
      closeModal(el.deleteModal);
      if (d) showToast(`Запись «${d.name}» удалена`);
    } catch (err) {
      console.error('[debts] delete failed:', err);
      showToast('Не удалось удалить запись', true);
    } finally {
      if (el.confirmDeleteBtn) {
        el.confirmDeleteBtn.disabled = false;
        el.confirmDeleteBtn.textContent = 'Удалить';
      }
    }
  }

  // =========================================================
  // 13. СОБЫТИЯ
  // =========================================================

  function bindEvents() {
    if (el.openAddBtn) el.openAddBtn.addEventListener('click', openAddModal);
    if (el.emptyAddBtn) el.emptyAddBtn.addEventListener('click', openAddModal);

    if (el.searchInput) el.searchInput.addEventListener('input', (e) => {
      state.search = e.target.value;
      renderTable();
    });

    el.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        state.tab = tab.dataset.tab;
        el.tabs.forEach((t) => {
          const active = t.dataset.tab === state.tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', String(active));
        });
        renderTable();
      });
    });

    if (el.debtsBody) el.debtsBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const row = btn.closest('tr[data-id]');
      if (!row) return;
      const id = row.dataset.id;
      const act = btn.dataset.act;

      if (act === 'wa') openWaModal(id);
      else if (act === 'pay') openPayModal(id);
      else if (act === 'edit' && state.isOwner) openEditModal(id);
      else if (act === 'delete' && state.isOwner) openDeleteModal(id);
    });

    if (el.fPhone) el.fPhone.addEventListener('input', (e) => {
      e.target.value = maskPhone(e.target.value);
    });

    if (el.debtForm) el.debtForm.addEventListener('submit', saveDebt);

    if (el.quickAmounts) el.quickAmounts.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-q]');
      if (!btn) return;
      const d = state.debts.find((x) => x.id === state.payingId);
      if (!d) return;
      const debt = Number(d.amount) || 0;
      if (btn.dataset.q === 'full') el.payAmount.value = debt;
      else el.payAmount.value = Math.min(debt, Number(btn.dataset.q) || 0);
      el.payAmount.focus();
    });

    if (el.payForm) el.payForm.addEventListener('submit', confirmPayment);

    if (el.waModal) el.waModal.addEventListener('click', (e) => {
      const opt = e.target.closest('.lang-option');
      if (!opt) return;
      sendWhatsApp(opt.dataset.lang);
    });

    if (el.confirmDeleteBtn) el.confirmDeleteBtn.addEventListener('click', confirmDelete);

    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]')) {
        const modal = e.target.closest('.modal');
        if (modal) closeModal(modal);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const modals = [el.debtModal, el.payModal, el.waModal, el.deleteModal];
      const open = modals.find((m) => m && !m.hidden);
      if (open) closeModal(open);
    });

    window.addEventListener('kut:lang', () => {
      renderStats();
      renderTable();
    });

    window.addEventListener('beforeunload', () => {
      if (state.unsubDebts) state.unsubDebts();
    });
  }

  // =========================================================
  // 14. ИНИЦИАЛИЗАЦИЯ
  // =========================================================

  async function init() {
    const st = await waitForReady();
    if (!st) return;

    state.isOwner = st.profile?.role === 'owner' || st.profile?.role === 'super_admin';
    if (!state.isOwner && el.openAddBtn) el.openAddBtn.style.display = 'none';

    if (el.fDate) el.fDate.value = todayISO();

    renderStats();
    subscribeDebts();
    await loadDebts();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
