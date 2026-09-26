/* =========================================================
   КУТ: БИЗНЕС — Модуль «Сотрудники» (staff.js) · Firebase v2
   + отчёт «Продажи» по кассирам
   + роль manager при приглашении
   ========================================================= */

(function () {
  'use strict';

  // =========================================================
  // СОСТОЯНИЕ
  // =========================================================
  const state = {
    staff: [],
    sales: [],
    searchStaff: '',
    searchSales: '',
    period: 'today',
    editingId: null,
    deletingId: null,
    businessId: null,
    businessName: '',
    myRole: '',
    unsubStaff: null,
    unsubSales: null,
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

    tabs:          document.querySelectorAll('.tab[data-tab]'),
    paneStaff:     $('#paneStaff'),
    paneSales:     $('#paneSales'),
    tabStaffCount: $('#tabStaffCount'),
    tabSalesCount: $('#tabSalesCount'),

    // Staff
    searchStaffInput: $('#searchStaffInput'),
    statTotal:     $('#statTotal'),
    statActive:    $('#statActive'),
    statPending:   $('#statPending'),
    staffTable:    $('#staffTable'),
    staffBody:     $('#staffBody'),
    staffEmpty:    $('#staffEmpty'),

    // Sales
    salesTotalRevenue: $('#salesTotalRevenue'),
    salesTotalChecks:  $('#salesTotalChecks'),
    salesAvgCheck:     $('#salesAvgCheck'),
    searchSalesInput:  $('#searchSalesInput'),
    periodChips:       $('#periodChips'),
    salesTable:        $('#salesTable'),
    salesBody:         $('#salesBody'),
    salesEmpty:        $('#salesEmpty'),

    // Модалки
    staffModal:      $('#staffModal'),
    staffModalTitle: $('#staffModalTitle'),
    staffModalSub:   $('#staffModalSub'),
    staffForm:       $('#staffForm'),
    staffId:         $('#staffId'),
    fName:           $('#fName'),
    countrySelect:   $('#countrySelect'),
    fPhone:          $('#fPhone'),
    fRole:           $('#fRole'),
    roleOptions:     $('#roleOptions'),
    saveBtn:         $('#saveBtn'),

    deleteModal:     $('#deleteModal'),
    deleteName:      $('#deleteName'),
    confirmDeleteBtn:$('#confirmDeleteBtn'),
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

  function formatDateTime(ts) {
    const d = toDate(ts);
    if (!d) return '—';
    const z = (n) => String(n).padStart(2, '0');
    return `${z(d.getDate())}.${z(d.getMonth() + 1)} ${z(d.getHours())}:${z(d.getMinutes())}`;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2);
    return (parts[0][0] || '') + (parts[1][0] || '');
  }

  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);

  function roleLabel(role) {
    switch (role) {
      case 'owner':   return 'Владелец';
      case 'manager': return 'Менеджер';
      case 'cashier': return 'Кассир';
      default:        return role || '—';
    }
  }
  function roleClass(role) {
    if (role === 'owner')   return 'role-badge--owner';
    if (role === 'manager') return 'role-badge--manager';
    return 'role-badge--cashier';
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

  function detectCountryFromDigits(digits) {
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

  el.fPhone.addEventListener('input', (e) => {
    e.target.value = formatPhoneInput(e.target.value);
  });
  el.countrySelect.addEventListener('change', () => {
    updatePhonePlaceholder();
    el.fPhone.value = formatPhoneInput(el.fPhone.value);
    setFieldError('fPhone', '');
  });

  // =========================================================
  // РОЛЬ
  // =========================================================
  el.roleOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.role-option');
    if (!btn) return;
    const role = btn.dataset.role;
    el.fRole.value = role;
    el.roleOptions.querySelectorAll('.role-option').forEach((b) => {
      const active = b.dataset.role === role;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-checked', String(active));
    });
  });

  function setRoleUI(role) {
    el.fRole.value = role;
    el.roleOptions.querySelectorAll('.role-option').forEach((b) => {
      const active = b.dataset.role === role;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-checked', String(active));
    });
  }

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
          hint.textContent = 'На этот номер сотрудник получит код в WhatsApp.';
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
    if (name.length < 2) { setFieldError('fName', 'Имя минимум 2 символа'); ok = false; }
    if (!isValidPhoneValue()) {
      const c = getSelectedCountry();
      setFieldError('fPhone', `Введите ${c.digits} цифр номера`);
      ok = false;
    }
    return ok;
  }

  // =========================================================
  // СТАТИСТИКА СОТРУДНИКОВ
  // =========================================================
  function renderStaffStats() {
    const list = state.staff;
    const total = list.length;
    const active = list.filter((s) => s.active !== false && s.uid).length;
    const pending = list.filter((s) => !s.uid).length;

    if (el.statTotal) el.statTotal.innerHTML = `${total}<small>чел.</small>`;
    if (el.statActive) el.statActive.innerHTML = `${active}<small>чел.</small>`;
    if (el.statPending) el.statPending.innerHTML = `${pending}<small>чел.</small>`;
    if (el.tabStaffCount) el.tabStaffCount.textContent = String(total);
  }

  // =========================================================
  // ТАБЛИЦА СОТРУДНИКОВ
  // =========================================================
  function getVisibleStaff() {
    const q = state.searchStaff.trim().toLowerCase();
    return state.staff
      .filter((s) => {
        if (!q) return true;
        return String(s.name || '').toLowerCase().includes(q) ||
               String(s.phone || '').toLowerCase().includes(q);
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  }

  function renderStaffTable() {
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
        <tr><td colspan="6" style="text-align:center; padding:40px 16px; color:var(--kut-muted);">
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

      const role = s.role || 'cashier';
      const avatarCls = role === 'manager' ? 'emp__avatar--gold'
                     : role === 'cashier' ? 'emp__avatar--cashier' : '';

      const toggleTitle = isBlocked ? 'Разблокировать' : 'Заблокировать';
      const toggleIcon = isBlocked ? '🔓' : '🚫';
      const toggleCls = isBlocked ? 'icon-btn--ok' : 'icon-btn--warn';

      return `
        <tr data-id="${escapeHtml(s.id)}">
          <td data-label="Сотрудник">
            <div class="emp">
              <div class="emp__avatar ${avatarCls}">${escapeHtml(initials(s.name))}</div>
              <div class="emp__text">
                <div class="emp__name">${escapeHtml(s.name || '—')}</div>
                <div class="emp__sub">${escapeHtml(roleLabel(role))}</div>
              </div>
            </div>
          </td>
          <td data-label="Телефон">
            ${s.phone ? `<a class="phone-link" href="tel:${escapeHtml(s.phone)}">📞 ${escapeHtml(s.phone)}</a>` : '—'}
          </td>
          <td data-label="Роль">
            <span class="role-badge ${roleClass(role)}">${escapeHtml(roleLabel(role))}</span>
          </td>
          <td data-label="Статус">
            <span class="badge ${statusCls}">
              <span class="badge__dot"></span>
              ${statusTxt}
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
  // ОТЧЁТ ПО ПРОДАЖАМ
  // =========================================================
  function periodStart(period) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'today') return d.getTime();
    if (period === 'week')  return d.getTime() - 6 * 24 * 3600 * 1000;
    if (period === 'month') return d.getTime() - 29 * 24 * 3600 * 1000;
    return 0;
  }

  function getSalesInPeriod() {
    const start = periodStart(state.period);
    return (state.sales || []).filter((s) => {
      const t = toDate(s.createdAt)?.getTime() || 0;
      return t >= start;
    });
  }

  function aggregateByCashier() {
    const sales = getSalesInPeriod();
    const map = new Map();

    sales.forEach((s) => {
      const uid = s.cashierUid || '__unknown__';
      const name = s.cashierName || 'Без имени';
      const role = s.cashierRole || 'cashier';
      const amount = Number(s.total) || 0;

      if (!map.has(uid)) {
        map.set(uid, {
          uid, name, role,
          count: 0,
          sum: 0,
          lastAt: 0,
        });
      }
      const entry = map.get(uid);
      entry.count += 1;
      entry.sum += amount;
      const t = toDate(s.createdAt)?.getTime() || 0;
      if (t > entry.lastAt) entry.lastAt = t;
    });

    return Array.from(map.values()).sort((a, b) => b.sum - a.sum);
  }

  function renderSalesStats() {
    const sales = getSalesInPeriod();
    const totalSum = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
    const totalCount = sales.length;
    const avg = totalCount > 0 ? totalSum / totalCount : 0;

    if (el.salesTotalRevenue) el.salesTotalRevenue.innerHTML = `${fmt(Math.round(totalSum))}<small>KGS</small>`;
    if (el.salesTotalChecks)  el.salesTotalChecks.innerHTML  = `${fmt(totalCount)}<small>шт.</small>`;
    if (el.salesAvgCheck)     el.salesAvgCheck.innerHTML     = `${fmt(Math.round(avg))}<small>KGS</small>`;
    if (el.tabSalesCount)     el.tabSalesCount.textContent   = String(totalCount);
  }

  function renderSalesTable() {
    if (!el.salesBody) return;
    const q = state.searchSales.trim().toLowerCase();
    const rows = aggregateByCashier()
      .filter((r) => !q || r.name.toLowerCase().includes(q));

    if (rows.length === 0) {
      el.salesTable.hidden = true;
      el.salesEmpty.hidden = false;
      el.salesBody.innerHTML = '';
      return;
    }

    el.salesTable.hidden = false;
    el.salesEmpty.hidden = true;

    const totalSum = rows.reduce((s, r) => s + r.sum, 0);
    const totalCount = rows.reduce((s, r) => s + r.count, 0);

    el.salesBody.innerHTML = rows.map((r) => {
      const avg = r.count > 0 ? r.sum / r.count : 0;
      const avatarCls = r.role === 'manager' ? 'emp__avatar--gold'
                     : r.role === 'cashier' ? 'emp__avatar--cashier' : '';
      return `
        <tr>
          <td data-label="Кассир">
            <div class="emp">
              <div class="emp__avatar ${avatarCls}">${escapeHtml(initials(r.name))}</div>
              <div class="emp__text">
                <div class="emp__name">${escapeHtml(r.name)}</div>
                <div class="emp__sub">UID: ${escapeHtml(r.uid.substring(0, 8))}…</div>
              </div>
            </div>
          </td>
          <td data-label="Роль">
            <span class="role-badge ${roleClass(r.role)}">${escapeHtml(roleLabel(r.role))}</span>
          </td>
          <td data-label="Чеков"><span class="num">${fmt(r.count)}</span></td>
          <td data-label="Сумма"><span class="num num--money">${fmt(Math.round(r.sum))} KGS</span></td>
          <td data-label="Средний чек"><span class="num num--muted">${fmt(Math.round(avg))} KGS</span></td>
          <td data-label="Последняя продажа">${r.lastAt ? formatDateTime(r.lastAt) : '—'}</td>
        </tr>`;
    }).join('') + `
      <tr class="is-total">
        <td data-label="Кассир">ИТОГО</td>
        <td data-label="Роль"></td>
        <td data-label="Чеков"><span class="num">${fmt(totalCount)}</span></td>
        <td data-label="Сумма"><span class="num num--money">${fmt(Math.round(totalSum))} KGS</span></td>
        <td data-label="Средний чек"></td>
        <td data-label="Последняя продажа"></td>
      </tr>`;
  }

  // =========================================================
  // ПЕРЕКЛЮЧЕНИЕ ТАБОВ
  // =========================================================
  function bindTabs() {
    el.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        el.tabs.forEach((t) => {
          const active = t.dataset.tab === target;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', String(active));
        });
        el.paneStaff.classList.toggle('is-active', target === 'staff');
        el.paneSales.classList.toggle('is-active', target === 'sales');
      });
    });
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
  // CRUD
  // =========================================================
  function openAddModal() {
    state.editingId = null;
    if (el.staffModalTitle) el.staffModalTitle.textContent = 'Пригласить сотрудника';
    if (el.staffModalSub) el.staffModalSub.textContent = 'Сотрудник войдёт на странице входа по своему номеру телефона — код придёт в WhatsApp.';
    if (el.saveBtn) el.saveBtn.textContent = 'Пригласить';

    el.staffForm.reset();
    el.staffId.value = '';
    el.fName.value = '';
    el.fPhone.value = '';
    setRoleUI('cashier');
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
    const digits = String(s.phone || '').replace(/\D/g, '');
    const detected = detectCountryFromDigits(digits);
    el.countrySelect.value = detected.value;
    const c = getSelectedCountry();
    const localDigits = digits.startsWith(c.code.replace('+', '')) ? digits.slice(c.code.length - 1) : digits;
    el.fPhone.value = applyMask(localDigits.slice(0, c.digits), c.pattern);
    setRoleUI(s.role || 'cashier');

    clearFieldErrors();
    openModal(el.staffModal);
    requestAnimationFrame(() => el.fName.focus());
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
      await updateDoc(doc(db, 'staff', id), { active: newActive, updatedAt: serverTimestamp() });
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
    const phoneKey = phoneNorm.replace(/\D/g, '');
    const role = el.fRole.value || 'cashier';

    if (el.saveBtn) {
      el.saveBtn.disabled = true;
      el.saveBtn.textContent = state.editingId ? 'Сохраняем...' : 'Приглашаем...';
    }

    try {
      const { db, doc, getDoc, setDoc, updateDoc, serverTimestamp } = window.FB;

      if (state.editingId) {
        await updateDoc(doc(db, 'staff', state.editingId), {
          name, role,
          updatedAt: serverTimestamp(),
        });
        showToast(`Сотрудник «${name}» обновлён`);
      } else {
        const ref = doc(db, 'staff', phoneKey);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.businessId && data.businessId !== state.businessId) {
            setFieldError('fPhone', 'Этот номер уже привязан к другому бизнесу');
            if (el.saveBtn) { el.saveBtn.disabled = false; el.saveBtn.textContent = 'Пригласить'; }
            return;
          }
          await updateDoc(ref, { name, role, active: true, updatedAt: serverTimestamp() });
          showToast(`Сотрудник «${name}» обновлён`);
        } else {
          await setDoc(ref, {
            name,
            phone: phoneNorm,
            role,
            businessId: state.businessId,
            businessName: state.businessName,
            active: true,
            uid: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          showToast(`Приглашение для «${name}» (${roleLabel(role)}) создано`);
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

    if (el.searchStaffInput) el.searchStaffInput.addEventListener('input', (e) => {
      state.searchStaff = e.target.value;
      renderStaffTable();
    });

    if (el.searchSalesInput) el.searchSalesInput.addEventListener('input', (e) => {
      state.searchSales = e.target.value;
      renderSalesTable();
    });

    if (el.periodChips) el.periodChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.period-chip');
      if (!chip) return;
      state.period = chip.dataset.period;
      el.periodChips.querySelectorAll('.period-chip').forEach((c) => {
        c.classList.toggle('is-active', c.dataset.period === state.period);
      });
      renderSalesStats();
      renderSalesTable();
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
      if (state.unsubSales) state.unsubSales();
    });
  }

  // =========================================================
  // ИНИЦИАЛИЗАЦИЯ
  // =========================================================
  async function init() {
    const st = await waitForReady();
    if (!st) { console.warn('[staff] Не дождались businessId'); return; }

    state.myRole = st.profile?.role || '';
    const allowed = state.myRole === 'owner' || state.myRole === 'manager';

    if (!allowed) {
      if (el.mainWrap) el.mainWrap.hidden = true;
      if (el.permWarn) el.permWarn.hidden = false;
      return;
    }

    state.businessId = st.businessId;
    state.businessName = st.profile?.displayName || '';

    if (el.mainWrap) el.mainWrap.hidden = false;
    renderStaffStats();

    // Подписка на staff
    try {
      const { db, collection, query, where, onSnapshot } = window.FB;
      const q = query(
        collection(db, 'staff'),
        where('businessId', '==', state.businessId)
      );
      state.unsubStaff = onSnapshot(q, (snap) => {
        state.staff = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderStaffStats();
        renderStaffTable();
      }, (err) => {
        console.error('[staff] subscribe error:', err);
        showToast('Ошибка загрузки списка сотрудников', true);
      });

      // Подписка на продажи — все sales этого бизнеса
      const salesRef = collection(db, 'businesses', state.businessId, 'sales');
      state.unsubSales = onSnapshot(salesRef, (snap) => {
        state.sales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderSalesStats();
        renderSalesTable();
      }, (err) => {
        console.error('[staff] sales subscribe error:', err);
      });
    } catch (err) {
      console.error('[staff] subscribe init:', err);
    }

    bindTabs();
    bindEvents();
    updatePhonePlaceholder();

    console.info('[staff] Подключено · бизнес:', state.businessId, '· роль:', state.myRole);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
