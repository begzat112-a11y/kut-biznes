/* =========================================================================
   debts.js — МОНОЛИТНЫЙ МОДУЛЬ «НЕСИЕ (ДОЛГИ)»
   Использует window.FB (firebase-config.js) — путь businesses/{bizId}/debts
   ========================================================================= */

/* ================= 1. HTML ================= */
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
    <div class="debts-empty" id="debtsEmpty">Загрузка…</div>
  </section>

</div>

<div class="debts-modal" id="debtsModal" aria-hidden="true">
  <div class="debts-modal__backdrop" data-debts-close></div>

  <div class="debts-modal__sheet" role="dialog" aria-modal="true">
    <div class="debts-modal__grabber"></div>
    <h2 class="debts-modal__title">Новый должник</h2>

    <form id="debtsForm" novalidate>

      <div class="debts-field">
        <label class="debts-field__label" for="debtsName">Имя клиента</label>
        <input class="debts-field__input" type="text" id="debtsName"
               placeholder="Например: Айбек" autocomplete="name" required />
        <span class="debts-field__error" data-error-for="debtsName"></span>
      </div>

      <div class="debts-field">
        <label class="debts-field__label" for="debtsPhone">Номер телефона клиента</label>
        <input class="debts-field__input" type="tel" id="debtsPhone"
               placeholder="Например: +996 700 123 456" autocomplete="tel"
               inputmode="tel" maxlength="20" required />
        <span class="debts-field__error" data-error-for="debtsPhone"></span>
      </div>

      <div class="debts-field">
        <label class="debts-field__label" for="debtsAmount">Сумма долга (KGS)</label>
        <input class="debts-field__input" type="number" id="debtsAmount"
               placeholder="Например: 1500" inputmode="decimal"
               min="0" step="0.01" required />
        <span class="debts-field__error" data-error-for="debtsAmount"></span>
      </div>

      <div class="debts-modal__actions">
        <button type="button" class="debts-btn debts-btn--ghost" id="debtsCancelBtn">Отмена</button>
        <button type="submit" class="debts-btn debts-btn--primary" id="debtsConfirmBtn">Подтвердить</button>
      </div>

    </form>
  </div>
