/* =========================================================
   КУТ: БИЗНЕС — Модуль «Несие / Учёт долгов» (debts.js)
   Чистый ES6+. Данные в localStorage под ключом kut_debts.
   Схема записи:
   {
     id, name, phone, initialAmount, amount, date, dueDate, note,
     status: 'active' | 'paid',
     payments: [{ amount, date }],
     createdAt, paidAt
   }
   ========================================================= */

const STORAGE_KEY = 'kut_debts';
const OVERDUE_DAYS = 30;
const KG_PHONE_CODE = '+996';

// ---------- Состояние ----------
const state = {
  debts: [],
  search: '',
  tab: 'active',          // 'active' | 'paid'
  editingId: null,
  deletingId: null,
  payingId: null,
  waDebtId: null,
};

// ---------- DOM ----------
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
// Утилиты
// =========================================================

const fmt = (n) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const fmtMoney = (n) => fmt(n) + ' KGS';

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('localStorage write failed:', e);
    showToast('Не удалось сохранить локально', true);
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function uid() {
  return 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

let toastTimer = null;
function showToast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle('toast--error', isError);
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
}

/** Сегодня в формате YYYY-MM-DD */
function todayISO() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Формат даты для отображения: 15.03.2025 */
function formatDate(iso) {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  } catch {
    return iso;
  }
}

/** Разница в днях между датой и сегодня */
function daysBetween(fromISO, toISO) {
  if (!fromISO) return 0;
  const a = new Date(fromISO + 'T00:00:00');
  const b = toISO ? new Date(toISO + 'T00:00:00') : new Date();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

// =========================================================
// Нормализация телефона
// Правила для КР:
//  - 0700123456      → +996700123456
//  - 700123456       → +996700123456
//  - 996700123456    → +996700123456
//  - +996 700 123456 → +996700123456
// =========================================================

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';

  if (d.startsWith('996')) {
    d = d.slice(3);
  } else if (d.startsWith('0')) {
    d = d.slice(1);
  }

  d = d.slice(0, 9);
  return KG_PHONE_CODE + d;
}

/** Маска для input: +996 XXX XXX XXX */
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

/** Валидна ли нормализованная запись (9 цифр) */
function isValidPhone(normalized) {
  return /^\+996\d{9}$/.test(normalized);
}

// =========================================================
// Загрузка
// =========================================================

function loadDebts() {
  const stored = readLS(STORAGE_KEY, null);
  state.debts = Array.isArray(stored) ? stored : [];
}

function persist() {
  writeLS(STORAGE_KEY, state.debts);
}

// =========================================================
// Вычисления
// =========================================================

const isActive = (d) => d.status !== 'paid' && Number(d.amount) > 0;

function getActiveDebts() {
  return state.debts.filter(isActive);
}

function getPaidDebts() {
  return state.debts.filter((d) => d.status === 'paid' || Number(d.amount) <= 0);
}

function isOverdue(debt) {
  if (!isActive(debt)) return false;
  return daysBetween(debt.date, null) > OVERDUE_DAYS;
}

// =========================================================
// Рендер статистики
// =========================================================

function renderStats() {
  const active = getActiveDebts();
  const total = active.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const overdue = active.filter(isOverdue).length;

  el.statTotal.innerHTML = `${fmt(Math.round(total))}<small>KGS</small>`;
  el.statCount.innerHTML = `${fmt(active.length)}<small>чел.</small>`;
  el.statOverdue.innerHTML = `${fmt(overdue)}<small>чел.</small>`;

  el.tabActiveCount.textContent = String(active.length);
  el.tabPaidCount.textContent = String(getPaidDebts().length);
}

// =========================================================
// Рендер таблицы
// =========================================================

function getVisibleDebts() {
  const q = state.search.trim().toLowerCase();
  const list = state.tab === 'active' ? getActiveDebts() : getPaidDebts();

  const filtered = list.filter((d) => {
    if (!q) return true;
    const nameMatch = String(d.name || '').toLowerCase().includes(q);
    const phoneMatch = String(d.phone || '').toLowerCase().includes(q);
    return nameMatch || phoneMatch;
  });

  // Сортировка: сначала просроченные, потом по дате (свежие первыми)
  return filtered.sort((a, b) => {
    const aOver = isOverdue(a) ? 0 : 1;
    const bOver = isOverdue(b) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    return String(b.date).localeCompare(String(a.date));
  });
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] || '') + (parts[1][0] || '');
}

