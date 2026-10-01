/* =========================================================
   NexusBiz — Смены и отчёты (shifts.js) · v1.2
   
   Square-style Cash Management:
   • Открытие смены → ввод начальной кассы
   • Закрытие смены → пересчёт, ожидаемое vs фактическое
   • X-отчёт (промежуточный, без закрытия)
   • Z-отчёт (финальный, при закрытии)
   • Разбивка по кассирам, оплатам, нал/безнал
   • Автосохранение в shifts/{shiftId}
   • Использует KUT_CART.openNumpad, если он доступен
   • Совместим с firestore.rules (updatedAt, openedByUid)
   Публичное API: window.KUT_SHIFTS
   ========================================================= */

(function () {
  'use strict';

  const state = {
    current: null,
    history: [],
    unsub: null,
  };

  const $ = (s) => document.querySelector(s);
  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');

  function toast(msg, err) {
    if (window.KUT?.toast) window.KUT.toast(msg, err);
    else console.log('[shifts]', msg);
  }

  function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDateTime(d) {
    if (!d) return '—';
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function promptNumpad({ title, subtitle, value, allowDecimal }) {
    if (window.KUT_CART?.openNumpad) {
      return new Promise((resolve) => {
        let resolved = false;
        window.KUT_CART.openNumpad({
          title: title + (subtitle ? ' · ' + subtitle : ''),
          value: String(value || '0'),
          allowDecimal: allowDecimal !== false,
          onConfirm: (v) => {
            if (!resolved) { resolved = true; resolve(Number(v) || 0); }
          },
        });
        const check = setInterval(() => {
          if (!document.getElementById('kutNumpadModal') && !resolved) {
            clearInterval(check);
            setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, 80);
          }
        }, 200);
        setTimeout(() => clearInterval(check), 60000);
      });
    }

    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'kut-numpad-modal';
      modal.innerHTML = `
        <div class="kut-numpad-backdrop"></div>
        <div class="kut-numpad" role="dialog" aria-modal="true">
          <div class="kut-numpad__title">${esc(title)}</div>
          ${subtitle ? `<div class="kut-numpad__subtitle">${esc(subtitle)}</div>` : ''}
          <div class="kut-numpad__display" id="kutNumpadDisplay">${esc(value || '0')}</div>
          <div class="kut-numpad__grid">
            ${[1,2,3,4,5,6,7,8,9, allowDecimal ? '.' : '', 0, '⌫']
              .map((k) => k === '' ? '<div></div>' : `<button class="kut-numpad__key" data-key="${k}" type="button">${k}</button>`).join('')}
          </div>
          <div class="kut-numpad__actions">
            <button class="kut-numpad__cancel" type="button">Отмена</button>
            <button class="kut-numpad__confirm" type="button">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document.body.style.overflow = 'hidden';

      let buf = String(value || '0');
      const display = modal.querySelector('#kutNumpadDisplay');
      const update = () => { display.textContent = buf; };

      modal.querySelectorAll('.kut-numpad__key').forEach((btn) => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.key;
          if (k === '⌫') buf = buf.slice(0, -1) || '0';
          else if (k === '.') { if (!buf.includes('.') && allowDecimal) buf += '.'; }
          else { if (buf === '0') buf = k; else if (buf.length < 12) buf += k; }
          update();
        });
      });

      const close = (v) => {
        modal.remove();
        document.body.style.overflow = '';
        resolve(v);
      };
      modal.querySelector('.kut-numpad-backdrop').addEventListener('click', () => close(null));
      modal.querySelector('.kut-numpad__cancel').addEventListener('click', () => close(null));
      modal.querySelector('.kut-numpad__confirm').addEventListener('click', () => close(Number(buf) || 0));
    });
  }

  async function openShift() {
    if (state.current) { toast('Смена уже открыта', true); return; }

    const openingBalance = await promptNumpad({
      title: 'Начальная касса',
      subtitle: 'Сколько наличных в ящике?',
      value: '0',
      allowDecimal: true,
    });
    if (openingBalance === null) return;

    const st = window.KUT?.getState?.();
    const bizId = window.FB?.getWriteBusinessId?.() || window.FB?.getBusinessId?.();
    if (!bizId) { toast('Нет активного бизнеса', true); return; }

    const profile = st?.profile || {};
    const { db, collection, addDoc, serverTimestamp } = window.FB;

    try {
      const ref = await addDoc(collection(db, 'businesses', bizId, 'shifts'), {
        status: 'open',
        openedByUid: profile.uid || '',
        openedByName: profile.displayName || profile.email || 'Сотрудник',
        openedAt: serverTimestamp(),
        openingBalance: Number(openingBalance) || 0,
        businessId: bizId,
        closedAt: null,
        closedByUid: null,
        closingBalance: null,
      });
      toast('Смена открыта');
      await loadCurrentShift();
      render();
      return ref.id;
    } catch (err) {
      console.error('[shifts] open failed:', err);
      toast('Не удалось открыть смену: ' + (err.code || err.message), true);
      return null;
    }
  }

  async function closeShift() {
    if (!state.current) { toast('Нет открытой смены', true); return; }

    const report = buildReport(state.current);
    const closingBalance = await openCloseModal(report);
    if (closingBalance === null) return;

    const st = window.KUT?.getState?.();
    const bizId = window.FB?.getWriteBusinessId?.() || window.FB?.getBusinessId?.();
    const profile = st?.profile || {};

    try {
      const { db, doc, updateDoc, serverTimestamp } = window.FB;
      await updateDoc(doc(db, 'businesses', bizId, 'shifts', state.current.id), {
        status: 'closed',
        closedAt: serverTimestamp(),
        closedByUid: profile.uid || '',
        closedByName: profile.displayName || profile.email || '',
        closingBalance: Number(closingBalance) || 0,
        report,
        updatedAt: serverTimestamp(),
      });
      toast('Смена закрыта');
      state.current = null;
      await loadCurrentShift();
      render();
    } catch (err) {
      console.error('[shifts] close failed:', err);
      toast('Не удалось закрыть смену: ' + (err.code || err.message), true);
    }
  }

  async function loadCurrentShift() {
    const bizId = window.FB?.getWriteBusinessId?.() || window.FB?.getBusinessId?.();
    if (!bizId || !window.FB?.db) return;

    try {
      const { db, collection, query, where, orderBy, limit, getDocs } = window.FB;
      const q = query(
        collection(db, 'businesses', bizId, 'shifts'),
        where('status', '==', 'open'),
        orderBy('openedAt', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      state.current = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (err) {
      console.warn('[shifts] load failed:', err);
      state.current = null;
    }
  }

  function buildReport(shift) {
    const sales = window.KUT?.getSales?.() || [];
    const shiftStart = toDate(shift.openedAt)?.getTime() || 0;

    const shiftSales = sales.filter((s) => {
      const t = toDate(s.createdAt)?.getTime() || 0;
      return t >= shiftStart;
    });

    const byPayment = { cash: 0, card: 0, wallet: 0, qr: 0, debt: 0, refund: 0 };
    const byCashier = new Map();
    let totalRevenue = 0;
    let totalRefund = 0;
    let totalCount = 0;
    let refundCount = 0;

    shiftSales.forEach((s) => {
      const total = Number(s.totalSum ?? s.total) || 0;
      const isRefund = s.mode === 'refund';

      if (isRefund) {
        totalRefund += Math.abs(total);
        refundCount += 1;
        byPayment.refund += Math.abs(total);
      } else {
        totalRevenue += total;
        totalCount += 1;
      }

      if (Array.isArray(s.payments) && s.payments.length > 0) {
        s.payments.forEach((p) => {
          const m = p.method || 'cash';
          byPayment[m] = (byPayment[m] || 0) + (isRefund ? -Number(p.amount || 0) : Number(p.amount || 0));
        });
      } else if (s.paymentMethod && s.paymentMethod !== 'split') {
        const m = s.paymentMethod;
        byPayment[m] = (byPayment[m] || 0) + (isRefund ? -total : total);
      }

      const key = s.cashierUid || '__unknown__';
      if (!byCashier.has(key)) {
        byCashier.set(key, {
          uid: key,
          name: s.cashierName || 'Сотрудник',
          revenue: 0,
          count: 0,
        });
      }
      const c = byCashier.get(key);
      if (!isRefund) {
        c.revenue += total;
        c.count += 1;
      } else {
        c.revenue -= Math.abs(total);
      }
    });

    const opening = Number(shift.openingBalance) || 0;
    const cashIn = byPayment.cash || 0;
    const expectedCash = opening + cashIn;
    const netRevenue = totalRevenue - totalRefund;

    return {
      shiftId: shift.id,
      openedAt: shift.openedAt,
      openedByName: shift.openedByName || '',
      openingBalance: opening,
      totalRevenue,
      totalRefund,
      netRevenue,
      totalCount,
      refundCount,
      byPayment,
      byCashier: Array.from(byCashier.values()).sort((a, b) => b.revenue - a.revenue),
      expectedCash,
      generatedAt: new Date(),
    };
  }

  function showXReport() {
    if (!state.current) { toast('Смена не открыта', true); return; }
    const report = buildReport(state.current);
    renderReportModal(report);
  }

  function openCloseModal(report) {
    return new Promise((resolve) => {
      const existing = document.getElementById('kutShiftCloseModal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'kutShiftCloseModal';
      modal.className = 'kut-shift-modal';

      modal.innerHTML = `
        <div class="kut-shift-backdrop" data-cancel></div>
        <div class="kut-shift" role="dialog" aria-modal="true">
          <div class="kut-shift__head">
            <h3>Закрытие смены</h3>
            <button class="kut-shift__close" data-cancel type="button">✕</button>
          </div>

          <div class="kut-shift__body">
            ${renderReportHtml(report)}

            <div class="kut-shift__field">
              <label>Фактическая касса (пересчёт)</label>
              <input type="number" inputmode="decimal" id="kutClosingInput"
                     placeholder="${report.expectedCash.toFixed(2)}" step="0.01" min="0">
              <div class="kut-shift__hint">Ожидается: ${fmt(report.expectedCash)} KGS</div>
              <div class="kut-shift__diff" id="kutClosingDiff"></div>
            </div>
          </div>

          <div class="kut-shift__actions">
            <button class="kut-shift__cancel" data-cancel type="button">Отмена</button>
            <button class="kut-shift__confirm" type="button">Закрыть смену</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document.body.style.overflow = 'hidden';

      const input = modal.querySelector('#kutClosingInput');
      const diffEl = modal.querySelector('#kutClosingDiff');

      input.addEventListener('input', () => {
        const v = Number(input.value) || 0;
        const diff = v - report.expectedCash;
        if (!input.value) { diffEl.textContent = ''; diffEl.className = 'kut-shift__diff'; return; }
        if (Math.abs(diff) < 0.01) {
          diffEl.textContent = '✓ Совпадает';
          diffEl.className = 'kut-shift__diff is-ok';
        } else if (diff > 0) {
          diffEl.textContent = `Излишек: +${fmt(diff)} KGS`;
          diffEl.className = 'kut-shift__diff is-warn';
        } else {
          diffEl.textContent = `Недостача: ${fmt(diff)} KGS`;
          diffEl.className = 'kut-shift__diff is-error';
        }
      });

      input.focus();

      const close = (val) => {
        modal.remove();
        document.body.style.overflow = '';
        resolve(val);
      };

      modal.querySelectorAll('[data-cancel]').forEach((el) =>
        el.addEventListener('click', () => close(null)));

      modal.querySelector('.kut-shift__confirm').addEventListener('click', () => {
        const v = Number(input.value);
        if (!input.value || isNaN(v) || v < 0) {
          toast('Введите фактическую сумму', true);
          return;
        }
        close(v);
      });
    });
  }

  function renderReportHtml(r) {
    const opened = toDate(r.openedAt);
    return `
      <div class="kut-shift__info">
        <div class="kut-shift__info-row"><span>Открыта</span><strong>${fmtDateTime(opened)}</strong></div>
        <div class="kut-shift__info-row"><span>Открыл</span><strong>${esc(r.openedByName)}</strong></div>
        <div class="kut-shift__info-row"><span>Начальная касса</span><strong>${fmt(r.openingBalance)} KGS</strong></div>
      </div>

      <div class="kut-shift__stats">
        <div class="kut-shift__stat">
          <div class="kut-shift__stat-label">Выручка</div>
          <div class="kut-shift__stat-value">${fmt(r.totalRevenue)} KGS</div>
        </div>
        <div class="kut-shift__stat">
          <div class="kut-shift__stat-label">Чеков</div>
          <div class="kut-shift__stat-value">${r.totalCount}</div>
        </div>
        ${r.totalRefund > 0 ? `
        <div class="kut-shift__stat kut-shift__stat--refund">
          <div class="kut-shift__stat-label">Возвраты</div>
          <div class="kut-shift__stat-value">−${fmt(r.totalRefund)} KGS</div>
        </div>` : ''}
      </div>

      <div class="kut-shift__section">
        <div class="kut-shift__section-title">По методам оплаты</div>
        <div class="kut-shift__rows">
          <div class="kut-shift__row"><span>💵 Наличные</span><strong>${fmt(r.byPayment.cash || 0)} KGS</strong></div>
          <div class="kut-shift__row"><span>💳 Карта</span><strong>${fmt(r.byPayment.card || 0)} KGS</strong></div>
          <div class="kut-shift__row"><span>📱 MBANK/Элсом</span><strong>${fmt(r.byPayment.wallet || 0)} KGS</strong></div>
          <div class="kut-shift__row"><span>🔳 QR-код</span><strong>${fmt(r.byPayment.qr || 0)} KGS</strong></div>
          <div class="kut-shift__row"><span>📝 В долг</span><strong>${fmt(r.byPayment.debt || 0)} KGS</strong></div>
          ${r.byPayment.refund ? `<div class="kut-shift__row kut-shift__row--refund"><span>↩ Возвраты</span><strong>−${fmt(r.byPayment.refund)} KGS</strong></div>` : ''}
        </div>
      </div>

      ${r.byCashier.length > 0 ? `
      <div class="kut-shift__section">
        <div class="kut-shift__section-title">По кассирам</div>
        <div class="kut-shift__rows">
          ${r.byCashier.map((c) => `
            <div class="kut-shift__row">
              <span>${esc(c.name)} <small>(${c.count} чек.)</small></span>
              <strong>${fmt(c.revenue)} KGS</strong>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="kut-shift__section kut-shift__section--highlight">
        <div class="kut-shift__row kut-shift__row--total">
          <span>Ожидаемая касса</span>
          <strong>${fmt(r.expectedCash)} KGS</strong>
        </div>
      </div>
    `;
  }

  function renderReportModal(report) {
    const existing = document.getElementById('kutXReportModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'kutXReportModal';
    modal.className = 'kut-shift-modal';
    modal.innerHTML = `
      <div class="kut-shift-backdrop" data-close></div>
      <div class="kut-shift" role="dialog" aria-modal="true">
        <div class="kut-shift__head">
          <h3>X-отчёт</h3>
          <button class="kut-shift__close" data-close type="button">✕</button>
        </div>
        <div class="kut-shift__body">${renderReportHtml(report)}</div>
        <div class="kut-shift__actions">
          <button class="kut-shift__cancel" data-close type="button">Закрыть</button>
          <button class="kut-shift__confirm" type="button" id="kutPrintX">🖨 Печать</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    modal.querySelectorAll('[data-close]').forEach((el) =>
      el.addEventListener('click', () => {
        modal.remove();
        document.body.style.overflow = '';
      }));

    const printBtn = modal.querySelector('#kutPrintX');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
  }

  function injectShiftButton() {
    const pages = ['cash', 'index'];
    const page = (location.pathname.split('/').pop() || '').replace('.html', '') || 'index';
    if (!pages.includes(page)) return;

    const bar = document.querySelector('.mobile-bar');
    if (!bar || document.getElementById('kutShiftBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'kutShiftBtn';
    btn.className = 'kut-cam-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Смена');
    btn.title = state.current ? 'Смена открыта' : 'Смена закрыта';
    btn.innerHTML = '<span style="font-size:18px">🕐</span>';
    btn.addEventListener('click', openShiftPanel);

    const lang = bar.querySelector('[data-kut-lang]');
    if (lang) bar.insertBefore(btn, lang);
    else bar.appendChild(btn);
  }

  function updateShiftButton() {
    const btn = document.getElementById('kutShiftBtn');
    if (!btn) return;
    btn.title = state.current ? 'Смена открыта' : 'Смена закрыта';
    btn.classList.toggle('is-active', Boolean(state.current));
  }

  function openShiftPanel() {
    const existing = document.getElementById('kutShiftPanel');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'kutShiftPanel';
    modal.className = 'kut-shift-modal';

    const isOpen = Boolean(state.current);
    let content = '';

    if (isOpen) {
      const opened = toDate(state.current.openedAt);
      content = `
        <div class="kut-shift__panel-open">
          <div class="kut-shift__panel-badge">🟢 Смена открыта</div>
          <div class="kut-shift__info">
            <div class="kut-shift__info-row"><span>Открыта</span><strong>${fmtDateTime(opened)}</strong></div>
            <div class="kut-shift__info-row"><span>Открыл</span><strong>${esc(state.current.openedByName || '')}</strong></div>
            <div class="kut-shift__info-row"><span>Начальная касса</span><strong>${fmt(state.current.openingBalance)} KGS</strong></div>
          </div>
          <div class="kut-shift__panel-actions">
            <button class="kut-shift__panel-btn kut-shift__panel-btn--primary" data-act="xreport">📊 X-отчёт</button>
            <button class="kut-shift__panel-btn kut-shift__panel-btn--danger" data-act="close">🔒 Закрыть смену</button>
          </div>
        </div>`;
    } else {
      content = `
        <div class="kut-shift__panel-closed">
          <div class="kut-shift__panel-badge kut-shift__panel-badge--dim">⚪ Смена закрыта</div>
          <p class="kut-shift__panel-text">Начните смену, чтобы отслеживать движение денег в кассе.</p>
          <button class="kut-shift__panel-btn kut-shift__panel-btn--primary" data-act="open">🟢 Открыть смену</button>
        </div>`;
    }

    modal.innerHTML = `
      <div class="kut-shift-backdrop" data-close></div>
      <div class="kut-shift kut-shift--panel" role="dialog" aria-modal="true">
        <div class="kut-shift__head">
          <h3>Смена</h3>
          <button class="kut-shift__close" data-close type="button">✕</button>
        </div>
        <div class="kut-shift__body">${content}</div>
      </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    const close = () => {
      modal.remove();
      document.body.style.overflow = '';
    };
    modal.querySelectorAll('[data-close]').forEach((el) =>
      el.addEventListener('click', close));

    modal.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'open') { close(); await openShift(); }
        else if (act === 'close') { close(); await closeShift(); }
        else if (act === 'xreport') { close(); showXReport(); }
      });
    });
  }

  function render() {
    updateShiftButton();
  }

  function injectStyles() {
    if (document.getElementById('kut-shift-styles')) return;
    const style = document.createElement('style');
    style.id = 'kut-shift-styles';
    style.textContent = `
      #kutShiftBtn.is-active { background: rgba(16,185,129,.18); color: #34D399; border-color: rgba(16,185,129,.4); }

      .kut-shift-modal { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 12px; }
      .kut-shift-backdrop { position: absolute; inset: 0; background: rgba(2,8,18,.75); backdrop-filter: blur(8px); }
      .kut-shift { position: relative; width: 100%; max-width: 460px; max-height: 96dvh; display: flex; flex-direction: column; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55); color: var(--kut-text-1, #F1F5F9); overflow: hidden; }
      .kut-shift--panel { max-width: 420px; }
      .kut-shift__head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--kut-border, rgba(255,255,255,.08)); flex-shrink: 0; }
      .kut-shift__head h3 { margin: 0; font-size: 18px; font-weight: 800; }
      .kut-shift__close { width: 36px; height: 36px; display: grid; place-items: center; background: var(--kut-surface-2, #273449); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 10px; color: var(--kut-text-2, #94A3B8); cursor: pointer; font-size: 16px; }
      .kut-shift__body { flex: 1; overflow-y: auto; padding: 16px 20px; min-height: 0; }
      .kut-shift__actions { display: flex; gap: 10px; padding: 14px 20px 18px; border-top: 1px solid var(--kut-border, rgba(255,255,255,.08)); flex-shrink: 0; }
      .kut-shift__actions button { flex: 1; padding: 14px; border-radius: 12px; border: none; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-shift__cancel { background: var(--kut-surface-2, #273449); color: var(--kut-text-1, #F1F5F9); }
      .kut-shift__confirm { background: linear-gradient(135deg, #10B981, #059669); color: #fff; }

      .kut-shift__info { padding: 12px 14px; background: var(--kut-surface-2, #273449); border-radius: 12px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
      .kut-shift__info-row { display: flex; justify-content: space-between; font-size: 13px; }
      .kut-shift__info-row span { color: var(--kut-text-3, #64748B); }
      .kut-shift__info-row strong { color: var(--kut-text-1, #F1F5F9); font-variant-numeric: tabular-nums; }

      .kut-shift__stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
      .kut-shift__stat { padding: 12px; background: var(--kut-surface-2, #273449); border-radius: 12px; }
      .kut-shift__stat--refund { background: rgba(248,113,113,.12); border: 1px solid rgba(248,113,113,.3); }
      .kut-shift__stat-label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--kut-text-3, #64748B); margin-bottom: 4px; }
      .kut-shift__stat-value { font-size: 18px; font-weight: 800; color: var(--kut-money, #10B981); font-variant-numeric: tabular-nums; }
      .kut-shift__stat--refund .kut-shift__stat-value { color: #F87171; }

      .kut-shift__section { margin-bottom: 14px; }
      .kut-shift__section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--kut-gold-deep, #E4C56A); margin-bottom: 8px; }
      .kut-shift__rows { display: flex; flex-direction: column; gap: 4px; }
      .kut-shift__row { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--kut-surface-2, #273449); border-radius: 10px; font-size: 13px; }
      .kut-shift__row strong { font-variant-numeric: tabular-nums; color: var(--kut-text-1, #F1F5F9); }
      .kut-shift__row small { color: var(--kut-text-3, #64748B); font-size: 11px; margin-left: 4px; }
      .kut-shift__row--refund strong { color: #F87171; }
      .kut-shift__section--highlight { margin-top: 16px; padding: 6px; background: rgba(16,185,129,.10); border-radius: 12px; }
      .kut-shift__row--total { background: transparent; font-size: 15px; font-weight: 800; }
      .kut-shift__row--total strong { color: #34D399; font-size: 17px; }

      .kut-shift__field { margin-top: 16px; }
      .kut-shift__field label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 8px; }
      .kut-shift__field input { width: 100%; height: 52px; padding: 0 16px; font-size: 20px; font-weight: 800; text-align: center; background: var(--kut-surface-2, #273449); border: 1.5px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 14px; color: var(--kut-money, #10B981); outline: none; font-family: inherit; font-variant-numeric: tabular-nums; -webkit-appearance: none; }
      .kut-shift__field input:focus { border-color: var(--kut-gold, #E4C56A); }
      .kut-shift__hint { font-size: 12px; color: var(--kut-text-3, #64748B); margin-top: 6px; }
      .kut-shift__diff { font-size: 13px; font-weight: 700; margin-top: 8px; padding: 8px 12px; border-radius: 10px; display: none; }
      .kut-shift__diff:not(:empty) { display: block; }
      .kut-shift__diff.is-ok { color: #34D399; background: rgba(16,185,129,.10); }
      .kut-shift__diff.is-warn { color: #FBBF24; background: rgba(251,191,36,.10); }
      .kut-shift__diff.is-error { color: #F87171; background: rgba(248,113,113,.10); }

      .kut-shift__panel-badge { display: inline-block; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 800; margin-bottom: 14px; background: rgba(16,185,129,.15); color: #34D399; }
      .kut-shift__panel-badge--dim { background: rgba(148,163,184,.15); color: #94A3B8; }
      .kut-shift__panel-text { color: var(--kut-text-2, #94A3B8); font-size: 14px; line-height: 1.5; margin-bottom: 16px; }
      .kut-shift__panel-actions { display: flex; flex-direction: column; gap: 10px; }
      .kut-shift__panel-btn { padding: 15px; border-radius: 12px; border: none; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-shift__panel-btn--primary { background: linear-gradient(135deg, #10B981, #059669); color: #fff; }
      .kut-shift__panel-btn--danger { background: rgba(248,113,113,.15); color: #F87171; border: 1px solid rgba(248,113,113,.3); }

      .kut-numpad-modal { position: fixed; inset: 0; z-index: 10001; display: grid; place-items: center; padding: 16px; }
      .kut-numpad-backdrop { position: absolute; inset: 0; background: rgba(2,8,18,.7); backdrop-filter: blur(8px); }
      .kut-numpad { position: relative; width: 100%; max-width: 360px; padding: 20px; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55); color: var(--kut-text-1, #F1F5F9); }
      .kut-numpad__title { font-size: 14px; color: var(--kut-text-2, #94A3B8); margin-bottom: 6px; text-align: center; font-weight: 700; }
      .kut-numpad__subtitle { font-size: 12px; color: var(--kut-text-3, #64748B); margin-bottom: 12px; text-align: center; }
      .kut-numpad__display { font-size: 38px; font-weight: 800; text-align: right; color: var(--kut-money, #10B981); padding: 16px 18px; margin-bottom: 16px; background: var(--kut-surface-2, #273449); border-radius: 14px; font-variant-numeric: tabular-nums; }
      .kut-numpad__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .kut-numpad__key { padding: 16px 0; font-size: 20px; font-weight: 700; background: var(--kut-surface-2, #273449); color: var(--kut-text-1, #F1F5F9); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 12px; cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent; }
      .kut-numpad__key:active { transform: scale(.94); background: rgba(212,175,55,.15); }
      .kut-numpad__actions { display: flex; gap: 8px; margin-top: 16px; }
      .kut-numpad__actions button { flex: 1; padding: 14px; border-radius: 12px; border: none; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .kut-numpad__cancel { background: var(--kut-surface-2, #273449); color: var(--kut-text-1, #F1F5F9); }
      .kut-numpad__confirm { background: linear-gradient(135deg, #10B981, #059669); color: #fff; }
    `;
    document.head.appendChild(style);
  }

  window.KUT_SHIFTS = {
    openShift, closeShift, showXReport,
    loadCurrentShift, buildReport,
    openPanel: openShiftPanel,
    getState: () => state,
  };

  async function boot() {
    injectStyles();
    await loadCurrentShift();
    injectShiftButton();
    updateShiftButton();
    setTimeout(injectShiftButton, 1200);
    window.addEventListener('kut:business-changed', async () => {
      await loadCurrentShift();
      updateShiftButton();
    });
    console.info('[shifts v1.2] смены и X/Z-отчёты готовы');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