</div>
`;

/* ================= 2. CSS ================= */
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
.debts-screen {
  min-height: 100vh;
  background: var(--pine-bg);
  color: var(--pine-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  padding: 20px 16px 40px;
  box-sizing: border-box;
}
.debts-screen * { box-sizing: border-box; }
.debts-header { margin-bottom: 20px; }
.debts-header__title { margin: 0 0 14px; font-size: 22px; font-weight: 700; }
.debts-summary {
  display: flex; flex-direction: column; gap: 4px;
  background: linear-gradient(180deg, #1a2c22 0%, var(--pine-card) 100%);
  border: 1px solid var(--pine-border);
  border-radius: 18px; padding: 18px 20px;
}
.debts-summary__label {
  font-size: 13px; color: var(--pine-text-dim);
  text-transform: uppercase; letter-spacing: .3px;
}
.debts-summary__value { font-size: 26px; font-weight: 700; color: var(--pine-danger); }
.debts-add-btn {
  width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px 18px; margin-bottom: 20px;
  font-size: 15px; font-weight: 600; font-family: inherit;
  color: #06210f; background: var(--pine-accent);
  border: none; border-radius: var(--pine-radius); cursor: pointer;
  transition: transform .08s ease, opacity .15s ease;
}
.debts-add-btn:active { transform: scale(.98); }
.debts-add-btn__icon { font-size: 20px; font-weight: 700; line-height: 1; }
.debts-list { display: flex; flex-direction: column; gap: 10px; }
.debts-empty {
  text-align: center; padding: 40px 20px;
  color: var(--pine-text-dim); font-size: 14px;
  border: 1px dashed var(--pine-border); border-radius: var(--pine-radius);
}
.debt-card {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--pine-card);
  border: 1px solid var(--pine-border);
  border-radius: var(--pine-radius);
  padding: 14px 16px;
}
.debt-card__main { min-width: 0; flex: 1; }
.debt-card__name {
  font-size: 15px; font-weight: 600; color: var(--pine-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.debt-card__phone { margin-top: 4px; font-size: 12px; color: var(--pine-text-dim); }
.debt-card__amount { flex-shrink: 0; font-size: 15px; font-weight: 700; color: var(--pine-danger); }
.debts-modal {
  position: fixed; inset: 0; display: none;
  align-items: flex-end; justify-content: center; z-index: 1000;
}
.debts-modal.is-open { display: flex; }
.debts-modal__backdrop {
  position: absolute; inset: 0;
  background: rgba(0,0,0,.6);
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
}
.debts-modal__sheet {
  position: relative; width: 100%; max-width: 480px;
  background: var(--pine-card);
  border-top-left-radius: 22px; border-top-right-radius: 22px;
  padding: 12px 20px calc(24px + env(safe-area-inset-bottom, 0px));
  color: var(--pine-text);
  box-shadow: 0 -8px 32px rgba(0,0,0,.4);
  animation: debtsSheetUp .25s ease;
}
@keyframes debtsSheetUp {
  from { transform: translateY(24px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
.debts-modal__grabber {
  width: 44px; height: 4px; background: var(--pine-border);
  border-radius: 4px; margin: 4px auto 14px;
}
.debts-modal__title { margin: 0 0 18px; font-size: 18px; font-weight: 600; }
.debts-field { margin-bottom: 14px; }
.debts-field__label {
  display: block; margin-bottom: 8px; padding-left: 4px;
  font-size: 13px; color: var(--pine-text-dim);
}
.debts-field__input {
  width: 100%; padding: 14px 16px; font-size: 16px; font-family: inherit;
  color: var(--pine-text); background: var(--pine-input);
  border: 1px solid var(--pine-border); border-radius: var(--pine-radius);
  outline: none; -webkit-appearance: none; appearance: none;
  transition: border-color .18s, box-shadow .18s, background .18s;
}
.debts-field__input::placeholder { color: #5f7a6b; }
.debts-field__input:focus {
  border-color: var(--pine-border-hi);
  box-shadow: 0 0 0 3px rgba(74,222,128,.12);
  background: #1f3428;
}
.debts-field__input.is-invalid {
  border-color: var(--pine-error);
  box-shadow: 0 0 0 3px rgba(239,68,68,.15);
  background: #2a1a1a;
}
.debts-field__input[type="number"]::-webkit-outer-spin-button,
.debts-field__input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none; margin: 0;
}
.debts-field__input[type="number"] { -moz-appearance: textfield; }
.debts-field__error {
  display: block; min-height: 16px; margin-top: 6px;
  padding-left: 4px; font-size: 12px; color: var(--pine-error);
}
.debts-modal__actions { display: flex; gap: 10px; margin-top: 8px; }
.debts-btn {
  flex: 1; padding: 14px 16px; font-size: 15px; font-weight: 600;
  font-family: inherit; border-radius: var(--pine-radius);
  border: 1px solid transparent; cursor: pointer;
  transition: transform .08s, opacity .15s, background .15s;
}
.debts-btn:active { transform: scale(.98); }
.debts-btn--ghost {
  background: transparent; color: var(--pine-text-dim);
  border-color: var(--pine-border);
}
.debts-btn--ghost:hover { color: var(--pine-text); border-color: var(--pine-border-hi); }
.debts-btn--primary { background: var(--pine-accent); color: #06210f; }
.debts-btn--primary:hover { opacity: .92; }
.debts-btn--primary:disabled { opacity: .55; cursor: not-allowed; }
`;

/* ================= 3. ИНЪЕКЦИЯ ================= */
function injectDebtsStyles() {
  if (document.getElementById('debts-styles')) return;
  const s = document.createElement('style');
  s.id = 'debts-styles';
  s.textContent = DEBTS_CSS;
  document.head.appendChild(s);
}

function injectDebtsHTML() {
  let root = document.getElementById('debts-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'debts-root';
    document.body.appendChild(root);
  }
  root.innerHTML = DEBTS_HTML;
}