function renderTable() {
  const list = getVisibleDebts();
  const hasAny = state.tab === 'active' ? getActiveDebts().length > 0 : getPaidDebts().length > 0;

  if (!hasAny && !state.search) {
    el.debtsTable.hidden = true;
    el.debtsEmpty.hidden = false;
    el.debtsBody.innerHTML = '';

    if (state.tab === 'active') {
      el.emptyTitle.textContent = 'Пока долгов нет';
      el.emptyText.textContent = 'Отличная работа — все клиенты расплатились!';
      el.emptyAddBtn.style.display = '';
    } else {
      el.emptyTitle.textContent = 'Архив пуст';
      el.emptyText.textContent = 'Здесь появятся погашенные долги.';
      el.emptyAddBtn.style.display = 'none';
    }
    return;
  }

  el.debtsTable.hidden = false;
  el.debtsEmpty.hidden = true;

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

  // Строка статуса под датой
  let dateSub = `${days} дн. назад`;
  let dateSubCls = '';
  if (paid) {
    dateSub = `Погашено ${formatDate(d.paidAt ? d.paidAt.split('T')[0] : d.date)}`;
    dateSubCls = '';
  } else if (overdue) {
    dateSub = `⚠ Просрочено ${days} дн.`;
    dateSubCls = days > 60 ? 'is-danger' : 'is-overdue';
  } else if (d.dueDate) {
    const daysLeft = daysBetween(todayISO(), d.dueDate);
    if (daysLeft >= 0) {
      dateSub = `Вернуть до ${formatDate(d.dueDate)} (${daysLeft} дн.)`;
    }
  }

  // Сумма с подписью «частично погашено»
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

  // Кнопки действий
  const actions = paid
    ? `
      <div class="row-actions">
        <button class="icon-btn" type="button" data-act="edit" aria-label="Редактировать" title="Редактировать">✏️</button>
        <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Удалить" title="Удалить">🗑️</button>
      </div>`
    : `
      <div class="row-actions">
        <button class="icon-btn icon-btn--wa" type="button" data-act="wa" aria-label="Напомнить в WhatsApp" title="Напомнить в WhatsApp">💬</button>
        <button class="icon-btn icon-btn--pay" type="button" data-act="pay" aria-label="Погасить долг" title="Погасить долг">💵</button>
        <button class="icon-btn" type="button" data-act="edit" aria-label="Редактировать" title="Редактировать">✏️</button>
        <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Удалить" title="Удалить">🗑️</button>
      </div>`;

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
        <a class="phone-link" href="tel:${escapeHtml(d.phone)}">📞 ${escapeHtml(d.phone)}</a>
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
// Модалки
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
// Форма: новый долг / редактирование
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
  el.debtModalTitle.textContent = 'Новый долг';
  el.debtModalSub.textContent = 'Запишите клиента и сумму — потом напомним в WhatsApp в один клик.';
  el.saveBtn.textContent = 'Записать долг';

  el.debtForm.reset();
  el.debtId.value = '';
  el.fDate.value = todayISO();
  el.fDueDate.value = '';
  clearFieldErrors();

  openModal(el.debtModal);
  requestAnimationFrame(() => el.fName.focus());
}

function openEditModal(id) {
  const d = state.debts.find((x) => x.id === id);
  if (!d) return;

  state.editingId = d.id;
  el.debtModalTitle.textContent = 'Редактировать запись';
  el.debtModalSub.textContent = 'Обновите данные и сохраните.';
  el.saveBtn.textContent = 'Сохранить';

  el.debtId.value = d.id;
  el.fName.value = d.name || '';
  el.fPhone.value = maskPhone(d.phone || '');
  el.fAmount.value = d.amount ?? '';
  el.fDate.value = d.date || todayISO();
  el.fDueDate.value = d.dueDate || '';
  el.fNote.value = d.note || '';
  clearFieldErrors();

  openModal(el.debtModal);
  requestAnimationFrame(() => el.fName.focus());
}

function validateDebtForm() {
  clearFieldErrors();
  let ok = true;

  const name = el.fName.value.trim();
  if (name.length < 2) {
    setFieldError('fName', 'Имя минимум 2 символа');
    ok = false;
  }

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

  if (!el.fDate.value) {
    setFieldError('fDate', 'Укажите дату взятия');
    ok = false;
  }

  return ok;
}

