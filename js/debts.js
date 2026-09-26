/* =========================================================================
   debts.js — МОНОЛИТНЫЙ МОДУЛЬ «НЕСИЕ (ДОЛГИ)» для приложения «КУТ: БИЗНЕС»
   Включает: HTML-структуру, CSS (тёмная хвойная тема), всю JS-логику Firestore.
   Зависимость: ./firebase-config.js  →  export const db
   ========================================================================= */

import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================================
   1. HTML-СТРУКТУРА ЭКРАНА И МОДАЛКИ
   ========================================================================= */
const DEBTS_HTML = `
<div class="debts-screen">

  <header class="debts-header">
    <h1 class="debts-header__title">Несие (Долги)</h1>
    <div class="debts-summary">
      <span class="debts-summary__label">Всего должны</span>
      <span class="debts-summary__value" id="debtsTotal">0 KGS</span>
    </div>
  </header>

  <button type="button" class="debts-add-btn" id="debtsOpenBtn">
    <span class="debts-add-btn__icon">+</span>
    <span>Добавить должника</span>
  </button>

  <section class="debts-list" id="debtsList">
    <div class="debts-empty" id="debtsEmpty">Пока нет должников</div>
  </section>

</div>

<!-- ====================== МОДАЛКА: НОВЫЙ ДОЛЖНИК ====================== -->
<div class="debts-modal" id="debtsModal" aria-hidden="true">
  <div class="debts-modal__backdrop" data-debts-close></div>

  <div class="debts-modal__sheet" role="dialog" aria-modal="true" aria-labelledby="debtsModalTitle">
    <div class="debts-modal__grabber"></div>
    <h2 class="debts-modal__title" id="debtsModalTitle">Новый должник</h2>

    <form id="debtsForm" novalidate>

      <div class="debts-field">
        <label class="debts-field__label" for="debtsName">Имя клиента</label>
        <input
          class="debts-field__input"
          type="text"
          id="debtsName"
          name="customerName"
          placeholder="Например: Айбек"
          autocomplete="name"
          required
        />
        <span class="debts-field__error" data-error-for="debtsName"></span>
      </div>

      <div class="debts-field">
        <label class="debts-field__label" for="debtsPhone">Номер телефона клиента</label>
        <input
          class="debts-field__input"
          type="tel"
          id="debtsPhone"
          name="customerPhone"
          placeholder="Например: +996 700 123 456"
          autocomplete="tel"
          inputmode="tel"
          pattern="^\\+?[0-9\\s\\-()]{9,20}$"
          maxlength="20"
          required
        />
        <span class="debts-field__error" data-error-for="debtsPhone"></span>
      </div>

      <div class="debts-field">
        <label class="debts-field__label" for="debtsAmount">Сумма долга (KGS)</label>
        <input
          class="debts-field__input"
          type="number"
          id="debtsAmount"
          name="totalDebt"
          placeholder="Например: 1500"
          inputmode="decimal"
          min="0"
          step="0.01"
          required
        />
        <span class="debts-field__error" data-error-for="debtsAmount"></span>
      </div>

      <div class="debts-modal__actions">
        <button type="button" class="debts-btn debts-btn--ghost"  id="debtsCancelBtn">Отмена</button>
        <button type="submit" class="debts-btn debts-btn--primary" id="debtsConfirmBtn">Подтвердить</button>
      </div>

    </form>
  </div>
</div>
`;

/* =========================================================================
   2. CSS — ФИРМЕННАЯ ТЁМНАЯ ХВОЙНАЯ ТЕМА
   ========================================================================= */