/* ================= 4. УТИЛИТЫ ================= */
const PHONE_REGEX = /^\+?[0-9\s\-()]{9,20}$/;
const digitsOnly = (s) => (s || '').replace(/\D/g, '');
const formatKGS = (v) => (Number(v) || 0).toLocaleString('ru-RU', {
  minimumFractionDigits: 0, maximumFractionDigits: 2
}) + ' KGS';
const escapeHTML = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ================= 5. ИНИЦИАЛИЗАЦИЯ ================= */
export async function initDebtsModule() {
  // Ждём, пока firebase-config отдаст пользователя и профиль
  if (!window.FB) {
    console.error('❌ window.FB не найден. Проверь, что firebase-config.js загружен раньше debts.js');
    return;
  }

  const { user, profile } = await window.FB.waitForAuth();

  injectDebtsStyles();
  injectDebtsHTML();

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

  // Проверка авторизации
  if (!user || !profile) {
    listEl.innerHTML = `<div class="debts-empty">
      Вы не авторизованы.<br>
      <a href="./login.html" style="color:var(--pine-accent)">Войти в систему</a>
    </div>`;
    openBtn.disabled = true;
    return;
  }

  const businessId = window.FB.getBusinessId();
  if (!businessId) {
    listEl.innerHTML = `<div class="debts-empty">
      У вашего профиля нет привязки к бизнесу.<br>
      Обратитесь к администратору.
    </div>`;
    openBtn.disabled = true;
    return;
  }

  /* ---------- ОШИБКИ ПОЛЕЙ ---------- */
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

  /* ---------- ВАЛИДАЦИЯ ---------- */
  function validateForm() {
    let valid = true;

    const name = nameInput.value.trim();
    if (!name) { setFieldError(nameInput, 'Введите имя клиента'); valid = false; }
    else if (name.length < 2) { setFieldError(nameInput, 'Имя слишком короткое'); valid = false; }
    else setFieldError(nameInput, '');

    const phone = phoneInput.value.trim();
    if (!phone) { setFieldError(phoneInput, 'Введите номер телефона'); valid = false; }
    else if (!PHONE_REGEX.test(phone) || digitsOnly(phone).length < 9) {
      setFieldError(phoneInput, 'Некорректный номер. Пример: +996 700 123 456'); valid = false;
    } else setFieldError(phoneInput, '');

    const amountRaw = amountInput.value.trim();
    const amountNum = Number(amountRaw);
    if (!amountRaw) { setFieldError(amountInput, 'Введите сумму долга'); valid = false; }
    else if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setFieldError(amountInput, 'Сумма должна быть больше нуля'); valid = false;
    } else setFieldError(amountInput, '');

    return valid;
  }

  /* ---------- ОЧИСТКА ---------- */
  function resetForm() {
    form.reset();
    setFieldError(nameInput, '');
    setFieldError(phoneInput, '');
    setFieldError(amountInput, '');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Подтвердить';
  }

  /* ---------- МОДАЛКА ---------- */
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

  openBtn.addEventListener('click', openModal);

  cancelBtn.addEventListener('click', () => {
    nameInput.value = '';
    phoneInput.value = '';
    amountInput.value = '';
    closeModal();
  });

  modal.querySelectorAll('[data-debts-close]').forEach((el) =>
    el.addEventListener('click', closeModal));

  [nameInput, phoneInput, amountInput].forEach((input) =>
    input.addEventListener('input', () => {
      if (input.classList.contains('is-invalid')) setFieldError(input, '');
    }));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  /* ---------- СОХРАНЕНИЕ (через FB.addItem) ---------- */
  async function addNewDebt(name, phone, amount) {
    const payload = {
      customerName:  String(name).trim(),
      customerPhone: String(phone).trim(),
      totalDebt:     Number(amount),
      timestamp:     window.FB.serverTimestamp()
    };
    // FB.addItem сам пишет в businesses/{bizId}/debts
    const ref = await window.FB.addItem('debts', payload);
    return ref.id;
  }

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
      const id = await addNewDebt(
        nameInput.value.trim(),
        phoneInput.value.trim(),
        Number(amountInput.value)
      );
      console.log('✅ Должник добавлен, id =', id);
      resetForm();
      closeModal();
    } catch (err) {
      console.error('❌ Ошибка сохранения:', err);
      setFieldError(amountInput, 'Не удалось сохранить. Проверьте соединение.');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Подтвердить';
    }
  });

  /* ---------- КАРТОЧКА ---------- */
  function renderDebtCard(id, data) {
    const card = document.createElement('article');
    card.className = 'debt-card';
    card.dataset.id = id;
    card.innerHTML = `
      <div class="debt-card__main">
        <div class="debt-card__name">${escapeHTML(data.customerName || data.name || 'Без имени')}</div>
        <div class="debt-card__phone">${escapeHTML(data.customerPhone || data.phone || '')}</div>
      </div>
      <div class="debts-card__amount debt-card__amount">${formatKGS(data.totalDebt ?? data.amount)}</div>
    `;
    return card;
  }

  /* ---------- СОРТИРОВКА ПО timestamp/createdAt (клиентская) ---------- */
  function tsOf(data) {
    const t = data.timestamp || data.createdAt;
    if (!t) return 0;
    if (typeof t.toDate === 'function') return t.toDate().getTime();
    if (t.seconds) return t.seconds * 1000;
    const d = new Date(t);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  /* ---------- ПОДПИСКА (через FB.subscribeCollection) ---------- */
  function loadDebts() {
    // FB.subscribeCollection сам слушает businesses/{bizId}/debts
    window.FB.subscribeCollection('debts', (items) => {
      // items = [{ id, ...data }, ...]
      items.sort((a, b) => tsOf(b) - tsOf(a));

      let total = 0;
      items.forEach((it) => {
        total += Number(it.totalDebt ?? it.amount) || 0;
      });

      totalEl.textContent = formatKGS(total);
      listEl.innerHTML = '';

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'debts-empty';
        empty.textContent = 'Пока нет должников';
        listEl.appendChild(empty);
      } else {
        const frag = document.createDocumentFragment();
        items.forEach((it) => frag.appendChild(renderDebtCard(it.id, it)));
        listEl.appendChild(frag);
      }
    });
  }

  loadDebts();
  console.log('🟢 Модуль «Несие (Долги)» инициализирован. businessId =', businessId);
}

/* ================= 6. АВТОЗАПУСК ================= */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initDebtsModule().catch((e) => console.error(e));
  });
} else {
  initDebtsModule().catch((e) => console.error(e));
}