function saveDebt(event) {
  event.preventDefault();
  if (!validateDebtForm()) return;

  const phoneNorm = normalizePhone(el.fPhone.value);
  const amount = Number(el.fAmount.value) || 0;
  const name = el.fName.value.trim();

  if (state.editingId) {
    const idx = state.debts.findIndex((x) => x.id === state.editingId);
    if (idx !== -1) {
      const prev = state.debts[idx];
      // Пересчитываем initialAmount по логике: если пользователь изменил сумму,
      // считаем, что это новая изначальная сумма.
      const newInitial = amount >= Number(prev.amount) ? amount : prev.initialAmount;
      state.debts[idx] = {
        ...prev,
        name,
        phone: phoneNorm,
        amount,
        initialAmount: newInitial,
        date: el.fDate.value,
        dueDate: el.fDueDate.value || '',
        note: el.fNote.value.trim(),
        status: amount <= 0 ? 'paid' : 'active',
        paidAt: amount <= 0 ? (prev.paidAt || new Date().toISOString()) : null,
        updatedAt: new Date().toISOString(),
      };
    }
    showToast(`Запись «${name}» обновлена`);
  } else {
    state.debts.push({
      id: uid(),
      name,
      phone: phoneNorm,
      initialAmount: amount,
      amount,
      date: el.fDate.value,
      dueDate: el.fDueDate.value || '',
      note: el.fNote.value.trim(),
      status: 'active',
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    showToast(`Долг «${name}» записан`);
  }

  persist();
  renderStats();
  renderTable();
  closeModal(el.debtModal);
}

// =========================================================
// Погашение долга
// =========================================================

function openPayModal(id) {
  const d = state.debts.find((x) => x.id === id);
  if (!d) return;
  if (d.status === 'paid') return;

  state.payingId = d.id;
  const amount = Number(d.amount) || 0;

  el.payClientName.innerHTML = `Клиент: <strong>${escapeHtml(d.name)}</strong>`;
  el.payCurrentDebt.textContent = fmtMoney(amount);
  el.payOriginalDate.textContent = formatDate(d.date);
  el.payAmount.value = amount;
  el.payAmount.max = amount;

  renderPaymentsHistory(d);
  clearFieldErrors();
  openModal(el.payModal);
  requestAnimationFrame(() => el.payAmount.focus());
}

function renderPaymentsHistory(d) {
  const list = Array.isArray(d.payments) ? d.payments : [];
  if (list.length === 0) {
    el.paymentsHistory.innerHTML = '';
    return;
  }
  el.paymentsHistory.innerHTML = `
    <h4>История платежей</h4>
    ${list
      .slice()
      .reverse()
      .map(
        (p) => `
      <div class="payment-row">
        <span class="payment-row__date">${formatDate(p.date ? p.date.split('T')[0] : '')}</span>
        <span class="payment-row__amount">+ ${fmt(p.amount)} KGS</span>
      </div>`
      )
      .join('')}
  `;
}

function confirmPayment(event) {
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

  if (!Array.isArray(d.payments)) d.payments = [];
  d.payments.push({
    amount: pay,
    date: new Date().toISOString(),
  });

  d.amount = newAmount;
  d.updatedAt = new Date().toISOString();

  const fullyPaid = newAmount <= 0.001;

  if (fullyPaid) {
    d.amount = 0;
    d.status = 'paid';
    d.paidAt = new Date().toISOString();
    showToast(`Долг «${d.name}» полностью погашен ✓`);
  } else {
    showToast(`Принято ${fmt(pay)} KGS. Остаток: ${fmt(newAmount)} KGS`);
  }

  persist();
  renderStats();
  renderTable();
  closeModal(el.payModal);
  state.payingId = null;
}

// =========================================================
// WhatsApp-напоминание
// =========================================================

function openWaModal(id) {
  const d = state.debts.find((x) => x.id === id);
  if (!d) return;

  state.waDebtId = d.id;
  const amount = Number(d.amount) || 0;

  el.waClientInfo.innerHTML = `Клиент: <strong>${escapeHtml(d.name)}</strong> · Долг: <strong>${fmtMoney(amount)}</strong>`;

  // Предпросмотр текста (сокращённый)
  el.previewRu.textContent = ruMessage(d, amount, true);
  el.previewKg.textContent = kgMessage(d, amount, true);

  openModal(el.waModal);
}

/** Полный текст напоминания на русском */
function ruMessage(d, amount, preview = false) {
  const base = `Салам, ${d.name}! Напоминаем о задолженности ${fmt(amount)} сомов в магазине. Спасибо!`;
  if (preview) return base.length > 60 ? base.slice(0, 60) + '…' : base;
  return `Салам, ${d.name}!\nНапоминаем о задолженности ${fmt(amount)} сомов${d.date ? ' от ' + formatDate(d.date) : ''}.\nПожалуйста, погасите при удобной возможности. Спасибо! 🙏`;
}

/** Полный текст напоминания на кыргызском */
function kgMessage(d, amount, preview = false) {
  const base = `Салам, ${d.name}! Карызды унутпаңыз: ${fmt(amount)} сом. Рахмат!`;
  if (preview) return base.length > 60 ? base.slice(0, 60) + '…' : base;
  return `Салам, ${d.name}!\n${d.date ? formatDate(d.date) + ' күнү алынган ' : ''}${fmt(amount)} сом карызыңызды унутпаңыз.\nЫңгайлуу убакытта төлөп берсеңиз. Рахмат! 🙏`;
}

function sendWhatsApp(lang) {
  const d = state.debts.find((x) => x.id === state.waDebtId);
  if (!d) return;

  const amount = Number(d.amount) || 0;
  const text = lang === 'kg' ? kgMessage(d, amount) : ruMessage(d, amount);

  // wa.me требует номер без плюса
  const phoneDigits = String(d.phone || '').replace(/\D/g, '');
  const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;

  window.open(url, '_blank', 'noopener');
  closeModal(el.waModal);
  state.waDebtId = null;
}

// =========================================================
// Удаление
// =========================================================

function openDeleteModal(id) {
  const d = state.debts.find((x) => x.id === id);
  if (!d) return;
  state.deletingId = d.id;
  el.deleteName.textContent = `Запись о долге «${d.name}» (${fmtMoney(d.amount)}) будет удалена.`;
  openModal(el.deleteModal);
}

function confirmDelete() {
  if (!state.deletingId) return;
  const d = state.debts.find((x) => x.id === state.deletingId);
  state.debts = state.debts.filter((x) => x.id !== state.deletingId);
  state.deletingId = null;
  persist();
  renderStats();
  renderTable();
  closeModal(el.deleteModal);
  if (d) showToast(`Запись «${d.name}» удалена`);
}

// =========================================================
// События
// =========================================================

function bindEvents() {
  // Открыть добавление
  el.openAddBtn.addEventListener('click', openAddModal);
  el.emptyAddBtn.addEventListener('click', openAddModal);

  // Поиск
  el.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderTable();
  });

  // Табы
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

  // Действия в таблице (делегирование)
  el.debtsBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const act = btn.dataset.act;

    if (act === 'wa') openWaModal(id);
    else if (act === 'pay') openPayModal(id);
    else if (act === 'edit') openEditModal(id);
    else if (act === 'delete') openDeleteModal(id);
  });

  // Маска телефона при вводе
  el.fPhone.addEventListener('input', (e) => {
    const masked = maskPhone(e.target.value);
    // Разрешаем стирать
    if (masked.length >= e.target.value.length || e.target.value.length < 5) {
      e.target.value = masked;
    } else {
      e.target.value = masked;
    }
  });

  // Отправка формы долга
  el.debtForm.addEventListener('submit', saveDebt);

  // Быстрые суммы в модалке погашения
  el.quickAmounts.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-q]');
    if (!btn) return;
    const d = state.debts.find((x) => x.id === state.payingId);
    if (!d) return;
    const debt = Number(d.amount) || 0;

    if (btn.dataset.q === 'full') {
      el.payAmount.value = debt;
    } else {
      el.payAmount.value = Math.min(debt, Number(btn.dataset.q) || 0);
    }
    el.payAmount.focus();
  });

  // Подтверждение погашения
  el.payForm.addEventListener('submit', confirmPayment);

  // WhatsApp: выбор языка
  el.waModal.addEventListener('click', (e) => {
    const opt = e.target.closest('.lang-option');
    if (!opt) return;
    sendWhatsApp(opt.dataset.lang);
  });

  // Удаление
  el.confirmDeleteBtn.addEventListener('click', confirmDelete);

  // Универсальное закрытие по [data-close]
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal);
    }
  });

  // Escape
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modals = [el.debtModal, el.payModal, el.waModal, el.deleteModal];
    const open = modals.find((m) => !m.hidden);
    if (open) closeModal(open);
  });

  // Синхронизация между вкладками
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    loadDebts();
    renderStats();
    renderTable();
  });
}

// =========================================================
// Инициализация
// =========================================================

function init() {
  loadDebts();
  renderStats();
  renderTable();
  bindEvents();

  // Дефолтная дата в форме нового долга
  el.fDate.value = todayISO();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
