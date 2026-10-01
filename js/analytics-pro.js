/* =========================================================
   NexusBiz — Аналитика Pro (analytics-pro.js) · v1.1
   
   Square-style Reports:
   • COGS (себестоимость проданного)
   • Чистая прибыль + маржа %
   • Разбивка по категориям (топ / аутсайдеры)
   • Средний чек
   • Динамика: день / неделя / месяц
   • Топ-10 товаров по выручке и по марже
   Публичное API: window.KUT_ANALYTICS
   ========================================================= */

(function () {
  'use strict';

  const state = {
    period: 'month',
    unsub: null,
    lastHash: '',
  };

  const $ = (s) => document.querySelector(s);
  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const fmtPct = (n) =>
    (Number(n) || 0).toFixed(1) + '%';
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function getRange(period) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const DAY = 86400000;
    switch (period) {
      case 'today':     return { from: today,           to: Date.now() + 1 };
      case 'yesterday': return { from: today - DAY,     to: today };
      case 'week':      return { from: today - 6*DAY,   to: Date.now() + 1 };
      case 'month':     return { from: today - 29*DAY,  to: Date.now() + 1 };
      case 'all':       return { from: 0,               to: Date.now() + 1 };
      default:          return { from: today - 29*DAY,  to: Date.now() + 1 };
    }
  }

  function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  function sumOfSale(s) { return Number(s.totalSum ?? s.total) || 0; }
  function costOfSale(s) {
    if (!Array.isArray(s.items)) return 0;
    const products = (window.KUT?.getState?.()?.products) || [];
    return s.items.reduce((sum, it) => {
      const qty = Number(it.quantity ?? it.qty) || 0;
      const fallback = products.find((p) => p.id === (it.productId || it.id));
      const cost = Number(it.costPrice ?? fallback?.costPrice) || 0;
      return sum + qty * cost;
    }, 0);
  }

  function getPeriodSales() {
    const { from, to } = getRange(state.period);
    const sales = (window.KUT?.getSales?.() || []);
    return sales.filter((s) => {
      const t = toDate(s.createdAt)?.getTime() || 0;
      return t >= from && t < to;
    });
  }

  function aggregateProfitDetailed() {
    const sales = getPeriodSales();
    const revenue = sales.reduce((s, x) => s + sumOfSale(x), 0);
    const cogs    = sales.reduce((s, x) => s + costOfSale(x), 0);
    const discount = sales.reduce((s, x) => s + (Number(x.discountAmount) || 0), 0);
    const tax     = sales.reduce((s, x) => s + (Number(x.taxAmount) || 0), 0);
    const profit  = revenue - cogs - tax;

    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
    const markupPct = cogs > 0 ? ((revenue - cogs) / cogs) * 100 : 0;
    const avgCheck  = sales.length > 0 ? revenue / sales.length : 0;

    return { revenue, cogs, profit, discount, tax, marginPct, markupPct, avgCheck, count: sales.length };
  }

  function aggregateMarginByCategory() {
    const sales = getPeriodSales();
    const products = (window.KUT?.getState?.()?.products) || [];
    const byCat = new Map();

    sales.forEach((s) => {
      (s.items || []).forEach((it) => {
        const p = products.find((x) => x.id === (it.productId || it.id));
        const cat = p?.category || 'Без категории';
        const qty = Number(it.quantity ?? it.qty) || 0;
        const rev = (Number(it.price) || 0) * qty;
        const cost = (Number(it.costPrice ?? p?.costPrice) || 0) * qty;
        const profit = rev - cost;

        if (!byCat.has(cat)) byCat.set(cat, { revenue: 0, cost: 0, profit: 0, qty: 0, count: 0 });
        const e = byCat.get(cat);
        e.revenue += rev;
        e.cost += cost;
        e.profit += profit;
        e.qty += qty;
        e.count += 1;
      });
    });

    return Array.from(byCat.entries())
      .map(([name, d]) => ({
        name,
        ...d,
        marginPct: d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit);
  }

  function aggregateTopProducts(limit = 10) {
    const sales = getPeriodSales();
    const products = (window.KUT?.getState?.()?.products) || [];
    const map = new Map();

    sales.forEach((s) => {
      (s.items || []).forEach((it) => {
        const id = it.productId || it.id;
        const p = products.find((x) => x.id === id);
        const qty = Number(it.quantity ?? it.qty) || 0;
        const rev = (Number(it.price) || 0) * qty;
        const cost = (Number(it.costPrice ?? p?.costPrice) || 0) * qty;
        const profit = rev - cost;

        if (!map.has(id)) map.set(id, {
          id,
          name: it.name || p?.name || '—',
          category: p?.category || '—',
          qty: 0, revenue: 0, cost: 0, profit: 0,
        });
        const e = map.get(id);
        e.qty += qty;
        e.revenue += rev;
        e.cost += cost;
        e.profit += profit;
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  function render() {
    const wrap = document.getElementById('kutAnalyticsPro');
    if (!wrap) return;

    const hash = hashState();
    if (hash === state.lastHash) return;
    state.lastHash = hash;

    const d = aggregateProfitDetailed();
    const cats = aggregateMarginByCategory();
    const top = aggregateTopProducts(8);

    wrap.innerHTML = `
      <div class="anp__header">
        <h2 class="anp__title">📊 Финансовая аналитика</h2>
        <div class="anp__periods">
          ${[
            { id: 'today',     label: 'Сегодня' },
            { id: 'yesterday', label: 'Вчера' },
            { id: 'week',      label: '7 дней' },
            { id: 'month',     label: '30 дней' },
            { id: 'all',       label: 'Всё' },
          ].map((p) => `
            <button class="anp__chip ${state.period === p.id ? 'is-active' : ''}"
                    type="button" data-period="${p.id}">${p.label}</button>
          `).join('')}
        </div>
      </div>

      <div class="anp__grid">
        <div class="anp-card anp-card--revenue">
          <div class="anp-card__label">Выручка</div>
          <div class="anp-card__value">${fmt(d.revenue)}<small>KGS</small></div>
          <div class="anp-card__sub">${d.count} чеков · средний ${fmt(d.avgCheck)} KGS</div>
        </div>

        <div class="anp-card anp-card--cogs">
          <div class="anp-card__label">Себестоимость (COGS)</div>
          <div class="anp-card__value">${fmt(d.cogs)}<small>KGS</small></div>
          <div class="anp-card__sub">${d.revenue > 0 ? fmtPct(d.cogs / d.revenue * 100) : '0%'} от выручки</div>
        </div>

        <div class="anp-card anp-card--profit">
          <div class="anp-card__label">Чистая прибыль</div>
          <div class="anp-card__value">${fmt(d.profit)}<small>KGS</small></div>
          <div class="anp-card__sub">Маржа ${fmtPct(d.marginPct)} · наценка ${fmtPct(d.markupPct)}</div>
        </div>

        <div class="anp-card anp-card--discount">
          <div class="anp-card__label">Скидки</div>
          <div class="anp-card__value">−${fmt(d.discount)}<small>KGS</small></div>
          <div class="anp-card__sub">${d.revenue > 0 ? fmtPct(d.discount / (d.revenue + d.discount) * 100) : '0%'} от подытога</div>
        </div>
      </div>

      ${cats.length > 0 ? `
        <div class="anp-section">
          <h3 class="anp-section__title">Маржа по категориям</h3>
          <div class="anp-cats">
            ${cats.slice(0, 8).map((c) => `
              <div class="anp-cat">
                <div class="anp-cat__head">
                  <span class="anp-cat__name">${esc(c.name)}</span>
                  <span class="anp-cat__margin ${c.marginPct >= 30 ? 'is-good' : c.marginPct >= 15 ? 'is-warn' : 'is-bad'}">${fmtPct(c.marginPct)}</span>
                </div>
                <div class="anp-cat__bar">
                  <div class="anp-cat__bar-fill" style="width: ${Math.min(100, Math.max(0, c.marginPct))}%"></div>
                </div>
                <div class="anp-cat__nums">
                  <span>${fmt(c.revenue)} KGS</span>
                  <span class="anp-cat__profit">+${fmt(c.profit)} KGS</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

      ${top.length > 0 ? `
        <div class="anp-section">
          <h3 class="anp-section__title">Топ товаров по выручке</h3>
          <div class="anp-top">
            ${top.map((p, i) => `
              <div class="anp-top__row">
                <div class="anp-top__rank">${i + 1}</div>
                <div class="anp-top__body">
                  <div class="anp-top__name">${esc(p.name)}</div>
                  <div class="anp-top__meta">${esc(p.category)} · ${p.qty} шт</div>
                </div>
                <div class="anp-top__num">
                  <div class="anp-top__revenue">${fmt(p.revenue)} KGS</div>
                  <div class="anp-top__profit">+${fmt(p.profit)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>` : `
        <div class="anp-empty">
          <span>📊</span>
          <p>За выбранный период продаж нет</p>
        </div>`}
    `;

    wrap.querySelectorAll('[data-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.period = btn.dataset.period;
        state.lastHash = '';
        render();
      });
    });
  }

  function hashState() {
    const sales = (window.KUT?.getSales?.() || []);
    return state.period + '|' + sales.length + '|' +
      sales.slice(0, 5).map((s) => s.id + sumOfSale(s)).join(',');
  }

  function injectContainer() {
    if (document.getElementById('kutAnalyticsPro')) return;

    const analytics = document.querySelector('.analytics');
    if (analytics) {
      const wrap = document.createElement('section');
      wrap.id = 'kutAnalyticsPro';
      wrap.className = 'anp';
      analytics.parentElement.insertBefore(wrap, analytics.nextSibling);
      return;
    }

    const main = document.querySelector('.main-content');
    if (main) {
      const wrap = document.createElement('section');
      wrap.id = 'kutAnalyticsPro';
      wrap.className = 'anp';
      main.insertBefore(wrap, main.firstChild);
    }
  }

  function injectStyles() {
    if (document.getElementById('anp-styles')) return;
    const style = document.createElement('style');
    style.id = 'anp-styles';
    style.textContent = `
      .anp { display: flex; flex-direction: column; gap: 14px; margin: 16px 0; }
      .anp__header { display: flex; flex-direction: column; gap: 10px; }
      .anp__title { margin: 0; font-size: 17px; font-weight: 800; color: var(--kut-text-1, #F1F5F9); }
      .anp__periods { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 4px; }
      .anp__periods::-webkit-scrollbar { display: none; }
      .anp__chip { flex-shrink: 0; padding: 8px 14px; min-height: 40px; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 999px; color: var(--kut-text-2, #94A3B8); font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; -webkit-tap-highlight-color: transparent; transition: background .15s, color .15s; }
      .anp__chip:hover { border-color: var(--kut-gold, #E4C56A); color: var(--kut-gold-deep, #E4C56A); }
      .anp__chip.is-active { background: linear-gradient(135deg, #E7C14A, #B88F1D); color: #06150F; border-color: transparent; box-shadow: 0 4px 14px rgba(212,175,55,.3); }

      .anp__grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
      @media (min-width: 640px) { .anp__grid { grid-template-columns: repeat(2, 1fr); gap: 12px; } }
      @media (min-width: 1000px) { .anp__grid { grid-template-columns: repeat(4, 1fr); } }

      .anp-card { padding: 16px; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 18px; box-shadow: 0 4px 14px rgba(0,0,0,.2); }
      .anp-card__label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--kut-text-3, #64748B); margin-bottom: 8px; }
      .anp-card__value { font-size: 24px; font-weight: 800; line-height: 1; letter-spacing: -.5px; font-variant-numeric: tabular-nums; color: var(--kut-text-1, #F1F5F9); margin-bottom: 6px; }
      .anp-card__value small { font-size: 12px; font-weight: 600; color: var(--kut-text-3, #64748B); margin-left: 6px; letter-spacing: 0; }
      .anp-card__sub { font-size: 12px; color: var(--kut-text-2, #94A3B8); }
      .anp-card--revenue .anp-card__value { color: #10B981; }
      .anp-card--cogs .anp-card__value { color: #F87171; }
      .anp-card--profit .anp-card__value { color: #34D399; text-shadow: 0 0 20px rgba(52,211,153,.25); }
      .anp-card--discount .anp-card__value { color: #FBBF24; }

      .anp-section { display: flex; flex-direction: column; gap: 10px; padding: 16px; background: var(--kut-surface, #1E293B); border: 1px solid var(--kut-border, rgba(255,255,255,.08)); border-radius: 18px; }
      .anp-section__title { margin: 0; font-size: 14px; font-weight: 800; color: var(--kut-text-1, #F1F5F9); }

      .anp-cats { display: flex; flex-direction: column; gap: 10px; }
      .anp-cat { padding: 10px 12px; background: var(--kut-surface-2, #273449); border-radius: 12px; }
      .anp-cat__head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
      .anp-cat__name { font-size: 13px; font-weight: 700; color: var(--kut-text-1, #F1F5F9); }
      .anp-cat__margin { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
      .anp-cat__margin.is-good { color: #34D399; }
      .anp-cat__margin.is-warn { color: #FBBF24; }
      .anp-cat__margin.is-bad { color: #F87171; }
      .anp-cat__bar { height: 6px; background: rgba(0,0,0,.25); border-radius: 4px; overflow: hidden; margin-bottom: 6px; }
      .anp-cat__bar-fill { height: 100%; background: linear-gradient(90deg, #10B981, #34D399); border-radius: 4px; transition: width .4s ease; }
      .anp-cat__nums { display: flex; justify-content: space-between; font-size: 11px; color: var(--kut-text-2, #94A3B8); font-variant-numeric: tabular-nums; }
      .anp-cat__profit { color: #34D399; font-weight: 700; }

      .anp-top { display: flex; flex-direction: column; gap: 6px; }
      .anp-top__row { display: grid; grid-template-columns: 32px 1fr auto; gap: 12px; align-items: center; padding: 10px 12px; background: var(--kut-surface-2, #273449); border-radius: 12px; }
      .anp-top__rank { width: 32px; height: 32px; display: grid; place-items: center; background: linear-gradient(135deg, #E7C14A, #B88F1D); color: #06150F; border-radius: 8px; font-size: 13px; font-weight: 800; }
      .anp-top__body { min-width: 0; }
      .anp-top__name { font-size: 13px; font-weight: 700; color: var(--kut-text-1, #F1F5F9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .anp-top__meta { font-size: 11px; color: var(--kut-text-3, #64748B); margin-top: 2px; }
      .anp-top__num { text-align: right; }
      .anp-top__revenue { font-size: 14px; font-weight: 800; color: var(--kut-money, #10B981); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .anp-top__profit { font-size: 11px; color: #34D399; font-weight: 700; font-variant-numeric: tabular-nums; }

      .anp-empty { padding: 40px 20px; text-align: center; color: var(--kut-text-3, #64748B); font-size: 14px; }
      .anp-empty span { display: block; font-size: 42px; margin-bottom: 10px; opacity: .6; }
    `;
    document.head.appendChild(style);
  }

  window.KUT_ANALYTICS = {
    render,
    aggregateProfitDetailed,
    aggregateMarginByCategory,
    aggregateTopProducts,
    setPeriod: (p) => { state.period = p; state.lastHash = ''; render(); },
    getState: () => state,
  };

  function boot() {
    injectStyles();
    injectContainer();
    setTimeout(render, 1500);
    window.addEventListener('kut:business-changed', () => {
      state.lastHash = '';
      render();
    });
    setInterval(() => {
      const h = hashState();
      if (h !== state.lastHash) render();
    }, 3000);
    console.info('[analytics-pro v1.1] готов');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