const DEBTS_CSS = `
:root {
  --pine-bg:        #0f1a14;
  --pine-card:      #16241c;
  --pine-input:     #1c2f24;
  --pine-border:    #2a4436;
  --pine-border-hi: #3d6b50;
  --pine-accent:    #4ade80;
  --pine-text:      #e7f0ea;
  --pine-text-dim:  #8fa79a;
  --pine-error:     #ef4444;
  --pine-danger:    #f87171;
  --pine-radius:    14px;
}

/* ============ ЭКРАН ============ */
.debts-screen {
  min-height: 100vh;
  background: var(--pine-bg);
  color: var(--pine-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  padding: 20px 16px 40px;
  box-sizing: border-box;
}

.debts-screen * { box-sizing: border-box; }

/* ============ ШАПКА ============ */
.debts-header {
  margin-bottom: 20px;
}

.debts-header__title {
  margin: 0 0 14px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: .2px;
  color: var(--pine-text);
}

.debts-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: linear-gradient(180deg, #1a2c22 0%, var(--pine-card) 100%);
  border: 1px solid var(--pine-border);
  border-radius: 18px;
  padding: 18px 20px;
}

.debts-summary__label {
  font-size: 13px;
  color: var(--pine-text-dim);
  letter-spacing: .3px;
  text-transform: uppercase;
}

.debts-summary__value {
  font-size: 26px;
  font-weight: 700;
  color: var(--pine-danger);
  letter-spacing: .3px;
}

/* ============ КНОПКА ДОБАВЛЕНИЯ ============ */
.debts-add-btn {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 18px;
  margin-bottom: 20px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  color: #06210f;
  background: var(--pine-accent);
  border: none;
  border-radius: var(--pine-radius);
  cursor: pointer;
  transition: transform .08s ease, opacity .15s ease;
}
.debts-add-btn:active { transform: scale(.98); }
.debts-add-btn:hover  { opacity: .92; }

.debts-add-btn__icon {
  font-size: 20px;
  line-height: 1;
  font-weight: 700;
}

/* ============ СПИСОК / ЛЕНТА ============ */
.debts-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.debts-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--pine-text-dim);
  font-size: 14px;
  border: 1px dashed var(--pine-border);
  border-radius: var(--pine-radius);
}

/* ============ КАРТОЧКА ДОЛЖНИКА ============ */
.debt-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--pine-card);
  border: 1px solid var(--pine-border);
  border-radius: var(--pine-radius);
  padding: 14px 16px;
  transition: border-color .15s ease, transform .08s ease;
}
.debt-card:hover { border-color: var(--pine-border-hi); }

.debt-card__main {
  min-width: 0;
  flex: 1;
}

.debt-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--pine-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.debt-card__phone {
  margin-top: 4px;
  font-size: 12px;
  color: var(--pine-text-dim);
  letter-spacing: .2px;
}

.debt-card__amount {
  flex-shrink: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--pine-danger);
  white-space: nowrap;
}

/* ============ МОДАЛКА ============ */
.debts-modal {
  position: fixed;
  inset: 0;
  display: none;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}
.debts-modal.is-open { display: flex; }

.debts-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .6);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.debts-modal__sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  background: var(--pine-card);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  padding: 12px 20px calc(24px + env(safe-area-inset-bottom, 0px));
  color: var(--pine-text);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, .4);
  animation: debtsSheetUp .25s ease;
}

@keyframes debtsSheetUp {
  from { transform: translateY(24px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

.debts-modal__grabber {
  width: 44px;
  height: 4px;
  background: var(--pine-border);
  border-radius: 4px;
  margin: 4px auto 14px;
}

.debts-modal__title {
  margin: 0 0 18px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: .2px;
}

/* ============ ПОЛЯ ФОРМЫ ============ */
.debts-field { margin-bottom: 14px; }

.debts-field__label {
  display: block;
  margin-bottom: 8px;
  padding-left: 4px;
  font-size: 13px;
  color: var(--pine-text-dim);
}

.debts-field__input {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  font-family: inherit;
  color: var(--pine-text);
  background: var(--pine-input);
  border: 1px solid var(--pine-border);
  border-radius: var(--pine-radius);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
}

.debts-field__input::placeholder { color: #5f7a6b; }

.debts-field__input:focus {
  border-color: var(--pine-border-hi);
  box-shadow: 0 0 0 3px rgba(74, 222, 128, .12);
  background: #1f3428;
}

.debts-field__input.is-invalid {
  border-color: var(--pine-error);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, .15);
  background: #2a1a1a;
}

/* Убираем стрелки у number-инпута */
.debts-field__input[type="number"]::-webkit-outer-spin-button,
.debts-field__input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.debts-field__input[type="number"] { -moz-appearance: textfield; }

.debts-field__error {
  display: block;
  min-height: 16px;
  margin-top: 6px;
  padding-left: 4px;
  font-size: 12px;
  color: var(--pine-error);
}

/* ============ КНОПКИ МОДАЛКИ ============ */
.debts-modal__actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.debts-btn {
  flex: 1;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  border-radius: var(--pine-radius);
  border: 1px solid transparent;
  cursor: pointer;
  transition: transform .08s ease, opacity .15s ease, background .15s ease;
}
.debts-btn:active { transform: scale(.98); }

.debts-btn--ghost {
  background: transparent;
  color: var(--pine-text-dim);
  border-color: var(--pine-border);
}
.debts-btn--ghost:hover {
  color: var(--pine-text);
  border-color: var(--pine-border-hi);
}

.debts-btn--primary {
  background: var(--pine-accent);
  color: #06210f;
}
.debts-btn--primary:hover    { opacity: .92; }
.debts-btn--primary:disabled { opacity: .55; cursor: not-allowed; }
`;

