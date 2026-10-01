/* =========================================================
   scanner.js v2.1 — Универсальный сканер штрих-кодов
   
   Публичный API:
     KUTScanner.open(callback)         — открыть сканер
     KUTScanner.close()                — закрыть
     KUTScanner.mountButton(target,cb) — вставить кнопку
     KUTScanner.initBarcodeScanner(cb) — заглушка (готова к внедрению)
   
   Автоматически подгружает html5-qrcode@2.3.8 с CDN.
   Не требует правок HTML — стили и шторку инжектит сам.
   ========================================================= */

(function () {
  'use strict';

  const LIB_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
  const READER_ID = 'kut-scanner-reader';
  const MODAL_ID = 'kut-scanner-modal';
  const STYLE_ID = 'kut-scanner-styles';

  let libPromise = null;
  let instance = null;
  let isScanning = false;
  let successCb = null;
  let audioCtx = null;
  let lastCode = null;
  let lastAt = 0;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      .kut-scanner-btn {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 8px; padding: 13px 18px; min-height: 48px;
        background: linear-gradient(135deg, #E7C14A, #B88F1D); color: #06150F;
        border: none; border-radius: 14px; font-size: 15px; font-weight: 700;
        font-family: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent;
        box-shadow: 0 10px 26px rgba(212,175,55,.35);
      }
      .kut-scanner-btn:active { transform: scale(.97); }
      .kut-scanner-btn svg { width: 20px; height: 20px; }

      #${MODAL_ID} {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,.78); display: none;
        align-items: stretch; justify-content: center; font-family: inherit;
      }
      #${MODAL_ID}.kut-open { display: flex; }
      #${MODAL_ID} .kut-sheet {
        width: 100%; height: 100dvh; max-width: 640px;
        background: #0A1F18; color: #EDF5F1;
        display: flex; flex-direction: column; overflow: hidden;
      }
      @supports not (height: 100dvh) { #${MODAL_ID} .kut-sheet { height: 100vh; } }
      #${MODAL_ID} .kut-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.10);
        flex: 0 0 auto;
      }
      #${MODAL_ID} .kut-title { font-size: 16px; font-weight: 700; }
      #${MODAL_ID} .kut-close {
        width: 44px; height: 44px; display: grid; place-items: center;
        background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
        border-radius: 12px; color: #EDF5F1; font-size: 20px;
        cursor: pointer; font-family: inherit;
      }
      #${MODAL_ID} .kut-viewport {
        position: relative; flex: 1 1 auto; min-height: 0; background: #000; overflow: hidden;
      }
      #${READER_ID} { position: absolute; inset: 0; width: 100%; height: 100%; }
      #${READER_ID} video {
        width: 100% !important; height: 100% !important;
        object-fit: cover !important; display: block;
      }
      #${READER_ID} img[alt="Info icon"] { display: none !important; }
      #${READER_ID} > div > span { display: none !important; }

      #${MODAL_ID} .kut-overlay {
        position: absolute; inset: 0; pointer-events: none;
        display: flex; align-items: center; justify-content: center;
      }
      #${MODAL_ID} .kut-frame {
        position: relative; width: 78%; max-width: 420px;
        height: 36%; max-height: 220px;
        border: 2px solid #4ade80; border-radius: 14px;
        box-shadow: 0 0 0 9999px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .kut-frame::before {
        content: ""; position: absolute; left: 6px; right: 6px; top: 0;
        height: 2px; border-radius: 2px;
        background: linear-gradient(90deg, transparent, #4ade80, transparent);
        animation: kutScanLine 2.2s linear infinite;
      }
      @keyframes kutScanLine {
        0%   { transform: translateY(0); opacity: .4; }
        50%  { transform: translateY(calc(100% - 2px)); opacity: 1; }
        100% { transform: translateY(0); opacity: .4; }
      }
      #${MODAL_ID} .kut-hint {
        padding: 12px 16px 4px; text-align: center;
        font-size: 14px; color: #9fb8a9; flex: 0 0 auto;
      }
      #${MODAL_ID} .kut-hint.kut-error { color: #f87171; }
      #${MODAL_ID} .kut-actions {
        padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
        display: flex; gap: 10px; flex: 0 0 auto;
      }
      #${MODAL_ID} .kut-cancel {
        flex: 1; min-height: 52px; padding: 14px;
        background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10);
        color: #EDF5F1; border-radius: 12px; font-size: 15px; font-weight: 700;
        font-family: inherit; cursor: pointer;
      }
      @media (orientation: landscape) {
        #${MODAL_ID} .kut-frame { width: 50%; max-width: 360px; height: 46%; }
      }
    `;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function injectModal() {
    if (document.getElementById(MODAL_ID)) return;
    const m = document.createElement('div');
    m.id = MODAL_ID;
    m.setAttribute('aria-hidden', 'true');
    m.innerHTML = `
      <div class="kut-sheet" role="dialog" aria-modal="true">
        <div class="kut-head">
          <div class="kut-title">Сканирование штрих-кода</div>
          <button type="button" class="kut-close" aria-label="Закрыть">✕</button>
        </div>
        <div class="kut-viewport">
          <div id="${READER_ID}"></div>
          <div class="kut-overlay"><div class="kut-frame"></div></div>
        </div>
        <div class="kut-hint">Наведите камеру на штрих-код товара</div>
        <div class="kut-actions">
          <button type="button" class="kut-cancel">Отмена</button>
        </div>
      </div>`;
    document.body.appendChild(m);

    m.querySelector('.kut-close').addEventListener('click', stop);
    m.querySelector('.kut-cancel').addEventListener('click', stop);
    m.addEventListener('click', (e) => { if (e.target === m) stop(); });
  }

  function loadLibrary() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB_URL; s.async = true;
      s.onload = resolve;
      s.onerror = () => { libPromise = null; reject(new Error('load failed')); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1400, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.15);
    } catch (_) {}
  }

  function vibrate(ms) {
    try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {}
  }

  function onDecoded(text) {
    const now = Date.now();
    if (text === lastCode && now - lastAt < 1500) return;
    lastCode = text; lastAt = now;

    beep(); vibrate(80);

    const cb = successCb;
    successCb = null;

    stop().then(() => {
      if (typeof cb === 'function') {
        try { cb(text); }
        catch (e) { console.error('[KUTScanner] cb error:', e); }
      }
    });
  }

  async function open(cb) {
    if (isScanning) return;
    successCb = typeof cb === 'function' ? cb : null;

    injectStyles();
    injectModal();

    const m = document.getElementById(MODAL_ID);
    const hint = m.querySelector('.kut-hint');
    hint.classList.remove('kut-error');
    hint.textContent = 'Наведите камеру на штрих-код товара';
    m.classList.add('kut-open');
    m.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    try {
      await loadLibrary();
    } catch (err) {
      hint.classList.add('kut-error');
      hint.textContent = 'Не удалось загрузить сканер. Проверьте интернет.';
      return;
    }

    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));

    instance = new window.Html5Qrcode(READER_ID, { verbose: false });

    const config = {
      fps: 10,
      aspectRatio: 1.777,
      disableFlip: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };

    try {
      await instance.start(
        { facingMode: 'environment' },
        config,
        onDecoded,
        () => {}
      );
      isScanning = true;
    } catch (err) {
      console.error('[KUTScanner] start error:', err);
      hint.classList.add('kut-error');
      hint.textContent = 'Не удалось открыть камеру. Разрешите доступ.';
    }
  }

  async function stop() {
    if (instance && isScanning) {
      try { await instance.stop(); instance.clear(); }
      catch (e) { console.warn('[KUTScanner] stop warn:', e); }
    }
    instance = null;
    isScanning = false;

    const m = document.getElementById(MODAL_ID);
    if (m) {
      m.classList.remove('kut-open');
      m.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  function iconSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  }

  function mountButton(target, cb, opts) {
    injectStyles();
    opts = opts || {};
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kut-scanner-btn';
    btn.innerHTML = iconSvg() + '<span>' + (opts.label || 'Открыть сканер') + '</span>';
    btn.addEventListener('click', () => open(cb));
    host.appendChild(btn);
    return btn;
  }

  function initBarcodeScanner(opts) {
    opts = opts || {};
    const cb = typeof opts.onScan === 'function' ? opts.onScan : (code) => console.log('[scan]', code);
    if (opts.target) {
      return mountButton(opts.target, cb, { label: opts.label });
    }
    return { open: () => open(cb), close: stop };
  }

  window.KUTScanner = {
    open,
    close: stop,
    mountButton,
    initBarcodeScanner,
    isOpen: () => isScanning,
  };
  window.openBarcodeScanner = open;
  window.initBarcodeScanner = initBarcodeScanner;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isScanning) stop();
  });
})();
