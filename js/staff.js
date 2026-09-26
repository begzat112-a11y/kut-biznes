/* =========================================================
   КУТ: БИЗНЕС — Модуль «Сотрудники» (staff.js) · Firebase v1
   Управление кассирами со стороны владельца бизнеса.
   Коллекция: staff/{phoneDigits} — приглашение + реестр.
   ========================================================= */

(function () {
  'use strict';

  const KG_PHONE_CODE = '+996';

  // =========================================================
  // СОСТОЯНИЕ
  // =========================================================
  const state = {
    staff: [],
    search: '',
    editingId: null,
    deletingId: null,
    businessId: null,
    businessName: '',
    isOwner: false,
    unsubStaff: null,
  };

  // =========================================================
  // DOM
  // =========================================================
  const $ = (s) => document.querySelector(s);
  const el = {
    mainWrap:      $('#mainWrap'),
    permWarn:      $('#permWarn'),
    openAddBtn:    $('#openAddBtn'),
    emptyAddBtn:   $('#emptyAddBtn'),
    searchInput:   $('#searchInput'),

    statTotal:     $('#statTotal'),
    statActive:    $('#statActive'),
    statPending:   $('#statPending'),

    staffTable:    $('#staffTable'),
    staffBody:     $('#staffBody'),
    staffEmpty:    $('#staffEmpty'),

    staffModal:    $('#staffModal'),
    staffModalTitle: $('#staffModalTitle'),
    staffModalSub: $('#staffModalSub'),
    staffForm:     $('#staffForm'),
    staffId:       $('#staffId'),
    fName:         $('#fName'),
    countrySelect: $('#countrySelect'),
    fPhone:        $('#fPhone'),
    saveBtn:       $('#saveBtn'),

    deleteModal:   $('#deleteModal'),
    deleteName:    $('#deleteName'),
    confirmDeleteBtn: $('#confirmDeleteBtn'),
  };

  // =========================================================
  // УТИЛИТЫ
  // =========================================================

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function showToast(message, isError) {
    if (window.KUT?.toast) window.KUT.toast(message, isError);
    else console.log('[staff]', message);
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
      if (st && st.profile) return st;
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

  function formatDate(ts) {
    const d = toDate(ts);
    if (!d) return '—';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2);
    return (parts[0][0] || '') + (parts[1][0] || '');
  }

  // =========================================================
  // ТЕЛЕФОН
  // =========================================================

  function getSelectedCountry() {
    const opt = el.countrySelect.options[el.countrySelect.selectedIndex];
    return {
      code:    opt.dataset.code,
      digits:  Number(opt.dataset.digits),
      pattern: opt.dataset.pattern,
    };
  }

  function digitsOnly(raw, maxDigits) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('0')) d = d.slice(1);
    return d.slice(0, maxDigits);
  }

  function applyMask(digits, pattern) {
    let out = '';
    let di = 0;
    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i];
      if (p === 'X') {
        if (di >= digits.length) break;
        out += digits[di++];
      } else {
        if (di >= digits.length) break;
        out += p;
      }
    }
    return out;
  }

  function updatePhonePlaceholder() {
    const c = getSelectedCountry();
    el.fPhone.placeholder = c.pattern;
  }

  function formatPhoneInput(raw) {
    const c = getSelectedCountry();
    const d = digitsOnly(raw, c.digits);
    return applyMask(d, c.pattern);
  }

  function normalizePhone() {
    const c = getSelectedCountry();
    const d = digitsOnly(el.fPhone.value, c.digits);
    return c.code + d;
  }

  function isValidPhoneValue() {
    const c = getSelectedCountry();
    const d = digitsOnly(el.fPhone.value, c.digits);
    return d.length === c.digits;
  }

  function phoneKeyFromNormalized(normalized) {
    return String(normalized || '').replace(/\D/g, '');
  }

  el.fPhone.addEventListener('input', (e) => {
    e.target.value = formatPhoneInput(e.target.value);
  });

  el.countrySelect.addEventListener('change', () => {
    updatePhonePlaceholder();
    el.fPhone.value = formatPhoneInput(el.fPhone.value);
    setFieldError('fPhone', '');
  });

  // =========================================================
  // ВАЛИДАЦИЯ
  // =========================================================

  function setFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const hint = document.querySelector(`.field__hint[data-for="${fieldId}"]`);
    if (input) input.classList.toggle('is-invalid', Boolean(message));
    if (hint) {
      if (message) {
        hint.textContent = message;
        hint.classList.add('is-error');
      } else {
        hint.classList.remove('is-error');
        if (fieldId === 'fPhone') {
          hint.textContent = 'На этот номер кассир получит код в WhatsApp.';
        } else {
          hint.textContent = '';
        }
      }
    }
  }

  function clearFieldErrors() {
    document.querySelectorAll('#staffForm .field__hint').forEach((h) => {
      h.textContent = '';
      h.classList.remove('is-error');
    });
    document.querySelectorAll('#staffForm input, #staffForm select').forEach((i) => {
      i.classList.remove('is-invalid');
    });
  }

  function validateForm() {
    clearFieldErrors();
    let ok = true;

    const name = el.fName.value.trim();
    if (name.length < 2) {
      setFieldError('fName', 'Имя минимум 2 символа');
      ok = false;
    }

    if (!isValidPhoneValue()) {
      const c = getSelectedCountry();
      setFieldError('fPhone', `Введите ${c.digits} цифр номера`);
      ok = false;
    }

    return ok;
  }

  // =========================================================
  // РЕНДЕР
  // =========================================================

  function renderStats() {
    const list = state.staff;
    const total = list.length;
    const active = list.filter((s) => s.active !== false && s.uid).length;
    const pending = list.filter((s) => !s.uid).length;

    if (el.statTotal) el.statTotal.innerHTML = `${total}<small>чел.</small>`;
    if (el.statActive) el.statActive.innerHTML = `${active}<small>чел.</small>`;
    if (el.statPending) el.statPending.innerHTML = `${pending}<small>чел.</small>`;
  }

  function getVisibleStaff() {
    const q = state.search.trim().toLowerCase();
    return state.staff
      .filter((s) => {
        if (!q) return true;
        return String(s.name || '').toLowerCase().includes(q) ||
               String(s.phone || '').toLowerCase().includes(q);
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function renderTable() {
    if (!el.staffBody) return;
    const items = getVisibleStaff();

    if (state.staff.length === 0) {
      el.staffTable.hidden = true;
      el.staffEmpty.hidden = false;
      el.staffBody.innerHTML = '';
      return;
    }

    el.staffTable.hidden = false;
    el.staffEmpty.hidden = true;

    if (items.length === 0) {
      el.staffBody.innerHTML = `
        <tr><td colspan="5" style="text-align:center; padding:40px 16px; color:var(--kut-muted);">
          По вашему запросу ничего не найдено.
        </td></tr>`;
      return;
    }

    el.staffBody.innerHTML = items.map((s) => {
      const isPending = !s.uid;
      const isBlocked = s.active === false;

      let statusCls = 'badge--active';
      let statusTxt = 'Активен';
      if (isBlocked) { statusCls = 'badge--blocked'; statusTxt = 'Заблокирован'; }
      else if (isPending) { statusCls = 'badge--pending'; statusTxt = 'Ожидает входа'; }

      const toggleTitle = isBlocked ? 'Разблокировать' : 'Заблокировать';
      const toggleIcon = isBlocked ? '🔓' : '🚫';
      const toggleCls = isBlocked ? 'icon-btn--ok' : 'icon-btn--warn';

      return `
        <tr data-id="${escapeHtml(s.id)}">
          <td data-label="Сотрудник">
            <div class="emp">
              <div class="emp__avatar">${escapeHtml(initials(s.name))}</div>
              <div class="emp__text">
                <div class="emp__name">${escapeHtml(s.name || '—')}</div>
                <div class="emp__sub">Кассир</div>
              </div>
            </div>
          </td>
          <td data-label="Телефон">
            ${s.phone
              ? `<a class="phone-link" href="tel:${escapeHtml(s.phone)}">📞 ${escapeHtml(s.phone)}</a>`
              : '—'}
          </td>
          <td data-label="Статус">
            <span class="badge ${statusCls}">
              <span class="badge__dot"></span>
              ${statusText}
            </span>
          </td>
          <td data-label="Дата">${formatDate(s.createdAt)}</td>
          <td data-label="Действия">
            <div class="row-actions">
              <button class="icon-btn" type="button" data-act="edit" title="Редактировать">✏️</button>
              <button class="icon-btn ${toggleCls}" type="button" data-act="toggle" title="${toggleTitle}">${toggleIcon}</button>
              <button class="icon-btn icon-btn--danger" type="button" data-act="delete" title="Удалить">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // =========================================================
  // МОДАЛЬНЫЕ ОКНА
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
  // ОПЕРАЦИИ
  // =========================================================

  function openAddModal() {
    state.editingId = null;
    if (el.staffModalTitle) el.staffModalTitle.textContent = 'Пригласить кассира';
    if (el.staffModalSub) el.staffModalSub.textContent = 'Кассир войдёт на странице входа по своему номеру телефона — код придёт в WhatsApp.';
    if (el.saveBtn) el.saveBtn.textContent = 'Пригласить';

    el.staffForm.reset();
    el.staffId.value = '';
    el.fName.value = '';
    el.fPhone.value = '';
    clearFieldErrors();
    updatePhonePlaceholder();

    openModal(el.staffModal);
    requestAnimationFrame(() => el.fName.focus());
  }

  function openEditModal(id) {
    const s = state.staff.find((x) => x.id === id);
    if (!s) return;

    state.editingId = s.id;
    if (el.staffModalTitle) el.staffModalTitle.textContent = 'Редактировать сотрудника';
    if (el.staffModalSub) el.staffModalSub.textContent = 'Измените данные и сохраните.';
    if (el.saveBtn) el.saveBtn.textContent = 'Сохранить';

    el.staffId.value = s.id;
    el.fName.value = s.name || '';
    // Разбираем сохранённый нормализованный номер обратно в маску
    const digits = String(s.phone || '').replace(/\D/g, '');
    // Определяем страну по началу номера
    const detected = detectCountryFromDigits(digits);
    el.countrySelect.value = detected.value;
    const c = getSelectedCountry();
    const localDigits = digits.startsWith(c.code.replace('+', '')) ? digits.slice(c.code.length - 1) : digits;
    el.fPhone.value = applyMask(localDigits.slice(0, c.digits), c.pattern);

    clearFieldErrors();
    openModal(el.staffModal);
    requestAnimationFrame(() => el.fName.focus());
  }

  function detectCountryFromDigits(digits) {
    // Проверяем префиксы от длинных к коротким
    const tests = [
      { value: 'uz', prefix: '998' },
      { value: 'tm', prefix: '993' },
      { value: 'tj', prefix: '992' },
      { value: 'az', prefix: '994' },
      { value: 'by', prefix: '375' },
      { value: 'am', prefix: '374' },
      { value: 'md', prefix: '373' },
      { value: 'kg', prefix: '996' },
      { value: 'ru', prefix: '7' },
    ];
    for (const t of tests) {
      if (digits.startsWith(t.prefix)) {
        const opt = Array.from(el.countrySelect.options).find((o) => o.value === t.value);
        if (opt) return opt;
      }
    }
    return el.countrySelect.options[0];
  }

  function openDeleteModal(id) {
    const s = state.staff.find((x) => x.id === id);
    if (!s) return;
    state.deletingId = s.id;
    if (el.deleteName) el.deleteName.textContent = `Сотрудник «${s.name}» будет удалён.`;
    openModal(el.deleteModal);
  }

  async function confirmDelete() {
    const id = state.deletingId;
    if (!id) return;
    const s = state.staff.find((x) => x.id === id);

    if (el.confirmDeleteBtn) {
      el.confirmDeleteBtn.disabled = true;
      el.confirmDeleteBtn.textContent = 'Удаляем...';
    }

    try {
      const { db, doc, deleteDoc } = window.FB;
      await deleteDoc(doc(db, 'staff', id));
      state.deletingId = null;
      closeModal(el.deleteModal);
      if (s) showToast(`Сотрудник «${s.name}» удалён`);
    } catch (err) {
      console.error('[staff] delete:', err);
      showToast('Не удалось удалить сотрудника', true);
    } finally {
      if (el.confirmDeleteBtn) {
        el.confirmDeleteBtn.disabled = false;
        el.confirmDeleteBtn.textContent = 'Удалить';
      }
    }
  }

  async function toggleActive(id) {
    const s = state.staff.find((x) => x.id === id);
    if (!s) return;
    const newActive = s.active === false;

    try {
      const { db, doc, updateDoc, serverTimestamp } = window.FB;
      await updateDoc(doc(db, 'staff', id), {
        active: newActive,
        updatedAt: serverTimestamp(),
      });
      showToast(newActive ? `«${s.name}» разблокирован` : `«${s.name}» заблокирован`);
    } catch (err) {
      console.error('[staff] toggle:', err);
      showToast('Не удалось изменить статус', true);
    }
  }

  async function saveStaff(event) {
    event.preventDefault();
    if (!validateForm()) return;

    const name = el.fName.value.trim();
    const phoneNorm = normalizePhone();
    const phoneKey = phoneKeyFromNormalized(phoneNorm);

    if (el.saveBtn) {
      el.saveBtn.disabled = true;
      el.saveBtn.textContent = state.editingId ? 'Сохраняем...' : 'Приглашаем...';
    }

    try {
      const { db, doc, getDoc, setDoc, updateDoc, serverTimestamp } = window.FB;

      if (state.editingId) {
        // Редактирование
        await updateDoc(doc(db, 'staff', state.editingId), {
          name,
          updatedAt: serverTimestamp(),
        });
        showToast(`Сотрудник «${name}» обновлён`);
      } else {
        // Создание приглашения — проверим, не занят ли телефон
        const ref = doc(db, 'staff', phoneKey);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          if (data.businessId && data.businessId !== state.businessId) {
            setFieldError('fPhone', 'Этот номер уже привязан к другому бизнесу');
            if (el.saveBtn) {
              el.saveBtn.disabled = false;
              el.saveBtn.textContent = 'Пригласить';
            }
            return;
          }
          // Тот же бизнес — обновляем
          await updateDoc(ref, {
            name,
            active: true,
            updatedAt: serverTimestamp(),
          });
          showToast(`Сотрудник «${name}» обновлён`);
        } else {
          // Новое приглашение
          await setDoc(ref, {
            name,
            phone: phoneNorm,
            businessId: state.businessId,
            businessName: state.businessName,
            active: true,
            uid: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          showToast(`Приглашение для «${name}» создано`);
        }
      }

      closeModal(el.staffModal);
    } catch (err) {
      console.error('[staff] save:', err);
      showToast('Не удалось сохранить. Проверьте права.', true);
    } finally {
      if (el.saveBtn) {
        el.saveBtn.disabled = false;
        el.saveBtn.textContent = state.editingId ? 'Сохранить' : 'Пригласить';
      }
    }
  }

  // =========================================================
  // СОБЫТИЯ
  // =========================================================

  function bindEvents() {
    if (el.openAddBtn) el.openAddBtn.addEventListener('click', openAddModal);
    if (el.emptyAddBtn) el.emptyAddBtn.addEventListener('click', openAddModal);

    if (el.searchInput) el.searchInput.addEventListener('input', (e) => {
      state.search = e.target.value;
      renderTable();
    });

    if (el.staffBody) el.staffBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const row = btn.closest('tr[data-id]');
      if (!row) return;
      const id = row.dataset.id;
      const act = btn.dataset.act;
      if (act === 'edit') openEditModal(id);
      else if (act === 'toggle') toggleActive(id);
      else if (act === 'delete') openDeleteModal(id);
    });

    if (el.staffForm) el.staffForm.addEventListener('submit', saveStaff);
    if (el.confirmDeleteBtn) el.confirmDeleteBtn.addEventListener('click', confirmDelete);

    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]')) {
        const modal = e.target.closest('.modal');
        if (modal) closeModal(modal);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (el.staffModal && !el.staffModal.hidden) closeModal(el.staffModal);
      else if (el.deleteModal && !el.deleteModal.hidden) closeModal(el.deleteModal);
    });

    window.addEventListener('beforeunload', () => {
      if (state.unsubStaff) state.unsubStaff();
    });
  }

  // =========================================================
  // ИНИЦИАЛИЗАЦИЯ
  // =========================================================

  async function init() {
    const st = await waitForReady();
    if (!st) {
      console.warn('[staff] Не дождались businessId');
      return;
    }

    const role = st.profile?.role;
    state.isOwner = role === 'owner' || role === 'super_admin';

    if (!state.isOwner) {
      // Не владелец — показать заглушку
      if (el.mainWrap) el.mainWrap.hidden = true;
      if (el.permWarn) el.permWarn.hidden = false;
      return;
    }

    state.businessId = st.businessId;
    state.businessName = st.profile?.displayName || '';

    if (el.mainWrap) el.mainWrap.hidden = false;
    renderStats();

    // Подписка на staff записи этого бизнеса
    try {
      const { db, collection, query, where, onSnapshot } = window.FB;
      const q = query(
        collection(db, 'staff'),
        where('businessId', '==', state.businessId)
      );
      state.unsubStaff = onSnapshot(q, (snap) => {
        state.staff = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderStats();
        renderTable();
      }, (err) => {
        console.error('[staff] subscribe error:', err);
        showToast('Ошибка загрузки списка сотрудников', true);
      });
    } catch (err) {
      console.error('[staff] subscribe init:', err);
    }

    bindEvents();
    updatePhonePlaceholder();
    console.info('[staff] Подключено · бизнес:', state.businessId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