/* =========================================================================
   3. ИНЪЕКЦИЯ СТИЛЕЙ И HTML В ДОКУМЕНТ
   ========================================================================= */
function injectDebtsStyles() {
  if (document.getElementById('debts-styles')) return;
  const styleEl = document.createElement('style');
  styleEl.id = 'debts-styles';
  styleEl.textContent = DEBTS_CSS;
  document.head.appendChild(styleEl);
}

function injectDebtsHTML() {
  let root = document.getElementById('debts-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'debts-root';
    document.body.appendChild(root);
  }
  root.innerHTML = DEBTS_HTML;
  return root;
}

/* =========================================================================
   4. УТИЛИТЫ
   ========================================================================= */
const PHONE_REGEX = /^\+?[0-9\s\-()]{9,20}$/;

const digitsOnly = (str) => (str || '').replace(/\D/g, '');

const formatKGS = (value) => {
  const num = Number(value) || 0;
  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }) + ' KGS';
};

const escapeHTML = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* =========================================================================
   5. ГЛАВНЫЙ ИНИЦИАЛИЗАТОР МОДУЛЯ
   ========================================================================= */
export function initDebtsModule() {
  injectDebtsStyles();
  injectDebtsHTML();

  /* ---------- DOM-ССЫЛКИ ---------- */
  const modal       = document.getElementById('debtsModal');
  const form        = document.getElementById('debtsForm');
  const nameInput   = document.getElementById('debtsName');
  const phoneInput  = document.getElementById('debtsPhone');
  const amountInput = document.getElementById('debtsAmount');
  const openBtn     = document.getElementById('debtsOpenBtn');
  const cancelBtn   = document.getElementById('debtsCancelBtn');
  const confirmBtn  = document.getElementById('debtsConfirmBtn');
  const totalEl     = document.getElementById('debtsTotal');
  const listEl      = document.getElementById('debtsList');
  const emptyEl     = document.getElementById('debtsEmpty');

  /* ---------- УПРАВЛЕНИЕ ОШИБКАМИ ---------- */
  function setFieldError(input, message) {
    const errorEl = document.querySelector(`[data-error-for="${input.id}"]`);
    if (message) {
      input.classList.add('is-invalid');
      if (errorEl) errorEl.textContent = message;
    } else {
      input.classList.remove('is-invalid');
      if (errorEl) errorEl.textContent = '';
    }
  }

  /* ---------- ВАЛИДАЦИЯ ФОРМЫ ---------- */
  function validateForm() {
    let valid = true;

    // Имя
    const name = nameInput.value.trim();
    if (!name) {
      setFieldError(nameInput, 'Введите имя клиента');
      valid = false;
    } else if (name.length < 2) {
      setFieldError(nameInput, 'Имя слишком короткое');
      valid = false;
    } else {
      setFieldError(nameInput, '');
    }

    // Телефон
    const phone = phoneInput.value.trim();
    if (!phone) {
      setFieldError(phoneInput, 'Введите номер телефона');
      valid = false;
    } else if (!PHONE_REGEX.test(phone) || digitsOnly(phone).length < 9) {
      setFieldError(phoneInput, 'Некорректный номер. Пример: +996 700 123 456');
      valid = false;
    } else {
      setFieldError(phoneInput, '');
    }

    // Сумма долга
    const amountRaw = amountInput.value.trim();
    const amountNum = Number(amountRaw);
    if (!amountRaw) {
      setFieldError(amountInput, 'Введите сумму долга');
      valid = false;
    } else if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setFieldError(amountInput, 'Сумма должна быть больше нуля');
      valid = false;
    } else {
      setFieldError(amountInput, '');
    }

    return valid;
  }

  /* ---------- ОЧИСТКА ФОРМЫ ---------- */
  function resetForm() {
    form.reset();
    setFieldError(nameInput, '');
    setFieldError(phoneInput, '');
    setFieldError(amountInput, '');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Подтвердить';
  }

  /* ---------- ОТКРЫТИЕ / ЗАКРЫТИЕ МОДАЛКИ ---------- */
  function openModal() {
    resetForm();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => nameInput.focus(), 250);
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    resetForm();
  }

  /* ---------- СОБЫТИЯ МОДАЛКИ ---------- */
  openBtn.addEventListener('click', openModal);

  cancelBtn.addEventListener('click', () => {
    // Явная очистка полей перед закрытием
    nameInput.value   = '';
    phoneInput.value  = '';
    amountInput.value = '';
    closeModal();
  });

  modal.querySelectorAll('[data-debts-close]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });

  // Снимаем ошибку при вводе
  [nameInput, phoneInput, amountInput].forEach((input) => {
    input.addEventListener('input', () => {
      if (input.classList.contains('is-invalid')) setFieldError(input, '');
    });
  });

  // Закрытие по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });

  /* ---------- ФУНКЦИЯ СОХРАНЕНИЯ В FIRESTORE ---------- */
  async function addNewDebt(name, phone, amount) {
    const payload = {
      customerName:  String(name).trim(),
      customerPhone: String(phone).trim(),
      totalDebt:     Number(amount),
      timestamp:     serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'debts'), payload);
    return docRef.id;
  }

  /* ---------- ОБРАБОТКА SUBMIT ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      const firstInvalid = form.querySelector('.is-invalid');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Сохранение…';

    try {
      const name   = nameInput.value.trim();
      const phone  = phoneInput.value.trim();
      const amount = Number(amountInput.value);

      const newId = await addNewDebt(name, phone, amount);
      console.log('✅ Должник добавлен, id =', newId);

      resetForm();
      closeModal();
    } catch (err) {
      console.error('❌ Ошибка сохранения должника:', err);
      setFieldError(amountInput, 'Не удалось сохранить. Проверьте соединение.');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Подтвердить';
    }
  });

  /* ---------- РЕНДЕР КАРТОЧКИ ДОЛЖНИКА ---------- */
  function renderDebtCard(id, data) {
    const name   = escapeHTML(data.customerName  || 'Без имени');
    const phone  = escapeHTML(data.customerPhone || '');
    const amount = formatKGS(data.totalDebt);

    const card = document.createElement('article');
    card.className = 'debt-card';
    card.dataset.id = id;

    card.innerHTML = `
      <div class="debt-card__main">
        <div class="debt-card__name">${name}</div>
        <div class="debt-card__phone">${phone}</div>
      </div>
      <div class="debt-card__amount">${amount}</div>
    `;
    return card;
  }

  /* ---------- РЕАЛЬНОВРЕМЕННАЯ ЗАГРУЗКА КОЛЛЕКЦИИ ---------- */
  function loadDebts() {
    const debtsQuery = query(
      collection(db, 'debts'),
      orderBy('timestamp', 'desc')
    );

    onSnapshot(
      debtsQuery,
      (snapshot) => {
        let total = 0;
        const cards = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          total += Number(data.totalDebt) || 0;
          cards.push(renderDebtCard(docSnap.id, data));
        });

        // Обновляем верхний виджет суммы
        totalEl.textContent = formatKGS(total);

        // Перерисовываем список
        listEl.innerHTML = '';

        if (cards.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'debts-empty';
          empty.id = 'debtsEmpty';
          empty.textContent = 'Пока нет должников';
          listEl.appendChild(empty);
        } else {
          const fragment = document.createDocumentFragment();
          cards.forEach((card) => fragment.appendChild(card));
          listEl.appendChild(fragment);
        }
      },
      (error) => {
        console.error('❌ onSnapshot error:', error);
        listEl.innerHTML = `
          <div class="debts-empty">
            Не удалось загрузить список должников.<br>
            Проверьте соединение с интернетом.
          </div>
        `;
      }
    );
  }

  // Стартовая загрузка
  loadDebts();

  console.log('🟢 Модуль «Несие (Долги)» инициализирован');
}

/* =========================================================================
   6. АВТО-ЗАПУСК ПРИ ЗАГРУЗКЕ DOM
   ========================================================================= */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDebtsModule);
} else {
  initDebtsModule();
}
