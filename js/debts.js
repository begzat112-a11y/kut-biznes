/* =========================================================
   КУТ: БИЗНЕС — Модуль «Несие (Долги)» v10.6 «Aurora»
   
   • Телефон клиента — СТРОГО ОБЯЗАТЕЛЬНОЕ поле (type=tel, required)
   • Симметрия полей Имя / Телефон (одинаковая высота, стиль)
   • Красная рамка при ошибке валидации
   • Очистка полей при закрытии модалки
   • Запись customerPhone + customerName в Firestore
   • Realtime через onSnapshot c limit(100)
   • Пагинация и частичное погашение
   ========================================================= */

export async function initDebtsModule() {
  if (!window.FB) {
    console.error('❌ window.FB не найден');
    return;
  }

  const { user, profile } = await window.FB.waitForAuth();
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ---------- DOM REFS ----------
  const el = {
    statTotal:    $('#statTotal'),
    statCount:    $('#statCount'),
    statOverdue:  $('#statOverdue'),
    searchInput:  $('#searchInput'),

    tabActive:    $('#tabActive'),
    tabArchive:   $('#tabArchive'),
    tabActiveCount: $('#tabActiveCount'),
    tabArchiveCount:$('#tabArchiveCount'),

    list:         $('#debtsList'),
    empty:        $('#debtsEmpty'),
    emptyTitle:   $('#emptyTitle'),
    emptyText:    $('#emptyText'),
    emptyAddBtn:  $('#emptyAddBtn'),
    openAddBtn:   $('#openAddBtn'),

    // Add modal
    addModal:     $('#addModal'),
    addForm:      $('#addForm'),
    fName:        $('#fName'),
    fPhone:       $('#debtor-phone'),
    fAmount:      $('#fAmount'),
    fNote:        $('#fNote'),
    addSaveBtn:   $('#addSaveBtn'),
    addCancelBtn: $('#addCancelBtn'),

    // Detail modal
    detailModal:  $('#detailModal'),
    detailName:   $('#detailName'),
    detailPhone:  $('#detailPhone'),
    detailTotal:  $('#detailTotal'),
    detailHistory:$('#detailHistory'),
    detailPayBtn: $('#detailPayBtn'),
    detailTakeBtn:$('#detailTakeBtn'),
    detailWaBtn:  $('#detailWaBtn'),
    detailDelBtn: $('#detailDelBtn'),

    // Pay modal
    payModal:     $('#payModal'),
    payTitle:     $('#payTitle'),
    payHint:      $('#payHint'),
    payForm:      $('#payForm'),
    payAmount:    $('#payAmount'),
    quickAmounts: $('#quickAmounts'),
    paySaveBtn:   $('#paySaveBtn'),

    // Delete modal
    deleteModal:  $('#deleteModal'),
    deleteName:   $('#deleteName'),
    confirmDeleteBtn: $('#confirmDeleteBtn'),
  };

  // ---------- AUTH GUARD ----------
  if (!user || !profile) {
    if (el.list) el.list.innerHTML = `<div class="debts-empty"><h3>Вы не авторизованы</h3><p><a href="./login.html" style="color:var(--kut-gold)">Войти</a></p></div>`;
    return;
  }
  const businessId = window.FB.getBusinessId();
  if (!businessId) {
    if (el.list) el.list.innerHTML = `<div class="debts-empty"><h3>Нет бизнеса</h3><p>Обратитесь к владельцу.</p></div>`;
    return;
  }

  // ---------- STATE ----------
  const state = {
    all: [],
    tab: 'active',
    search: '',
    detailId: null,
    mode: null,       // 'pay' | 'take'
    unsub: null,
  };

  const PAGE_SIZE = 100;

  // ---------- UTILS ----------
  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const fmtKGS = (n) => fmt(n) + ' KGS';

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function toast(msg, err) {
    if (window.KUT?.toast) window.KUT.toast(msg, err);
    else console.log('[debts]', msg);
  }

  // ---------- ВАЛИДАЦИЯ ТЕЛЕФОНА ----------
  const PHONE_REGEX = /^\+?[0-9\s\-()]{9,20}$/;
  const digitsOnly = (s) => String(s || '').replace(/\D/g, '');

  function setFieldError(input, message) {
    if (!input) return;
    const hint = document.querySelector(`.field__hint[data-for="${input.id}"]`);

    if (message) {
      input.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      if (hint) {
        hint.textContent = message;
        hint.classList.add('is-error');
      }
    } else {
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
      if (hint) {
        if (input.id === 'debtor-phone') {
          hint.textContent = 'На этот номер отправим напоминание в WhatsApp.';
        } else {
          hint.textContent = '';
        }
        hint.classList.remove('is-error');
      }
    }
  }

  function clearFormErrors() {
    ['fName', 'debtor-phone', 'fAmount'].forEach((id) => {
      const input = document.getElementById(id);
      if (input) setFieldError(input, '');
    });
  }

  // ---------- SCHEMA ----------
  function getDebtName(d) {
    return d.customerName || d.name || '—';
  }
  function getDebtPhone(d) {
    return d.customerPhone || d.phone || '';
  }
  function getDebtInitial(d) {
    return Number(d.initialAmount ?? d.totalDebt ?? d.amount) || 0;
  }
  function getDebtCurrent(d) {
    if (typeof d.amount === 'number') return Number(d.amount) || 0;
    return getDebtInitial(d);
  }
  function getDebtStatus(d) {
    if (d.status === 'paid') return 'paid';
    return getDebtCurrent(d) <= 0 ? 'paid' : 'active';
  }
  function getDebtPayments(d) {
    return Array.isArray(d.payments) ? d.payments : [];
  }
  function isOverdue(d) {
    if (getDebtStatus(d) === 'paid') return false;
    const created = window.FB.toDate(d.createdAt || d.timestamp);
    if (!created) return false;
    return (Date.now() - created.getTime()) / 86400000 > 30;
  }

  // ---------- RENDER ----------
  function renderStats(list) {
    const active = list.filter((d) => getDebtStatus(d) === 'active');
    const total  = active.reduce((s, d) => s + getDebtCurrent(d), 0);
    const overdue = active.filter(isOverdue).length;

    if (el.statTotal)   el.statTotal.innerHTML   = `${fmt(total)}<small>KGS</small>`;
    if (el.statCount)   el.statCount.textContent = String(active.length);
    if (el.statOverdue) el.statOverdue.textContent = String(overdue);
  }

  function renderTabs() {
    const all = state.all;
    const activeCount = all.filter((d) => getDebtStatus(d) === 'active').length;
    const archiveCount = all.filter((d) => getDebtStatus(d) === 'paid').length;

    if (el.tabActiveCount)  el.tabActiveCount.textContent = String(activeCount);
    if (el.tabArchiveCount) el.tabArchiveCount.textContent = String(archiveCount);

    el.tabActive?.classList.toggle('is-active', state.tab === 'active');
    el.tabArchive?.classList.toggle('is-active', state.tab === 'archive');
  }

  function getVisibleList() {
    const q = state.search.trim().toLowerCase();
    const wanted = state.tab === 'active' ? 'active' : 'paid';
    return state.all
      .filter((d) => getDebtStatus(d) === wanted)
      .filter((d) => {
        if (!q) return true;
        const name = getDebtName(d).toLowerCase();
        const phone = getDebtPhone(d).toLowerCase();
        return name.includes(q) || phone.includes(q);
      })
      .sort((a, b) => {
        const ta = window.FB.toDate(a.createdAt || a.timestamp)?.getTime() || 0;
        const tb = window.FB.toDate(b.createdAt || b.timestamp)?.getTime() || 0;
        return tb - ta;
      });
  }

  function renderList() {
    if (!el.list) return;
    const items = getVisibleList();

    if (items.length === 0) {
      el.list.innerHTML = '';
      if (el.empty) {
        el.empty.hidden = false;
        if (state.tab === 'archive') {
          if (el.emptyTitle) el.emptyTitle.textContent = 'Архив пуст';
          if (el.emptyText)  el.emptyText.textContent  = 'Здесь появятся погашенные долги.';
          if (el.emptyAddBtn) el.emptyAddBtn.style.display = 'none';
        } else {
          if (el.emptyTitle) el.emptyTitle.textContent = state.search ? 'Ничего не найдено' : 'Пока долгов нет';
          if (el.emptyText)  el.emptyText.textContent  = state.search ? 'Попробуйте другой запрос.' : 'Отличная работа — все клиенты расплатились!';
          if (el.emptyAddBtn) el.emptyAddBtn.style.display = '';
        }
      }
      return;
    }

    if (el.empty) el.empty.hidden = true;

    el.list.innerHTML = items.map((d) => {
      const id = d.id;
      const name = getDebtName(d);
      const phone = getDebtPhone(d);
      const amount = getDebtCurrent(d);
      const initial = getDebtInitial(d);
      const status = getDebtStatus(d);
      const initials = name.trim().split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase();
      const overdue = isOverdue(d);
      const partial = initial > 0 && amount > 0 && amount < initial;
      const paymentsCount = getDebtPayments(d).length;

      const badge = overdue
        ? `<span class="debt-card__badge">⚠ Просрочено</span>`
        : partial
          ? `<span class="debt-card__partial">Оплачено: ${fmt(initial - amount)} из ${fmt(initial)}</span>`
          : '';

      const amtCls = status === 'paid' ? 'debt-card__amount is-paid' : 'debt-card__amount';

      return `
        <article class="debt-card${overdue ? ' is-overdue' : ''}${status === 'paid' ? ' is-archived' : ''}"
                 data-id="${escapeHtml(id)}" tabindex="0">
          <div class="debt-card__avatar">${escapeHtml(initials || '?')}</div>
          <div class="debt-card__body">
            <div class="debt-card__name">${escapeHtml(name)}</div>
            <div class="debt-card__meta">${escapeHtml(phone || '—')}</div>
            ${badge}
          </div>
          <div class="debt-card__right">
            <div class="${amtCls}">${fmt(amount)}<small>KGS</small></div>
            ${paymentsCount > 0 ? `<div class="debt-card__hint">${paymentsCount} платёж.</div>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  function renderAll() {
    renderStats(state.all);
    renderTabs();
    renderList();
  }

  // ---------- MODAL HELPERS ----------
  function openModal(m) { if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; } }
  function closeModal(m) { if (m) { m.hidden = true;  document.body.style.overflow = ''; } }
  function closeAllModals() {
    [el.addModal, el.detailModal, el.payModal, el.deleteModal].forEach((m) => closeModal(m));
  }

  // =========================================================
  // МОДАЛКА ДОБАВЛЕНИЯ — ОТКРЫТИЕ / ОТМЕНА / ОТПРАВКА
  // =========================================================
  function openAddModal() {
    closeAllModals();

    const form = document.getElementById('addForm');
    if (form) form.reset();

    ['fName', 'debtor-phone', 'fAmount', 'fNote'].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });

    clearFormErrors();

    openModal(el.addModal);
    setTimeout(() => el.fName && el.fName.focus(), 250);
  }

  function cancelAdd() {
    const form = document.getElementById('addForm');
    if (form) form.reset();

    ['fName', 'debtor-phone', 'fAmount', 'fNote'].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });

    clearFormErrors();
    closeModal(el.addModal);
  }

  async function submitAdd(event) {
    // 🚀 ВСЕГДА предотвращаем нативное поведение
    event.preventDefault();
    event.stopPropagation();

    clearFormErrors();

    let hasError = false;

    // ---------- Имя ----------
    const name = (el.fName?.value || '').trim();
    if (!name) {
      setFieldError(el.fName, 'Введите имя клиента');
      hasError = true;
    } else if (name.length < 2) {
      setFieldError(el.fName, 'Имя слишком короткое');
      hasError = true;
    }

    // ---------- ТЕЛЕФОН — СТРОГО ОБЯЗАТЕЛЕН ----------
    const phoneRaw = (el.fPhone?.value || '').trim();
    if (!phoneRaw) {
      setFieldError(el.fPhone, 'Введите номер телефона — без него нельзя записать долг');
      hasError = true;
    } else if (!PHONE_REGEX.test(phoneRaw) || digitsOnly(phoneRaw).length < 9) {
      setFieldError(el.fPhone, 'Некорректный номер. Пример: +996 700 123 456');
      hasError = true;
    }

    // ---------- Сумма ----------
    const amountNum = Number(el.fAmount?.value || 0);
    if (!el.fAmount?.value?.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      setFieldError(el.fAmount, 'Введите сумму больше нуля');
      hasError = true;
    }

    // ❌ Есть ошибки — блокируем
    if (hasError) {
      const firstInvalid = document.querySelector('#addForm .is-invalid');
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => firstInvalid.focus(), 200);
      }
      toast('Заполните все обязательные поля', true);
      return;
    }

    // ---------- Сохранение ----------
    const note = (el.fNote?.value || '').trim();
    const today = new Date().toISOString().slice(0, 10);

    el.addSaveBtn.disabled = true;
    const oldText = el.addSaveBtn.textContent;
    el.addSaveBtn.textContent = 'Сохраняем...';

    try {
      // 🚀 Единая схема + customerPhone + customerName
      const payload = {
        // Обязательные поля
        customerName:  name,
        customerPhone: phoneRaw,

        // Новая схема
        name:          name,
        phone:         phoneRaw,
        initialAmount: amountNum,
        amount:        amountNum,
        date:          today,
        dueDate:       '',
        note:          note,
        status:        'active',
        payments:      [],
        source:        'manual',
      };

      await window.FB.addItem('debts', payload);

      // Очистка и закрытие
      const form = document.getElementById('addForm');
      if (form) form.reset();
      ['fName', 'debtor-phone', 'fAmount', 'fNote'].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = '';
      });
      clearFormErrors();
      closeModal(el.addModal);

      toast(`Долг «${name}» записан`);
    } catch (err) {
      console.error('[debts] submitAdd failed:', err);
      setFieldError(el.fAmount, 'Не удалось сохранить. Проверьте соединение.');
      toast('Ошибка сохранения', true);
    } finally {
      el.addSaveBtn.disabled = false;
      el.addSaveBtn.textContent = oldText || 'Записать долг';
    }
  }

  // =========================================================
  // DETAIL
  // =========================================================
  function openDetail(id) {
    const d = state.all.find((x) => x.id === id);
    if (!d) return;
    state.detailId = id;

    const name = getDebtName(d);
    const phone = getDebtPhone(d);
    const current = getDebtCurrent(d);
    const initial = getDebtInitial(d);
    const initials = name.trim().split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase();

    const avatarEl = el.detailModal.querySelector('.debt-detail__avatar');
    if (avatarEl) avatarEl.textContent = initials || '?';
    if (el.detailName)  el.detailName.textContent = name;
    if (el.detailPhone) el.detailPhone.textContent = phone || '—';
    if (el.detailTotal) el.detailTotal.innerHTML = `${fmt(current)}<small>KGS</small>`;

    const payments = getDebtPayments(d);
    let historyHtml = '';

    historyHtml += `
      <div class="debt-history__row debt-history__row--take">
        <div class="debt-history__icon">−</div>
        <div class="debt-history__body">
          <div class="debt-history__title">Взято в долг</div>
          <div class="debt-history__date">${escapeHtml(d.date || '—')}</div>
          ${d.note ? `<div class="debt-history__note">${escapeHtml(d.note)}</div>` : ''}
        </div>
        <div class="debt-history__amount debt-history__amount--take">+${fmt(initial)}</div>
      </div>
    `;

    payments.forEach((p) => {
      historyHtml += `
        <div class="debt-history__row debt-history__row--pay">
          <div class="debt-history__icon">+</div>
          <div class="debt-history__body">
            <div class="debt-history__title">Оплата</div>
            <div class="debt-history__date">${escapeHtml(p.date || '—')}</div>
            ${p.note ? `<div class="debt-history__note">${escapeHtml(p.note)}</div>` : ''}
          </div>
          <div class="debt-history__amount debt-history__amount--pay">−${fmt(p.amount)}</div>
        </div>
      `;
    });

    if (el.detailHistory) el.detailHistory.innerHTML = historyHtml || '<div class="debt-history__empty">Нет истории</div>';

    openModal(el.detailModal);
  }

  // =========================================================
  // PAY / TAKE
  // =========================================================
  function openPayModal(mode) {
    const d = state.all.find((x) => x.id === state.detailId);
    if (!d) return;
    const isPay = mode === 'pay';
    state.mode = mode;

    if (el.payTitle) el.payTitle.textContent = isPay ? 'Погашение долга' : 'Добавить долг';
    if (el.payHint) {
      const cur = getDebtCurrent(d);
      el.payHint.textContent = isPay
        ? `Текущий долг: ${fmt(cur)} KGS`
        : `Текущий долг: ${fmt(cur)} KGS. Укажите сумму, которую клиент взял ещё.`;
    }

    if (el.payForm) el.payForm.reset();
    if (el.payAmount) el.payAmount.value = '';
    document.querySelectorAll('#payModal .field__hint').forEach((h) => {
      h.textContent = ''; h.classList.remove('is-error');
    });
    if (el.payAmount) el.payAmount.classList.remove('is-invalid');

    if (el.quickAmounts && isPay) {
      const cur = getDebtCurrent(d);
      const values = [100, 500, 1000, 2000, cur].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i).slice(0, 5);
      el.quickAmounts.innerHTML = values.map((v) =>
        `<button class="quick-amount" type="button" data-v="${v}">${fmt(v)}</button>`
      ).join('');
    } else if (el.quickAmounts) {
      el.quickAmounts.innerHTML = '';
    }

    closeModal(el.detailModal);
    openModal(el.payModal);
    setTimeout(() => el.payAmount?.focus(), 200);
  }

  async function submitPay(e) {
    e.preventDefault();
    const d = state.all.find((x) => x.id === state.detailId);
    if (!d) return;

    const amount = Number(el.payAmount.value);
    if (!amount || amount <= 0) {
      setFieldError(el.payAmount, 'Введите сумму больше нуля');
      return;
    }

    const isPay = state.mode === 'pay';
    const current = getDebtCurrent(d);

    if (isPay && amount > current) {
      setFieldError(el.payAmount, `Не может быть больше долга (${fmt(current)} KGS)`);
      return;
    }

    el.paySaveBtn.disabled = true;
    const old = el.paySaveBtn.textContent;
    el.paySaveBtn.textContent = 'Сохраняем...';

    try {
      const today = new Date().toISOString().slice(0, 10);
      const payments = getDebtPayments(d).slice();

      let newAmount;
      if (isPay) {
        newAmount = Math.max(0, current - amount);
        payments.push({ amount, date: today, note: '' });
      } else {
        newAmount = current + amount;
      }

      const status = newAmount <= 0 ? 'paid' : 'active';

      await window.FB.updateItem('debts', d.id, {
        amount: newAmount,
        initialAmount: d.initialAmount ?? getDebtInitial(d) + (isPay ? 0 : amount),
        payments,
        status,
        updatedAt: window.FB.serverTimestamp(),
      });

      closeModal(el.payModal);
      if (isPay) {
        toast(newAmount === 0
          ? `Долг «${getDebtName(d)}» полностью погашен ✓`
          : `Принято ${fmt(amount)} KGS. Остаток: ${fmt(newAmount)} KGS`);
      } else {
        toast(`Долг увеличен на ${fmt(amount)} KGS`);
      }
    } catch (err) {
      console.error('[debts] pay error:', err);
      setFieldError(el.payAmount, 'Не удалось сохранить. Проверьте соединение.');
    } finally {
      el.paySaveBtn.disabled = false;
      el.paySaveBtn.textContent = old || 'Сохранить';
    }
  }

  // =========================================================
  // WHATSAPP
  // =========================================================
  function openWhatsApp() {
    const d = state.all.find((x) => x.id === state.detailId);
    if (!d) return;
    const phone = digitsOnly(getDebtPhone(d));
    if (!phone) { toast('Нет номера телефона', true); return; }

    const name = getDebtName(d);
    const amount = getDebtCurrent(d);
    const msg = `Салам, ${name}! Напоминаем: ваш долг в магазине — ${fmt(amount)} сом. Спасибо!`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  // =========================================================
  // DELETE
  // =========================================================
  function openDeleteModal() {
    const d = state.all.find((x) => x.id === state.detailId);
    if (!d) return;
    if (el.deleteName) {
      el.deleteName.textContent =
        `Запись о долге «${getDebtName(d)}» (${fmt(getDebtCurrent(d))} KGS) будет удалена.`;
    }
    closeModal(el.detailModal);
    openModal(el.deleteModal);
  }

  async function confirmDelete() {
    if (!state.detailId) return;
    el.confirmDeleteBtn.disabled = true;
    const old = el.confirmDeleteBtn.textContent;
    el.confirmDeleteBtn.textContent = 'Удаляем...';
    try {
      await window.FB.deleteItem('debts', state.detailId);
      closeModal(el.deleteModal);
      toast('Запись удалена');
      state.detailId = null;
    } catch (err) {
      console.error('[debts] delete error:', err);
      toast('Не удалось удалить', true);
    } finally {
      el.confirmDeleteBtn.disabled = false;
      el.confirmDeleteBtn.textContent = old || 'Удалить';
    }
  }

  // =========================================================
  // SUBSCRIBE
  // =========================================================
  function subscribeDebts() {
    if (state.unsub) { try { state.unsub(); } catch (_) {} }

    state.unsub = window.FB.subscribePage('debts', ({ items }) => {
      state.all = items;
      renderAll();
    }, {
      pageSize: PAGE_SIZE,
      orderByField: 'createdAt',
      orderDirection: 'desc',
    });
  }

  // =========================================================
  // EVENT BINDING
  // =========================================================
  el.openAddBtn?.addEventListener('click', openAddModal);
  el.emptyAddBtn?.addEventListener('click', openAddModal);
  el.addCancelBtn?.addEventListener('click', cancelAdd);
  el.addForm?.addEventListener('submit', submitAdd);

  el.searchInput?.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderList();
  });

  el.tabActive?.addEventListener('click', () => {
    state.tab = 'active'; renderAll();
  });
  el.tabArchive?.addEventListener('click', () => {
    state.tab = 'archive'; renderAll();
  });

  el.list?.addEventListener('click', (e) => {
    const card = e.target.closest('.debt-card');
    if (!card) return;
    openDetail(card.dataset.id);
  });

  el.detailPayBtn?.addEventListener('click', () => openPayModal('pay'));
  el.detailTakeBtn?.addEventListener('click', () => openPayModal('take'));
  el.detailWaBtn?.addEventListener('click', openWhatsApp);
  el.detailDelBtn?.addEventListener('click', openDeleteModal);

  el.payForm?.addEventListener('submit', submitPay);
  el.confirmDeleteBtn?.addEventListener('click', confirmDelete);

  el.quickAmounts?.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-amount');
    if (!btn) return;
    el.payAmount.value = btn.dataset.v;
    setFieldError(el.payAmount, '');
  });

  // Закрытие модалок
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) {
      const modal = e.target.closest('.modal');
      if (modal && modal.id === 'addModal') {
        cancelAdd();
      } else if (modal) {
        closeModal(modal);
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (el.addModal && !el.addModal.hidden) cancelAdd();
    else closeAllModals();
  });

  // Live-валидация
  [el.fName, el.fPhone, el.fAmount].forEach((i) => {
    i?.addEventListener('input', () => {
      if (i.classList.contains('is-invalid')) setFieldError(i, '');
    });
  });
  el.payAmount?.addEventListener('input', () => {
    if (el.payAmount.classList.contains('is-invalid')) setFieldError(el.payAmount, '');
  });

  // ---------- GO ----------
  renderAll();
  subscribeDebts();

  console.log('🟢 Модуль «Несие» v10.6 · телефон обязателен · biz:', businessId);
}

// =========================================================
// АВТОЗАПУСК
// =========================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initDebtsModule().catch((e) => console.error('[debts] init error:', e));
  });
} else {
  initDebtsModule().catch((e) => console.error('[debts] init error:', e));
}
