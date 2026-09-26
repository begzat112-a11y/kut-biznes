<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#005F40">
  <title>Несие — КУТ: БИЗНЕС</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./css/style.css">

  <style>
    :root {
      --kut-green: #005F40; --kut-green-dark: #003F2A; --kut-green-soft: #E6F1ED;
      --kut-gold: #D4AF37; --kut-gold-dark: #B8952A; --kut-bg: #F4F7F5;
      --kut-surface: #FFFFFF; --kut-border: #E3EAE6; --kut-text: #14211C;
      --kut-muted: #64776E; --kut-danger: #C0392B; --kut-warn: #E08A1E;
      --kut-whatsapp: #25D366;
      --radius-sm: 10px; --radius: 14px; --radius-lg: 22px;
      --shadow-sm: 0 1px 2px rgba(16,32,25,.04), 0 1px 3px rgba(16,32,25,.06);
      --shadow-md: 0 6px 18px rgba(16,32,25,.08);
      --shadow-lg: 0 18px 48px rgba(16,32,25,.20);
    }
    *, *::before, *::after { box-sizing: border-box; }
    html, body { height: 100%; }
    body.page-debts {
      margin: 0; font-family: 'Inter', system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: var(--kut-bg); color: var(--kut-text);
      display: flex; flex-direction: column; min-height: 100dvh;
      -webkit-font-smoothing: antialiased;
    }

    /* ===== Единая верхняя шапка ===== */
    .mobile-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px;
      background: var(--kut-green); color: #fff;
      position: sticky; top: 0; z-index: 40;
      width: 100%; max-width: 100%;
      box-shadow: var(--shadow-sm);
    }
    .mobile-bar__title {
      font-weight: 700; font-size: 15px;
      overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; min-width: 0; flex: 1;
      margin-left: 2px;
    }

    /* Индикатор сети */
    .net-pill {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 9px; border-radius: 999px;
      font-size: 11px; font-weight: 700;
      background: rgba(30,190,90,.20); color: #B9F5CE;
      border: 1px solid rgba(30,190,90,.35);
      white-space: nowrap; flex-shrink: 0;
      transition: background .18s ease, color .18s ease, border-color .18s ease;
    }
    .net-pill__dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #1EBE5A; flex-shrink: 0;
      box-shadow: 0 0 8px rgba(30,190,90,.8);
      animation: netPulse 2s ease-in-out infinite;
    }
    .net-pill.is-offline {
      background: rgba(192,57,43,.20); color: #FFD0C8;
      border-color: rgba(192,57,43,.45);
    }
    .net-pill.is-offline .net-pill__dot {
      background: #C0392B; box-shadow: 0 0 8px rgba(192,57,43,.8);
      animation: netPulse 1s ease-in-out infinite;
    }
    .net-pill__qty {
      display: none; background: #C0392B; color: #fff;
      padding: 1px 6px; border-radius: 999px;
      font-size: 10px; margin-left: 2px;
    }
    .net-pill.is-offline[data-queue]:not([data-queue="0"]) .net-pill__qty {
      display: inline-block;
    }
    @keyframes netPulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: .35; }
    }
    @media (max-width: 380px) {
      .net-pill__label { display: none; }
      .net-pill { padding: 5px 7px; }
    }

    .wrap { width: 100%; max-width: 1400px; margin: 0 auto; padding: 16px; }
    @media (min-width: 980px) { .wrap { padding: 20px; } }
    @media (max-width: 999px) {
      body.page-debts .wrap { padding-bottom: calc(100px + env(safe-area-inset-bottom)); }
    }

    .page-head { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
    @media (min-width: 720px) {
      .page-head { flex-direction: row; align-items: center; justify-content: space-between; }
    }
    .page-head h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -.3px; }
    .page-head p { margin: 4px 0 0; color: var(--kut-muted); font-size: 14px; }

    .stats { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 16px; }
    @media (min-width: 640px) { .stats { grid-template-columns: repeat(3, 1fr); gap: 14px; } }
    .stat { background: var(--kut-surface); border: 1px solid var(--kut-border);
      border-radius: var(--radius-lg); padding: 16px;
      display: flex; align-items: center; gap: 14px; box-shadow: var(--shadow-sm); }
    .stat__icon { width: 46px; height: 46px; border-radius: 12px;
      display: grid; place-items: center; font-size: 22px;
      background: var(--kut-green-soft); color: var(--kut-green); flex-shrink: 0; }
    .stat--gold .stat__icon { background: #FFF8E1; color: var(--kut-gold-dark); }
    .stat--warn .stat__icon { background: #FFF2DE; color: var(--kut-warn); }
    .stat__label { font-size: 12px; text-transform: uppercase; letter-spacing: .6px;
      font-weight: 600; color: var(--kut-muted); margin-bottom: 4px; }
    .stat__value { font-size: 22px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .stat__value small { font-size: 12px; font-weight: 600; color: var(--kut-muted); margin-left: 4px; }

    .tabs { display: flex; gap: 6px; background: var(--kut-surface);
      border: 1px solid var(--kut-border); border-radius: 14px;
      padding: 5px; margin-bottom: 14px;
      box-shadow: var(--shadow-sm); width: fit-content; max-width: 100%; }
    .tab { border: none; background: transparent; padding: 10px 18px;
      border-radius: 10px; font-family: inherit; font-size: 14px;
      font-weight: 600; color: var(--kut-muted); cursor: pointer;
      transition: all .18s ease; white-space: nowrap;
      display: inline-flex; align-items: center; gap: 8px; }
    .tab:hover { color: var(--kut-green); }
    .tab.is-active { background: var(--kut-green); color: #fff; box-shadow: 0 4px 10px rgba(0,95,64,.22); }
    .tab__badge { display: inline-grid; place-items: center;
      min-width: 22px; height: 22px; padding: 0 6px;
      border-radius: 999px; background: rgba(255,255,255,.2); font-size: 12px; font-weight: 700; }
    .tab:not(.is-active) .tab__badge { background: var(--kut-green-soft); color: var(--kut-green); }

    .toolbar { background: var(--kut-surface); border: 1px solid var(--kut-border);
      border-radius: var(--radius-lg); padding: 12px;
      margin-bottom: 14px; box-shadow: var(--shadow-sm); }
    .search { position: relative; }
    .search input { width: 100%; padding: 12px 16px 12px 42px;
      border: 1px solid var(--kut-border); background: #FBFDFC;
      border-radius: var(--radius); font-size: 15px;
      font-family: inherit; color: var(--kut-text); outline: none; }
    .search input:focus { background: #fff; border-color: var(--kut-green); box-shadow: 0 0 0 4px rgba(0,95,64,.12); }
    .search::before { content: "🔍"; position: absolute; left: 14px; top: 50%;
      transform: translateY(-50%); font-size: 14px; opacity: .65; pointer-events: none; }

    .btn { display: inline-flex; align-items: center; justify-content: center;
      gap: 8px; padding: 12px 18px; border-radius: 12px;
      font-family: inherit; font-size: 14px; font-weight: 600;
      cursor: pointer; border: 1px solid transparent;
      transition: all .12s ease; white-space: nowrap; }
    .btn:active { transform: translateY(1px); }
    .btn--primary { background: var(--kut-green); color: #fff; box-shadow: 0 8px 18px rgba(0,95,64,.24); }
    .btn--primary:hover { background: var(--kut-green-dark); }
    .btn--gold { background: var(--kut-gold); color: var(--kut-green-dark); box-shadow: 0 8px 18px rgba(212,175,55,.32); }
    .btn--gold:hover { background: var(--kut-gold-dark); }
    .btn--ghost { background: transparent; border-color: var(--kut-border); color: var(--kut-text); }
    .btn--ghost:hover { background: var(--kut-green-soft); border-color: var(--kut-green); color: var(--kut-green); }
    .btn--danger { background: var(--kut-danger); color: #fff; }
    .btn--danger:hover { background: #A0301F; }
    .btn--block { width: 100%; }
    .btn:disabled { opacity: .55; cursor: not-allowed; }

    .debts-card { background: var(--kut-surface); border: 1px solid var(--kut-border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-md); overflow: hidden; }
    .debts-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .debts-table thead th { text-align: left; font-size: 12px; text-transform: uppercase;
      letter-spacing: .6px; color: var(--kut-muted); font-weight: 700;
      padding: 14px 16px; background: #FBFDFC;
      border-bottom: 1px solid var(--kut-border); white-space: nowrap; }
    .debts-table tbody td { padding: 14px 16px; border-bottom: 1px solid var(--kut-border); vertical-align: middle; }
    .debts-table tbody tr:last-child td { border-bottom: none; }
    .debts-table tbody tr:hover { background: #FAFCFB; }
    .debts-table tbody tr.is-overdue { background: rgba(224,138,30,.04); }

    .client { display: flex; align-items: center; gap: 12px; min-width: 180px; }
    .client__avatar { width: 42px; height: 42px; display: grid; place-items: center;
      background: var(--kut-green-soft); color: var(--kut-green);
      border-radius: 50%; font-size: 16px; font-weight: 700;
      flex-shrink: 0; text-transform: uppercase; }
    .client__text { min-width: 0; }
    .client__name { font-weight: 600; font-size: 14px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
    .client__note { font-size: 12px; color: var(--kut-muted); margin-top: 2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }

    .phone-link { display: inline-flex; align-items: center; gap: 6px;
      color: var(--kut-green); text-decoration: none;
      font-weight: 600; font-variant-numeric: tabular-nums; font-size: 13px; }
    .phone-link:hover { color: var(--kut-green-dark); text-decoration: underline; }

    .amount { font-size: 16px; font-weight: 800; color: var(--kut-green);
      font-variant-numeric: tabular-nums; white-space: nowrap; }
    .amount small { font-size: 11px; color: var(--kut-muted); font-weight: 600; margin-left: 3px; }
    .amount--paid { color: var(--kut-muted); text-decoration: line-through; }

    .date-cell { font-size: 13px; color: var(--kut-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .date-cell__sub { font-size: 12px; color: var(--kut-muted); margin-top: 2px; }
    .date-cell__sub.is-overdue { color: var(--kut-warn); font-weight: 600; }
    .date-cell__sub.is-danger  { color: var(--kut-danger); font-weight: 600; }

    .row-actions { display: inline-flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .icon-btn { width: 36px; height: 36px; display: grid; place-items: center;
      border: 1px solid var(--kut-border); background: #fff;
      color: var(--kut-muted); border-radius: 10px; cursor: pointer;
      font-family: inherit; font-size: 16px; transition: all .15s ease; }
    .icon-btn:hover { color: var(--kut-green); border-color: var(--kut-green); background: var(--kut-green-soft); }
    .icon-btn--wa { color: var(--kut-whatsapp); border-color: rgba(37,211,102,.3); }
    .icon-btn--wa:hover { color: #fff; background: var(--kut-whatsapp); border-color: var(--kut-whatsapp); }
    .icon-btn--pay { color: var(--kut-green); border-color: rgba(0,95,64,.3); background: var(--kut-green-soft); }
    .icon-btn--pay:hover { color: #fff; background: var(--kut-green); border-color: var(--kut-green); }
    .icon-btn--danger:hover { color: var(--kut-danger); border-color: var(--kut-danger); background: rgba(192,57,43,.06); }

    .empty { padding: 60px 20px; text-align: center; color: var(--kut-muted); }
    .empty__icon { font-size: 42px; margin-bottom: 12px; opacity: .85; }
    .empty h3 { margin: 0 0 6px; color: var(--kut-text); font-size: 17px; }
    .empty p { margin: 0 0 18px; font-size: 14px; }

    @media (max-width: 860px) {
      .debts-table thead { display: none; }
      .debts-table, .debts-table tbody, .debts-table tr, .debts-table td { display: block; width: 100%; }
      .debts-table tr { border-bottom: 1px solid var(--kut-border); padding: 14px; }
      .debts-table tr:last-child { border-bottom: none; }
      .debts-table td { border: none; padding: 4px 0;
        display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .debts-table td::before { content: attr(data-label);
        font-size: 12px; text-transform: uppercase; letter-spacing: .5px;
        font-weight: 700; color: var(--kut-muted); flex-shrink: 0; }
      .debts-table td[data-label="Клиент"] { display: block; padding-bottom: 8px; }
      .debts-table td[data-label="Клиент"]::before { display: none; }
      .client__name, .client__note { max-width: none; white-space: normal; }
      .row-actions { justify-content: flex-start; padding-top: 6px; }
    }

    .modal[hidden] { display: none; }
    .modal { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 16px; }
    .modal__backdrop { position: absolute; inset: 0;
      background: rgba(15, 30, 24, .5); backdrop-filter: blur(4px); }
    .modal__dialog { position: relative; width: 100%; max-width: 520px;
      background: var(--kut-surface); border-radius: var(--radius-lg);
      padding: 22px; box-shadow: var(--shadow-lg);
      max-height: 92dvh; overflow-y: auto; }
    .modal__dialog h3 { margin: 0 0 4px; font-size: 19px; font-weight: 700; }
    .modal__subtitle { margin: 0 0 18px; color: var(--kut-muted); font-size: 13px; }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field--full { grid-column: 1 / -1; }
    .field label { font-size: 13px; font-weight: 600; color: var(--kut-text); }
    .field label .req { color: var(--kut-danger); margin-left: 2px; }
    .field input, .field select, .field textarea {
      width: 100%; padding: 12px 14px; border-radius: 10px;
      border: 1.5px solid var(--kut-border); background: #fff;
      font-family: inherit; font-size: 15px; color: var(--kut-text); outline: none; }
    .field textarea { resize: vertical; min-height: 70px; }
    .field input:focus, .field select:focus, .field textarea:focus {
      border-color: var(--kut-green); box-shadow: 0 0 0 4px rgba(0,95,64,.12); }
    .field input.is-invalid { border-color: var(--kut-danger); box-shadow: 0 0 0 4px rgba(192,57,43,.12); }
    .field__hint { font-size: 12px; color: var(--kut-muted); min-height: 14px; }
    .field__hint.is-error { color: var(--kut-danger); font-weight: 500; }

    .input-group { display: flex; align-items: stretch; }
    .input-group input { border-top-right-radius: 0; border-bottom-right-radius: 0; border-right: none; }
    .input-group__suffix { display: inline-flex; align-items: center; padding: 0 12px;
      background: #FBFDFC; border: 1.5px solid var(--kut-border);
      border-left: none; border-top-right-radius: 10px; border-bottom-right-radius: 10px;
      font-size: 13px; font-weight: 600; color: var(--kut-muted); }

    .modal__actions { display: flex; gap: 10px; margin-top: 20px; }
    .modal__actions .btn { flex: 1; }

    .lang-options { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 8px; }
    .lang-option { display: flex; align-items: center; gap: 12px; padding: 14px;
      border: 1.5px solid var(--kut-border); background: #fff;
      border-radius: 14px; font-family: inherit; font-size: 15px;
      font-weight: 600; color: var(--kut-text); cursor: pointer;
      text-align: left; transition: all .18s ease; }
    .lang-option:hover { border-color: var(--kut-green); background: var(--kut-green-soft); }
    .lang-option__flag { width: 42px; height: 42px; display: grid; place-items: center;
      background: #fff; border-radius: 12px; font-size: 22px;
      box-shadow: var(--shadow-sm); flex-shrink: 0; }
    .lang-option__preview { font-size: 12px; font-weight: 500;
      color: var(--kut-muted); margin-top: 2px; line-height: 1.3; }

    .info-panel { background: var(--kut-green-soft); border-radius: 12px;
      padding: 14px; margin-bottom: 14px; }
    .info-panel__row { display: flex; justify-content: space-between;
      align-items: baseline; gap: 12px; font-size: 14px; }
    .info-panel__row + .info-panel__row { margin-top: 8px; padding-top: 8px;
      border-top: 1px dashed rgba(0,95,64,.15); }
    .info-panel__label { color: var(--kut-muted); font-size: 13px; }
    .info-panel__value { font-weight: 700; color: var(--kut-green); font-variant-numeric: tabular-nums; }
    .info-panel__value--big { font-size: 20px; }

    .quick-amounts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .quick-amount { border: 1px solid var(--kut-border); background: #fff;
      padding: 6px 12px; border-radius: 999px;
      font-size: 13px; font-weight: 600; color: var(--kut-text);
      cursor: pointer; font-family: inherit; }
    .quick-amount:hover { border-color: var(--kut-green); color: var(--kut-green); background: var(--kut-green-soft); }

    .payments-list { margin-top: 14px; border-top: 1px solid var(--kut-border); padding-top: 12px; }
    .payments-list h4 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase;
      letter-spacing: .5px; color: var(--kut-muted); font-weight: 700; }
    .payment-row { display: flex; justify-content: space-between; font-size: 13px;
      padding: 6px 0; border-bottom: 1px dashed var(--kut-border); }
    .payment-row:last-child { border-bottom: none; }
    .payment-row__amount { font-weight: 700; color: var(--kut-green); font-variant-numeric: tabular-nums; }
    .payment-row__date { color: var(--kut-muted); }

    button { -webkit-tap-highlight-color: transparent; }

    /* ===== BOTTOM NAV ===== */
    .bottom-nav {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; height: 68px;
      display: grid; grid-template-columns: 1fr 1fr 88px 1fr 1fr; align-items: center;
      background: rgba(255,255,255,.96);
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid rgba(0,95,64,.10);
      padding: 4px 6px calc(4px + env(safe-area-inset-bottom));
      box-shadow: 0 -8px 28px rgba(16,32,25,.08);
    }
    .bottom-nav__item {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 2px; padding: 6px 2px; border-radius: 12px;
      text-decoration: none; color: var(--kut-muted);
      font-family: inherit; font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .3px;
      transition: background .18s ease, color .18s ease, transform .12s ease;
      -webkit-tap-highlight-color: transparent; min-width: 0;
    }
    .bottom-nav__item:active { transform: scale(.94); }
    .bottom-nav__icon { font-size: 22px; line-height: 1;
      filter: grayscale(.4) opacity(.85);
      transition: filter .18s ease, transform .18s ease; }
    .bottom-nav__item.active { color: var(--kut-green); background: var(--kut-green-soft); }
    .bottom-nav__item.active .bottom-nav__icon { filter: none; transform: translateY(-1px); }
    .bottom-nav__scan {
      position: relative; display: grid; place-items: center;
      width: 76px; height: 76px; margin: -24px auto 0; border-radius: 50%;
      border: 5px solid #fff; background: linear-gradient(135deg, #FFD86B, #D4AF37);
      color: #003F2A; font-size: 34px; cursor: pointer; padding: 0;
      box-shadow: 0 10px 24px rgba(212,175,55,.55), 0 4px 10px rgba(16,32,25,.18);
      transition: transform .15s ease, box-shadow .18s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .bottom-nav__scan:active { transform: scale(.94); }
    .bottom-nav__scan::after {
      content: ""; position: absolute; inset: -8px; border-radius: 50%;
      border: 2px solid rgba(212,175,55,.35);
      animation: navScanPulse 2.2s ease-in-out infinite; pointer-events: none;
    }
    @keyframes navScanPulse {
      0%, 100% { transform: scale(1); opacity: .55; }
      50%      { transform: scale(1.12); opacity: .15; }
    }
    @media (min-width: 1000px) { .bottom-nav { display: none !important; } }
  </style>
</head>
<body class="page-debts">

  <script>
    (function () {
      var BUILD = 'v8.1-NET-PILL-DEBTS';
      var saved = null;
      try { saved = localStorage.getItem('kut_build'); } catch (e) { return; }
      if (saved === BUILD) return;
      try { localStorage.setItem('kut_build', BUILD); } catch (e) {}
      var todo = [];
      if ('serviceWorker' in navigator) {
        todo.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        }).catch(function () {}));
      }
      if ('caches' in window) {
        todo.push(caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }).catch(function () {}));
      }
      Promise.all(todo).then(function () {
        setTimeout(function () {
          try {
            var url = new URL(window.location.href);
            url.searchParams.set('_cb', Date.now().toString(36));
            window.location.replace(url.toString());
          } catch (e) { window.location.reload(); }
        }, 200);
      });
    })();
  </script>

  <!-- Единая шапка: бренд + сеть + язык (без навигации) -->
  <header class="mobile-bar">
    <span class="mobile-bar__title">КУТ: БИЗНЕС · Несие</span>

    <span class="net-pill" id="net-pill" title="Состояние соединения" data-queue="0">
      <span class="net-pill__dot" aria-hidden="true"></span>
      <span class="net-pill__label">онлайн</span>
      <span class="net-pill__qty" id="net-queue-qty">0</span>
    </span>

    <div data-kut-lang></div>
  </header>

  <main class="wrap">
    <div class="page-head">
      <div>
        <h1>Несие — учёт долгов</h1>
        <p>Тетрадь долгов в облаке: WhatsApp-напоминания, частичное погашение, архив</p>
      </div>
      <button class="btn btn--primary" id="openAddBtn" type="button">
        <span aria-hidden="true">＋</span> Записать новый долг
      </button>
    </div>

    <section class="stats">
      <div class="stat">
        <div class="stat__icon" aria-hidden="true">💵</div>
        <div>
          <div class="stat__label">Общая сумма долгов</div>
          <div class="stat__value" id="statTotal">0<small>KGS</small></div>
        </div>
      </div>
      <div class="stat stat--gold">
        <div class="stat__icon" aria-hidden="true">👥</div>
        <div>
          <div class="stat__label">Должников</div>
          <div class="stat__value" id="statCount">0<small>чел.</small></div>
        </div>
      </div>
      <div class="stat stat--warn">
        <div class="stat__icon" aria-hidden="true">⏰</div>
        <div>
          <div class="stat__label">Просрочено &gt; 30 дней</div>
          <div class="stat__value" id="statOverdue">0<small>чел.</small></div>
        </div>
      </div>
    </section>

    <div class="tabs" role="tablist">
      <button class="tab is-active" type="button" role="tab" data-tab="active">
        Активные <span class="tab__badge" id="tabActiveCount">0</span>
      </button>
      <button class="tab" type="button" role="tab" data-tab="paid">
        Архив (погашено) <span class="tab__badge" id="tabPaidCount">0</span>
      </button>
    </div>

    <section class="toolbar">
      <div class="search">
        <input type="search" id="searchInput"
          placeholder="Поиск по имени или номеру телефона..." autocomplete="off">
      </div>
    </section>

    <section class="debts-card">
      <table class="debts-table" id="debtsTable">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Телефон</th>
            <th>Сумма долга</th>
            <th>Дата</th>
            <th aria-label="Действия"></th>
          </tr>
        </thead>
        <tbody id="debtsBody"></tbody>
      </table>
      <div id="debtsEmpty" class="empty" hidden>
        <div class="empty__icon" aria-hidden="true">📒</div>
        <h3 id="emptyTitle">Пока долгов нет</h3>
        <p id="emptyText">Отличная работа — все клиенты расплатились!</p>
        <button class="btn btn--gold" type="button" id="emptyAddBtn">＋ Записать долг</button>
      </div>
    </section>
  </main>

  <div class="modal" id="debtModal" hidden>
    <div class="modal__backdrop" data-close></div>
    <div class="modal__dialog" role="dialog" aria-modal="true">
      <h3 id="debtModalTitle">Новый долг</h3>
      <p class="modal__subtitle" id="debtModalSub">Запишите клиента и сумму — потом напомним в WhatsApp.</p>

      <form id="debtForm" novalidate>
        <input type="hidden" id="debtId">
        <div class="form-grid">
          <div class="field field--full">
            <label for="fName">Имя клиента <span class="req">*</span></label>
            <input type="text" id="fName" placeholder="Например: Азамат"
              maxlength="60" autocomplete="off" required>
            <div class="field__hint" data-for="fName"></div>
          </div>

          <div class="field field--full">
            <label for="fPhone">Телефон <span class="req">*</span></label>
            <input type="tel" id="fPhone"
              placeholder="0700 12 34 56 или +996 700 123 456"
              inputmode="tel" autocomplete="off" required>
            <div class="field__hint" data-for="fPhone">Можно вводить с нуля — код +996 подставится автоматически.</div>
          </div>

          <div class="field">
            <label for="fAmount">Сумма долга <span class="req">*</span></label>
            <div class="input-group">
              <input type="number" id="fAmount" inputmode="decimal" min="0" step="0.01"
                placeholder="0" required>
              <span class="input-group__suffix">KGS</span>
            </div>
            <div class="field__hint" data-for="fAmount"></div>
          </div>

          <div class="field">
            <label for="fDate">Дата взятия <span class="req">*</span></label>
            <input type="date" id="fDate" required>
            <div class="field__hint" data-for="fDate"></div>
          </div>

          <div class="field field--full">
            <label for="fDueDate">Срок возврата (необязательно)</label>
            <input type="date" id="fDueDate">
            <div class="field__hint">Если указать — напомним заранее.</div>
          </div>

          <div class="field field--full">
            <label for="fNote">Заметка (необязательно)</label>
            <textarea id="fNote" maxlength="200"
              placeholder="Например: обещал вернуть после зарплаты 10-го"></textarea>
            <div class="field__hint" data-for="fNote"></div>
          </div>
        </div>

        <div class="modal__actions">
          <button class="btn btn--ghost" type="button" data-close>Отмена</button>
          <button class="btn btn--primary" type="submit" id="saveBtn">Записать долг</button>
        </div>
      </form>
    </div>
  </div>

  <div class="modal" id="payModal" hidden>
    <div class="modal__backdrop" data-close></div>
    <div class="modal__dialog" role="dialog" aria-modal="true">
      <h3>Погашение долга</h3>
      <p class="modal__subtitle" id="payClientName"></p>

      <div class="info-panel">
        <div class="info-panel__row">
          <span class="info-panel__label">Текущий долг</span>
          <span class="info-panel__value info-panel__value--big" id="payCurrentDebt">0 KGS</span>
        </div>
        <div class="info-panel__row">
          <span class="info-panel__label">Взято</span>
          <span class="info-panel__value" id="payOriginalDate">—</span>
        </div>
      </div>

      <form id="payForm" novalidate>
        <div class="form-grid">
          <div class="field field--full">
            <label for="payAmount">Сумма к оплате <span class="req">*</span></label>
            <div class="input-group">
              <input type="number" id="payAmount" inputmode="decimal" min="0" step="0.01"
                placeholder="0" required>
              <span class="input-group__suffix">KGS</span>
            </div>
            <div class="field__hint" data-for="payAmount"></div>
            <div class="quick-amounts" id="quickAmounts">
              <button class="quick-amount" type="button" data-q="full">Весь долг</button>
              <button class="quick-amount" type="button" data-q="1000">1 000</button>
              <button class="quick-amount" type="button" data-q="500">500</button>
              <button class="quick-amount" type="button" data-q="200">200</button>
            </div>
          </div>
        </div>

        <div class="payments-list" id="paymentsHistory"></div>

        <div class="modal__actions">
          <button class="btn btn--ghost" type="button" data-close>Отмена</button>
          <button class="btn btn--primary" type="submit" id="confirmPayBtn">Погасить</button>
        </div>
      </form>
    </div>
  </div>

  <div class="modal" id="waModal" hidden>
    <div class="modal__backdrop" data-close></div>
    <div class="modal__dialog" role="dialog" aria-modal="true">
      <h3>Напомнить в WhatsApp</h3>
      <p class="modal__subtitle" id="waClientInfo"></p>

      <div class="lang-options">
        <button class="lang-option" type="button" data-lang="ru">
          <span class="lang-option__flag">🇷🇺</span>
          <span>
            <span>По-русски</span>
            <span class="lang-option__preview" id="previewRu"></span>
          </span>
        </button>
        <button class="lang-option" type="button" data-lang="kg">
          <span class="lang-option__flag">🇰🇬</span>
          <span>
            <span>Кыргызча</span>
            <span class="lang-option__preview" id="previewKg"></span>
          </span>
        </button>
      </div>

      <div class="modal__actions">
        <button class="btn btn--ghost btn--block" type="button" data-close>Отмена</button>
      </div>
    </div>
  </div>

  <div class="modal" id="deleteModal" hidden>
    <div class="modal__backdrop" data-close></div>
    <div class="modal__dialog" role="dialog" aria-modal="true">
      <h3>Удалить запись о долге?</h3>
      <p class="modal__subtitle" id="deleteName"></p>
      <p style="color:var(--kut-muted); font-size:13px; margin:0 0 4px;">Действие нельзя отменить.</p>
      <div class="modal__actions">
        <button class="btn btn--ghost" type="button" data-close>Отмена</button>
        <button class="btn btn--danger" type="button" id="confirmDeleteBtn">Удалить</button>
      </div>
    </div>
  </div>

  <nav class="bottom-nav" id="bottomNav" aria-label="Основная навигация">
    <a href="./index.html" class="bottom-nav__item" data-page="index">
      <span class="bottom-nav__icon" aria-hidden="true">🏠</span>
      <span>Главная</span>
    </a>
    <a href="./stock.html" class="bottom-nav__item" data-page="stock">
      <span class="bottom-nav__icon" aria-hidden="true">📦</span>
      <span>Склад</span>
    </a>
    <button type="button" class="bottom-nav__scan" id="bottomNavScan" aria-label="Сканировать штрихкод">
      <span aria-hidden="true">📷</span>
    </button>
    <a href="./cash.html" class="bottom-nav__item" data-page="cash">
      <span class="bottom-nav__icon" aria-hidden="true">⚡</span>
      <span>Касса</span>
    </a>
    <a href="./debts.html" class="bottom-nav__item" data-page="debts">
      <span class="bottom-nav__icon" aria-hidden="true">📒</span>
      <span>Несие</span>
    </a>
  </nav>

  <script type="module" src="./js/app.js"></script>
  <script type="module" src="./js/debts.js"></script>
  <script src="./js/lang.js"></script>
</body>
</html>
