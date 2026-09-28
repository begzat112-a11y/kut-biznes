/* =========================================================
   КУТ: БИЗНЕС — Матрица прав (permissions.js) · v1.0
   
   Granular RBAC как у Square:
   • permissions[] у каждого сотрудника
   • Иерархия: owner > manager > cashier
   • Manager не может повысить до owner
   • PIN-вход для быстрого переключения кассиров
   • hasPermission(perm) для UI-гейтинга
   Публичное API: window.KUT_PERMS
   ========================================================= */

(function () {
  'use strict';

  // =========================================================
  // ИЕРАРХИЯ
  // =========================================================
  const ROLE_HIERARCHY = {
    super_admin: 100,
    owner:       90,
    manager:     70,
    cashier:     40,
  };

  // Дефолтные права по роли
  const ROLE_DEFAULT_PERMISSIONS = {
    owner: [
      'pos.sell', 'pos.refund', 'pos.discount', 'pos.discount.unlimited',
      'pos.open_price', 'pos.split_payment',
      'stock.view', 'stock.edit', 'stock.view_cost', 'stock.view_margin',
      'stock.delete', 'stock.transfer',
      'debts.view', 'debts.edit', 'debts.delete',
      'reports.view', 'reports.profit', 'reports.cogs', 'reports.tax',
      'staff.view', 'staff.invite', 'staff.edit_permissions', 'staff.delete',
      'settings.view', 'settings.edit',
    ],
    manager: [
      'pos.sell', 'pos.refund', 'pos.discount', 'pos.open_price', 'pos.split_payment',
      'stock.view', 'stock.edit', 'stock.view_cost', 'stock.view_margin',
      'debts.view', 'debts.edit',
      'reports.view', 'reports.profit', 'reports.cogs',
      'staff.view', 'staff.invite',
    ],
    cashier: [
      'pos.sell', 'pos.split_payment',
      'stock.view',
      'debts.view',
    ],
  };

  // Полный каталог прав для UI
  const ALL_PERMISSIONS = [
    { id: 'pos.sell',              label: 'Продавать',           group: 'Касса' },
    { id: 'pos.refund',            label: 'Возвраты',            group: 'Касса' },
    { id: 'pos.discount',          label: 'Давать скидки',       group: 'Касса' },
    { id: 'pos.discount.unlimited',label: 'Скидка без лимита',   group: 'Касса' },
    { id: 'pos.open_price',        label: 'Открытая цена',       group: 'Касса' },
    { id: 'pos.split_payment',     label: 'Split-оплата',        group: 'Касса' },
    { id: 'stock.view',            label: 'Видеть склад',        group: 'Склад' },
    { id: 'stock.edit',            label: 'Редактировать товары',group: 'Склад' },
    { id: 'stock.view_cost',       label: '🔴 Видеть закупку',   group: 'Склад' },
    { id: 'stock.view_margin',     label: '🔴 Видеть маржу',     group: 'Склад' },
    { id: 'stock.delete',          label: 'Удалять товары',      group: 'Склад' },
    { id: 'stock.transfer',        label: 'Перевод между точками',group: 'Склад' },
    { id: 'debts.view',            label: 'Видеть долги',        group: 'Несие' },
    { id: 'debts.edit',            label: 'Редактировать долги', group: 'Несие' },
    { id: 'debts.delete',          label: 'Удалять долги',       group: 'Несие' },
    { id: 'reports.view',          label: 'Отчёты',              group: 'Аналитика' },
    { id: 'reports.profit',        label: '🔴 Видеть прибыль',   group: 'Аналитика' },
    { id: 'reports.cogs',          label: '🔴 Видеть COGS',      group: 'Аналитика' },
    { id: 'reports.tax',           label: 'Налоги',              group: 'Аналитика' },
    { id: 'staff.view',            label: 'Видеть сотрудников',  group: 'Команда' },
    { id: 'staff.invite',          label: 'Приглашать',          group: 'Команда' },
    { id: 'staff.edit_permissions',label: '🔴 Менять права',     group: 'Команда' },
    { id: 'staff.delete',          label: 'Удалять',             group: 'Команда' },
    { id: 'settings.view',         label: 'Настройки',           group: 'Настройки' },
    { id: 'settings.edit',         label: '🔴 Редактировать',    group: 'Настройки' },
  ];

  // =========================================================
  // ФУНКЦИИ ПРОВЕРКИ
  // =========================================================
  function getCurrentProfile() {
    return window.KUT?.getState?.()?.profile || null;
  }

  function hasPermission(perm) {
    const p = getCurrentProfile();
    if (!p) return false;
    if (p.role === 'super_admin') return true;
    if (Array.isArray(p.permissions) && p.permissions.includes('*')) return true;
    if (Array.isArray(p.permissions) && p.permissions.includes(perm)) return true;
    const defaults = ROLE_DEFAULT_PERMISSIONS[p.role] || [];
    return defaults.includes('*') || defaults.includes(perm);
  }

  function canManage(actor, target) {
    if (!actor || !target) return false;
    if (actor.uid === target.uid) return true;
    const a = ROLE_HIERARCHY[actor.role] || 0;
    const t = ROLE_HIERARCHY[target.role] || 0;
    return a > t;
  }

  function canGrantPermission(actor, target, perm) {
    if (!canManage(actor, target)) return false;
    if (actor.role === 'super_admin') return true;
    // Manager не может выдать права выше своих
    if (actor.role === 'manager') {
      const actorPerms = [
        ...ROLE_DEFAULT_PERMISSIONS.manager,
        ...(actor.permissions || []),
      ];
      return actorPerms.includes(perm) || actorPerms.includes('*');
    }
    // Owner может всё, кроме выдачи super_admin
    if (actor.role === 'owner') {
      return !perm.startsWith('super.');
    }
    return false;
  }

  // =========================================================
  // PIN-ХЕШИРОВАНИЕ (Web Crypto API)
  // =========================================================
  async function hashPin(pin) {
    const buf = new TextEncoder().encode(String(pin));
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function verifyPin(staffId, pin) {
    if (!window.FB?.db) return false;
    try {
      const { db, doc, getDoc } = window.FB;
      const snap = await getDoc(doc(db, 'staff', staffId));
      if (!snap.exists()) return false;
      const data = snap.data();
      if (!data.pinHash) return false;
      const h = await hashPin(pin);
      return h === data.pinHash;
    } catch (err) {
      console.error('[perms] verifyPin failed:', err);
      return false;
    }
  }

  // =========================================================
  // МОДАЛКА «МАТРИЦА ПРАВ»
  // =========================================================
  function openPermissionsModal(staffId) {
    if (!hasPermission('staff.edit_permissions')) {
      if (window.KUT?.toast) window.KUT.toast('Нет прав на изменение разрешений', true);
      return;
    }

    const st = window.KUT?.getState?.();
    const staff = (st.staff || []).find((s) => s.id === staffId);
    if (!staff) { toast('Сотрудник не найден', true); return; }

    const existing = document.getElementById('kutPermsModal');
    if (existing) existing.remove();

    const actor = getCurrentProfile();
    const currentPerms = new Set(
      staff.permissions && staff.permissions.length > 0
        ? staff.permissions
        : (ROLE_DEFAULT_PERMISSIONS[staff.role] || [])
    );

    const modal = document.createElement('div');
    modal.id = 'kutPermsModal';
    modal.className = 'kut-perms-modal';

    // Группировка
    const groups = {};
    ALL_PERMISSIONS.forEach((p) => {
      if (!groups[p.group]) groups[p.group] = [];
      groups[p.group].push(p);
    });

    const roleOptions = ['cashier', 'manager']; // owner только через super_admin
    if (actor.role === 'super_admin') roleOptions.push('owner');

    modal.innerHTML = `
      <div class="kut-perms-backdrop" data-close></div>
      <div class="kut-perms" role="dialog" aria-modal="true">
        <div class="kut-perms__head">
          <h3>Права доступа</h3>
          <button class="kut-perms__close" data-close type="button">✕</button>
        </div>

        <div class="kut-perms__staff">
          <div class="kut-perms__avatar">${esc(initials(staff.name))}</div>
          <div>
            <div class="kut-perms__name">${esc(staff.name || '—')}</div>
            <div class="kut-perms__phone">${esc(staff.phone || '—')}</div>
          </div>
        </div>

        <div class="kut-perms__role">
          <label>Роль</label>
          <div class="kut-perms__role-options">
            ${roleOptions.map((r) => `
              <button class="kut-perms__role-btn ${staff.role === r ? 'is-active' : ''}"
                      data-role="${r}" type="button">
                ${roleLabel(r)}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="kut-perms__groups">
          ${Object.entries(groups).map(([groupName, perms]) => `
            <div class="kut-perms__group">
              <div class="kut-perms__group-title">${esc(groupName)}</div>
              ${perms.map((p) => {
                const allowed = canGrantPermission(actor, staff, p.id);
                const active = currentPerms.has(p.id);
                return `
                  <label class="kut-perms__item ${allowed ? '' : 'is-disabled'}">
                    <input type="checkbox" data-perm="${p.id}" ${active ? 'checked' : ''} ${allowed ? '' : 'disabled'}>
                    <span class="kut-perms__item-label">${esc(p.label)}</span>
                  </label>`;
              }).join('')}
            </div>
          `).join('')}
        </div>

        <div class="kut-perms__actions">
          <button class="kut-perms__cancel" data-close type="button">Отмена</button>
          <button class="kut-perms__save" type="button">Сохранить</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    let selectedRole = staff.role;

    modal.querySelectorAll('[data-role]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedRole = btn.dataset.role;
        modal.querySelectorAll('[data-role]').forEach((b) =>
          b.classList.toggle('is-active', b === btn));
      });
    });

    modal.querySelectorAll('[data-close]').forEach((el) =>
      el.addEventListener('click', close));
    modal.querySelector('.kut-perms__save').addEventListener('click', async () => {
      const perms = [];
      modal.querySelectorAll('input[data-perm]:checked').forEach((cb) => {
        perms.push(cb.dataset.perm);
      });
      await savePermissions(staffId, selectedRole, perms);
      close();
    });

    function close() {
      modal.remove();
      document.body.style.overflow = '';
    }
  }

  async function savePermissions(staffId, role, permissions) {
    const actor = getCurrentProfile();
    if (!actor) return;

    // Проверка иерархии
    if (role === 'owner' && actor.role !== 'super_admin') {
      toast('Только супер-админ может назначить владельца', true);
      return;
    }
    if (role === 'manager' && !['owner', 'super_admin'].includes(actor.role)) {
      toast('Менеджер не может назначать менеджеров', true);
      return;
    }

    try {
      const { db, doc, updateDoc, serverTimestamp } = window.FB;
      await updateDoc(doc(db, 'staff', staffId), {
        role,
        permissions,
        updatedAt: serverTimestamp(),
      });
      toast('Права обновлены');
    } catch (err) {
      console.error('[perms] save failed:', err);
      toast('Не удалось сохранить', true);
    }
  }

  // =========================================================
  // PIN-ВХОД (быстрое переключение кассиров)
  // =========================================================
  function openPinModal(onSuccess) {
    const existing = document.getElementById('kutPinModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'kutPinModal';
    modal.className = 'kut-pin-modal';
    modal.innerHTML = `
      <div class="kut-pin-backdrop" data-close></div>
      <div class="kut-pin" role="dialog" aria-modal="true">
        <h3>Введите PIN</h3>
        <p class="kut-pin__sub">4 цифры</p>
        <div class="kut-pin__dots">
          ${[0,1,2,3].map((i) => `<span class="kut-pin__dot" data-idx="${i}"></span>`).join('')}
        </div>
        <div class="kut-pin__pad">
          ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k) => k === ''
            ? '<div></div>'
            : `<button class="kut-pin__key" data-key="${k}" type="button">${k}</button>`).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    let buf = '';
    const dots = modal.querySelectorAll('.kut-pin__dot');
    const update = () => {
      dots.forEach((d, i) => d.classList.toggle('is-filled', i < buf.length));
    };

    modal.querySelectorAll('.kut-pin__key').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const k = btn.dataset.key;
        if (k === '⌫') buf = buf.slice(0, -1);
        else if (buf.length < 4) buf += k;
        update();
        if (buf.length === 4) {
          // Ищем совпадение
          const st = window.KUT?.getState?.();
          const candidates = (st.staff || []).filter((s) => s.pinHash);
          let matched = null;
          for (const c of candidates) {
            if (await verifyPin(c.id, buf)) { matched = c; break; }
          }
          if (matched) {
            if (typeof onSuccess === 'function') onSuccess(matched);
            modal.remove();
          } else {
            modal.querySelector('.kut-pin__pad').animate(
              [{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
              { duration: 250 });
            buf = '';
            update();
            if (window.KUT?.toast) window.KUT.toast('Неверный PIN', true);
          }
        }
      });
    });

    modal.querySelectorAll('[data-close]').forEach((el) =>
      el.addEventListener('click', () => modal.remove()));

    function update() { /* hoisted */ }
  }

  // =========================================================
  // UI-ГЕЙТИНГ
  // =========================================================
  function applyUiGates() {
    // Скрываем элементы с data-perm, если нет права
    document.querySelectorAll('[data-perm]').forEach((el) => {
      const perm = el.dataset.perm;
      el.style.display = hasPermission(perm) ? '' : 'none';
    });

    // Скрываем маржу в stock.html для кассиров
    if (!hasPermission('stock.view_margin')) {
      document.querySelectorAll('[data-label="Маржа"]').forEach((el) => {
        el.style.display = 'none';
      });
    }
    if (!hasPermission('stock.view_cost')) {
      document.querySelectorAll('[data-label="Себестоимость"]').forEach((el) => {
        el.style.display = 'none';
      });
    }
  }

  // =========================================================
  // ИНЪЕКЦИЯ КНОПКИ "ПРАВА" в staff.html
  // =========================================================
  function injectPermsButtons() {
    const page = (location.pathname.split('/').pop() || '').replace('.html', '');
    if (page !== 'staff') return;
    if (!hasPermission('staff.edit_permissions')) return;

    // Добавляем иконку в row-actions каждой строки
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.staff-table tbody tr[data-id]').forEach((row) => {
        if (row.querySelector('[data-act="perms"]')) return;
        const actions = row.querySelector('.row-actions');
        if (!actions) return;
        const btn = document.createElement('button');
        btn.className = 'icon-btn';
        btn.type = 'button';
        btn.title = 'Права';
        btn.dataset.act = 'perms';
        btn.innerHTML = '🔐';
        btn.addEventListener('click', () => openPermissionsModal(row.dataset.id));
        actions.insertBefore(btn, actions.firstChild);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // =========================================================
  // УТИЛИТЫ
  // =========================================================
  function roleLabel(role) {
    return ({ owner: 'Владелец', manager: 'Менеджер', cashier: 'Кассир' })[role] || role;
  }
  function initials(name) {
    const p = String(name || '').trim().split(/\s+/);
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return ((p[0][0] || '') + (p[1][0] || '')).toUpperCase();
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg, err) {
    if (window.KUT?.toast) window.KUT.toast(msg, err);
    else console.log('[perms]', msg);
  }

  // =========================================================
  // СТИЛИ
  // =========================================================
  function injectStyles() {
    if (document.getElementById('kut-perms-styles')) return;
    const style = document.createElement('style');
    style.id = 'kut-perms-styles';
    style.textContent = `
      .kut-perms-modal { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 12px; }
      .kut-perms-backdrop { position: absolute; inset: 0; background: rgba(2,8,18,.75); backdrop-filter: blur(8px); }
      .kut-perms { position: relative; width: 100%; max-width: 500px; max-height: 96dvh; display: flex; flex-direction: column; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55); color: var(--kut-text-1, #F1F5F9); overflow: hidden; }
      .kut-perms__head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--kut-border, rgba(255,255,255,.08)); flex-shrink: 0; }
      .kut-perms__head h3 { margin: 0; font-size: 18px; font-weight: 800; }
      .kut-perms__close { width: 36px; height: 36px; display: grid; place-items: center; background: var(--kut-surface-2, #273449); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 10px; color: var(--kut-text-2, #94A3B8); cursor: pointer; font-size: 16px; }
      .kut-perms__staff { display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: var(--kut-surface-2, #273449); margin: 12px 16px 0; border-radius: 14px; }
      .kut-perms__avatar { width: 44px; height: 44px; display: grid; place-items: center; background: linear-gradient(135deg, #E7C14A, #B88F1D); color: #06150F; border-radius: 50%; font-size: 15px; font-weight: 800; }
      .kut-perms__name { font-size: 15px; font-weight: 700; }
      .kut-perms__phone { font-size: 12px; color: var(--kut-text-3, #64748B); margin-top: 2px; }
      .kut-perms__role { padding: 14px 20px 0; }
      .kut-perms__role > label { display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--kut-text-3, #64748B); margin-bottom: 8px; }
      .kut-perms__role-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; }
      .kut-perms__role-btn { padding: 12px; background: var(--kut-surface-2, #273449); border: 1.5px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 12px; color: var(--kut-text-1, #F1F5F9); font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-perms__role-btn.is-active { background: linear-gradient(135deg, #E7C14A, #B88F1D); color: #06150F; border-color: transparent; }
      .kut-perms__groups { flex: 1; overflow-y: auto; padding: 14px 20px; min-height: 0; }
      .kut-perms__group { margin-bottom: 14px; }
      .kut-perms__group-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--kut-gold-deep, #E4C56A); margin-bottom: 8px; }
      .kut-perms__item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; cursor: pointer; transition: background .15s; -webkit-tap-highlight-color: transparent; }
      .kut-perms__item:hover { background: rgba(255,255,255,.04); }
      .kut-perms__item.is-disabled { opacity: .4; cursor: not-allowed; }
      .kut-perms__item input[type="checkbox"] { width: 20px; height: 20px; accent-color: #10B981; cursor: pointer; }
      .kut-perms__item-label { font-size: 13px; font-weight: 600; }
      .kut-perms__actions { display: flex; gap: 10px; padding: 14px 20px 18px; border-top: 1px solid var(--kut-border, rgba(255,255,255,.08)); flex-shrink: 0; }
      .kut-perms__actions button { flex: 1; padding: 14px; border-radius: 12px; border: none; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-perms__cancel { background: var(--kut-surface-2, #273449); color: var(--kut-text-1, #F1F5F9); }
      .kut-perms__save { background: linear-gradient(135deg, #10B981, #059669); color: #fff; }

      /* PIN */
      .kut-pin-modal { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 16px; }
      .kut-pin-backdrop { position: absolute; inset: 0; background: rgba(2,8,18,.8); backdrop-filter: blur(8px); }
      .kut-pin { position: relative; width: 100%; max-width: 320px; padding: 24px; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55); color: var(--kut-text-1, #F1F5F9); text-align: center; }
      .kut-pin h3 { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
      .kut-pin__sub { margin: 0 0 20px; font-size: 13px; color: var(--kut-text-3, #64748B); }
      .kut-pin__dots { display: flex; gap: 14px; justify-content: center; margin-bottom: 20px; }
      .kut-pin__dot { width: 16px; height: 16px; border: 2px solid var(--kut-border, rgba(255,255,255,.2)); border-radius: 50%; transition: background .15s; }
      .kut-pin__dot.is-filled { background: #10B981; border-color: #10B981; box-shadow: 0 0 12px rgba(16,185,129,.5); }
      .kut-p
