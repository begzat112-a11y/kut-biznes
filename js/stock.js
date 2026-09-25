/* =========================================================
   КУТ: БИЗНЕС — Модуль «Склад и товары» (stock.js)
   Схема позиции: { id, name, category, unit, qty, costPrice,
                    salePrice, barcode, createdAt, updatedAt }
   Обновлено: поле «Штрихкод» + кнопка сканера через камеру.
   ========================================================= */

const STORAGE_KEY = (window.KUT?.keys?.products) || 'kut_products';
const LOW_STOCK_THRESHOLD = 5;

const CATEGORIES = ['Одежда', 'Продукты', 'Напитки', 'Выпечка', 'Услуги', 'Хозтовары', 'Другое'];
const CHIP_CATEGORIES = ['Все', ...CATEGORIES];

// ---------- Демо-набор (только для самого первого запуска) ----------
const SEED_PRODUCTS = [
  { id: 'p01', name: 'Лепёшка',                category: 'Выпечка',   unit: 'шт',   qty: 40,  costPrice: 18,   salePrice: 25,   barcode: '2000000000001' },
  { id: 'p02', name: 'Боорсок (порция)',       category: 'Выпечка',   unit: 'порц.',qty: 12,  costPrice: 40,   salePrice: 60,   barcode: '2000000000002' },
  { id: 'p03', name: 'Самса',                  category: 'Выпечка',   unit: 'шт',   qty: 18,  costPrice: 42,   salePrice: 60,   barcode: '2000000000003' },
  { id: 'p04', name: 'Хлеб булка',             category: 'Выпечка',   unit: 'шт',   qty: 25,  costPrice: 22,   salePrice: 30,   barcode: '2000000000004' },
  { id: 'p05', name: 'Чай чёрный (пачка)',     category: 'Напитки',   unit: 'шт',   qty: 30,  costPrice: 140,  salePrice: 180,  barcode: '2000000000005' },
  { id: 'p06', name: 'Вода 1,5 л',             category: 'Напитки',   unit: 'шт',   qty: 60,  costPrice: 32,   salePrice: 45,   barcode: '2000000000006' },
  { id: 'p07', name: 'Кола 1 л',               category: 'Напитки',   unit: 'шт',   qty: 4,   costPrice: 68,   salePrice: 90,   barcode: '2000000000007' },
  { id: 'p08', name: 'Сок 1 л',                category: 'Напитки',   unit: 'шт',   qty: 3,   costPrice: 85,   salePrice: 110,  barcode: '2000000000008' },
  { id: 'p09', name: 'Молоко 1 л',             category: 'Продукты',  unit: 'шт',   qty: 15,  costPrice: 58,   salePrice: 75,   barcode: '2000000000009' },
  { id: 'p10', name: 'Яйца (10 шт)',           category: 'Продукты',  unit: 'шт',   qty: 22,  costPrice: 105,  salePrice: 130,  barcode: '2000000000010' },
  { id: 'p11', name: 'Рис 1 кг',               category: 'Продукты',  unit: 'кг',   qty: 30,  costPrice: 95,   salePrice: 120,  barcode: '2000000000011' },
  { id: 'p12', name: 'Сахар 1 кг',             category: 'Продукты',  unit: 'кг',   qty: 20,  costPrice: 78,   salePrice: 95,   barcode: '2000000000012' },
  { id: 'p13', name: 'Масло растительное 1 л', category: 'Продукты',  unit: 'л',    qty: 2,   costPrice: 135,  salePrice: 170,  barcode: '2000000000013' },
  { id: 'p14', name: 'Макароны',               category: 'Продукты',  unit: 'шт',   qty: 35,  costPrice: 52,   salePrice: 70,   barcode: '2000000000014' },
  { id: 'p15', name: 'Мыло',                   category: 'Хозтовары', unit: 'шт',   qty: 25,  costPrice: 28,   salePrice: 40,   barcode: '2000000000015' },
  { id: 'p16', name: 'Стиральный порошок',     category: 'Хозтовары', unit: 'шт',   qty: 8,   costPrice: 140,  salePrice: 180,  barcode: '2000000000016' },
  { id: 'p17', name: 'Салфетки',               category: 'Хозтовары', unit: 'шт',   qty: 50,  costPrice: 20,   salePrice: 30,   barcode: '2000000000017' },
  { id: 'p18', name: 'Пакет',                  category: 'Хозтовары', unit: 'шт',   qty: 100, costPrice: 3,    salePrice: 5,    barcode: '2000000000018' },
  { id: 'p19', name: 'Джинсы Турция',          category: 'Одежда',    unit: 'шт',   qty: 4,   costPrice: 1400, salePrice: 2200, barcode: '2000000000019' },
  { id: 'p20', name: 'Свитер мужской',         category: 'Одежда',    unit: 'шт',   qty: 6,   costPrice: 900,  salePrice: 1500, barcode: '2000000000020' },
  { id: 'p21', name: 'Футболка базовая',       category: 'Одежда',    unit: 'шт',   qty: 12,  costPrice: 300,  salePrice: 550,  barcode: '2000000000021' },
  { id: 'p22', name: 'Стрижка мужская',        category: 'Услуги',    unit: 'усл.', qty: 999, costPrice: 0,    salePrice: 350,  barcode: '' },
];

const state = {
  products: [],
  search: '',
  category: 'Все',
  editingId: null,
  deletingId: null,
};

const $ = (sel) => document.querySelector(sel);
const el = {
  openAddBtn:   $('#openAddBtn'),
  emptyAddBtn:  $('#emptyAddBtn'),
  searchInput:  $('#searchInput'),
  chips:        $('#categoryChips'),

  stockBody:    $('#stockBody'),
  stockTable:   $('#stockTable'),
  stockEmpty:   $('#stockEmpty'),

  statTotalItems:  $('#statTotalItems'),
  statStockValue:  $('#statStockValue'),
  statLowStock:    $('#statLowStock'),

  productModal:      $('#productModal'),
  productModalTitle: $('#productModalTitle'),
  productModalSub:   $('#productModalSub'),
  productForm:       $('#productForm'),
  productId:         $('#productId'),
  fName:             $('#fName'),
  fCategory:         $('#fCategory'),
  fUnit:             $('#fUnit'),
  fQty:              $('#fQty'),
  fCost:             $('#fCost'),
  fSale:             $('#fSale'),
  saveBtn:           $('#saveBtn'),

  previewProfit:     $('#previewProfit'),
  previewMarkup:     $('#previewMarkup'),
  previewStockValue: $('#previewStockValue'),

  deleteModal:     $('#deleteModal'),
  deleteName:      $('#deleteName'),
  confirmDeleteBtn:$('#confirmDeleteBtn'),

  toast: $('#toast'),
};

// =========================================================
// УТИЛИТЫ
// =========================================================

const fmt = (n) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) {
    console.warn('localStorage write failed:', e);
    showToast('Не удалось сохранить данные локально', true);
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function uid() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

let toastTimer = null;
function showToast(message, isError = false) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.toggle('toast--error', isError);
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

// =========================================================
// ЗВУК И СКАНЕР (html5-qrcode через CDN)
// =========================================================

let html5QrcodePromise = null;

function loadHtml5Qrcode() {
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
  if (html5QrcodePromise) return html5QrcodePromise;

  html5QrcodePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.async = true;
    script.onload = () => {
      if (window.Html5Qrcode) resolve(window.Html5Qrcode);
      else reject(new Error('html5-qrcode не инициализирован'));
    };
    script.onerror = () => reject(new Error('Не удалось загрузить html5-qrcode'));
    document.head.appendChild(script);
  });

  return html5QrcodePromise;
}

// Универсальное модальное окно сканера (переиспользуется)
let scannerModal = null;
let scannerInstance = null;

function ensureScannerModal() {
  if (scannerModal) return scannerModal;

  scannerModal = document.createElement('div');
  scannerModal.className = 'modal';
  scannerModal.id = 'scannerModal';
  scannerModal.hidden = true;
  scannerModal.innerHTML = `
    <div class="modal__backdrop" data-close-scanner></div>
    <div class="modal__dialog" role="dialog" aria-modal="true" style="max-width: 520px;">
      <h3 style="margin:0 0 4px;">📷 Сканер штрихкода</h3>
      <p style="margin:0 0 14px; color:#64776E; font-size:13px;">
        Наведите камеру на штрихкод товара. Распознавание произойдёт автоматически.
      </p>
      <div id="scannerReader" style="width:100%; border-radius:14px; overflow:hidden; background:#000; min-height:220px;"></div>
      <div style="display:flex; gap:10px; margin-top:16px;">
        <button class="btn btn--ghost btn--block" type="button" data-close-scanner>Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(scannerModal);

  scannerModal.addEventListener('click', (e) => {
    if (e.target.matches('[data-close-scanner]')) stopScanner();
  });

  return scannerModal;
}

async function openScanner(onDecoded) {
  try {
    const Html5Qrcode = await loadHtml5Qrcode();
    const modal = ensureScannerModal();
    const readerEl = modal.querySelector('#scannerReader');
    readerEl.innerHTML = '';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    scannerInstance = new Html5Qrcode('scannerReader');

    const config = {
      fps: 10,
      qrbox: { width: 280, height: 180 },
      aspectRatio: 1.0,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.QR_CODE,
      ],
    };

    await scannerInstance.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        if (navigator.vibrate) navigator.vibrate(80);
        const code = String(decodedText).trim();
        if (typeof onDecoded === 'function') onDecoded(code);
      },
      () => { /* ошибки чтения — норма */ }
    );
  } catch (err) {
    console.error('[scanner]', err);
    showToast('Не удалось запустить камеру. Проверьте разрешения.', true);
    stopScanner();
  }
}

function stopScanner() {
  try {
    if (scannerInstance) {
      const inst = scannerInstance;
      scannerInstance = null;
      inst.stop().then(() => inst.clear()).catch(() => {});
    }
  } catch (_) {}
  if (scannerModal) scannerModal.hidden = true;
  document.body.style.overflow = '';
}

// =========================================================
// ПОЛЕ ШТРИХКОДА В ФОРМЕ ТОВАРА
// =========================================================

function ensureBarcodeField() {
  if (document.getElementById('fBarcode')) {
    el.fBarcode = document.getElementById('fBarcode');
    el.barcodeScanBtn = document.getElementById('barcodeScanBtn');
    if (el.barcodeScanBtn) {
      el.barcodeScanBtn.addEventListener('click', () => {
        openScanner((code) => {
          el.fBarcode.value = code;
          showToast('Штрихкод считан: ' + code);
        });
      });
    }
    return;
  }

  const form = document.getElementById('productForm');
  if (!form) return;
  const grid = form.querySelector('.form-grid');
  if (!grid) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'field field--full';
  wrapper.innerHTML = `
    <label for="fBarcode">Штрихкод (Barcode)</label>
    <div style="display:flex; gap:8px; align-items:stretch;">
      <input type="text" id="fBarcode" placeholder="Введите цифры или отсканируйте"
             inputmode="numeric" autocomplete="off" style="flex:1; min-width:0;">
      <button type="button" id="barcodeScanBtn" class="btn btn--ghost"
              style="white-space:nowrap; padding:0 14px;" title="Включить камеру">
        📷 Считать штрихкод
      </button>
    </div>
    <div class="field__hint" data-for="fBarcode">Введите вручную или отсканируйте с упаковки товара.</div>
  `;
  grid.appendChild(wrapper);

  el.fBarcode = wrapper.querySelector('#fBarcode');
  el.barcodeScanBtn = wrapper.querySelector('#barcodeScanBtn');

  el.barcodeScanBtn.addEventListener('click', () => {
    openScanner((code) => {
      el.fBarcode.value = code;
      showToast('Штрихкод считан: ' + code);
    });
  });
}

// =========================================================
// ЗАГРУЗКА / СОХРАНЕНИЕ
// =========================================================

function loadProducts() {
  const stored = readLS(STORAGE_KEY, null);
  if (Array.isArray(stored)) { state.products = stored; return; }
  state.products = SEED_PRODUCTS.map((p) => ({
    ...p,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  writeLS(STORAGE_KEY, state.products);
}

function persist() { writeLS(STORAGE_KEY, state.products); }

// =========================================================
// РЕНДЕР
// =========================================================

function renderStats() {
  const list = state.products;
  const totalItems = list.length;
  const stockValue = list.reduce(
    (s, p) => s + (Number(p.qty) || 0) * (Number(p.costPrice) || 0), 0
  );
  const lowStock = list.filter((p) => Number(p.qty) < LOW_STOCK_THRESHOLD).length;

  if (el.statTotalItems) el.statTotalItems.innerHTML = `${fmt(totalItems)}<small>поз.</small>`;
  if (el.statStockValue) el.statStockValue.innerHTML = `${fmt(Math.round(stockValue))}<small>KGS</small>`;
  if (el.statLowStock) el.statLowStock.innerHTML = `${fmt(lowStock)}<small>поз.</small>`;
}

function renderChips() {
  if (!el.chips) return;
  el.chips.innerHTML = CHIP_CATEGORIES.map((cat) => {
    const active = cat === state.category ? ' is-active' : '';
    const label = window.KUT_LANG?.tCategory(cat) || cat;
    return `<button class="chip${active}" type="button" role="tab"
            aria-selected="${cat === state.category}"
            data-cat="${escapeHtml(cat)}">${escapeHtml(label)}</button>`;
  }).join('');
}

function getVisibleProducts() {
  const q = state.search.trim().toLowerCase();
  return state.products
    .filter((p) => {
      const matchCat = state.category === 'Все' || p.category === state.category;
      const matchSearch =
        !q ||
        String(p.name).toLowerCase().includes(q) ||
        String(p.category).toLowerCase().includes(q) ||
        String(p.barcode || '').includes(q);
      return matchCat && matchSearch;
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
}

function emojiForCategory(cat) {
  switch (cat) {
    case 'Одежда':    return '👕';
    case 'Продукты':  return '🥫';
    case 'Напитки':   return '🥤';
    case 'Выпечка':   return '🥖';
    case 'Услуги':    return '✂️';
    case 'Хозтовары': return '🧴';
    default:          return '📦';
  }
}

function renderTable() {
  if (!el.stockBody) return;
  const items = getVisibleProducts();

  if (state.products.length === 0) {
    if (el.stockTable) el.stockTable.hidden = true;
    if (el.stockEmpty) el.stockEmpty.hidden = false;
    el.stockBody.innerHTML = '';
    return;
  }

  if (el.stockTable) el.stockTable.hidden = false;
  if (el.stockEmpty) el.stockEmpty.hidden = true;

  if (items.length === 0) {
    el.stockBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px 16px; color:var(--kut-muted);">
          По вашему запросу ничего не найдено.
        </td>
      </tr>`;
    return;
  }

  el.stockBody.innerHTML = items.map((p) => {
    const cost = Number(p.costPrice) || 0;
    const sale = Number(p.salePrice) || 0;
    const profit = sale - cost;
    const profitLabel = `${profit > 0 ? '+' : ''}${fmt(profit)} KGS`;
    const barcode = p.barcode ? escapeHtml(p.barcode) : '—';

    return `
      <tr data-id="${escapeHtml(p.id)}">
        <td data-label="Товар">
          <div class="cell-name">
            <div class="cell-name__emoji" aria-hidden="true">${emojiForCategory(p.category)}</div>
            <div class="cell-name__text">
              <div class="cell-name__title" title="${escapeHtml(p.name)}">${escapeHtml(window.KUT_LANG?.tProduct(p.name) || p.name)}</div>
              <div class="cell-name__sub">Штрихкод: ${barcode}</div>
            </div>
          </div>
        </td>
        <td data-label="Категория">
          <span class="badge">${escapeHtml(window.KUT_LANG?.tCategory(p.category) || p.category)}</span>
        </td>
        <td data-label="Остаток">
          <div class="qty-cell" role="group" aria-label="Количество">
            <button class="qty-btn" type="button" data-act="dec" aria-label="Уменьшить">−</button>
            <span class="qty-value">${fmt(p.qty)}<small>${escapeHtml(p.unit)}</small></span>
            <button class="qty-btn" type="button" data-act="inc" aria-label="Увеличить">+</button>
          </div>
        </td>
        <td data-label="Закупка"><span class="price price--cost">${fmt(cost)} KGS</span></td>
        <td data-label="Продажа"><span class="price price--sale">${fmt(sale)} KGS</span></td>
        <td data-label="Маржа">
          <span class="price" style="${profit < 0 ? 'color:var(--kut-danger);' : 'color:var(--kut-green); font-weight:600;'}">${profitLabel}</span>
        </td>
        <td data-label="Действия">
          <div class="row-actions">
            <button class="icon-btn" type="button" data-act="edit" aria-label="Редактировать" title="Редактировать">✏️</button>
            <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Удалить" title="Удалить">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// =========================================================
// ОПЕРАЦИИ С ТОВАРАМИ
// =========================================================

function changeQty(productId, delta) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return;
  const next = Math.max(0, (Number(p.qty) || 0) + delta);
  p.qty = Number(next.toFixed(2));
  p.updatedAt = new Date().toISOString();
  persist();
  renderStats();
  renderTable();
}

function openAddModal() {
  state.editingId = null;
  if (el.productModalTitle) el.productModalTitle.textContent = 'Новый товар';
  if (el.productModalSub) el.productModalSub.textContent = 'Заполните данные — они сохранятся в вашем складе.';
  if (el.saveBtn) el.saveBtn.textContent = 'Добавить товар';

  el.productForm.reset();
  el.productId.value = '';
  el.fName.value = '';
  el.fCategory.value = CATEGORIES[0];
  el.fUnit.value = 'шт';
  el.fQty.value = '';
  el.fCost.value = '';
  el.fSale.value = '';
  if (el.fBarcode) el.fBarcode.value = '';

  clearFieldErrors();
  updateMarginPreview();
  openModal(el.productModal);
  requestAnimationFrame(() => el.fName.focus());
}

function openEditModal(productId) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return;

  state.editingId = p.id;
  if (el.productModalTitle) el.productModalTitle.textContent = 'Редактировать товар';
  if (el.productModalSub) el.productModalSub.textContent = 'Измените данные и сохраните.';
  if (el.saveBtn) el.saveBtn.textContent = 'Сохранить изменения';

  el.productId.value = p.id;
  el.fName.value = p.name || '';
  el.fCategory.value = CATEGORIES.includes(p.category) ? p.category : 'Другое';
  el.fUnit.value = p.unit || 'шт';
  el.fQty.value = p.qty ?? '';
  el.fCost.value = p.costPrice ?? '';
  el.fSale.value = p.salePrice ?? '';
  if (el.fBarcode) el.fBarcode.value = p.barcode || '';

  clearFieldErrors();
  updateMarginPreview();
  openModal(el.productModal);
  requestAnimationFrame(() => el.fName.focus());
}

function openDeleteModal(productId) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return;
  state.deletingId = p.id;
  if (el.deleteName) el.deleteName.textContent = `«${p.name}» будет удалён со склада.`;
  openModal(el.deleteModal);
}

function confirmDelete() {
  if (!state.deletingId) return;
  const p = state.products.find((x) => x.id === state.deletingId);
  state.products = state.products.filter((x) => x.id !== state.deletingId);
  state.deletingId = null;
  persist();
  renderStats();
  renderTable();
  closeModal(el.deleteModal);
  if (p) showToast(`Товар «${p.name}» удалён`);
}

function saveProduct(event) {
  event.preventDefault();
  if (!validateForm()) return;

  const barcode = el.fBarcode ? el.fBarcode.value.trim() : '';

  if (barcode) {
    const dup = state.products.find((x) => x.barcode === barcode && x.id !== state.editingId);
    if (dup) {
      setFieldError('fBarcode', `Такой штрихкод уже у товара «${dup.name}»`);
      return;
    }
  }

  const data = {
    name: el.fName.value.trim(),
    category: el.fCategory.value,
    unit: el.fUnit.value,
    qty: Number(el.fQty.value) || 0,
    costPrice: Number(el.fCost.value) || 0,
    salePrice: Number(el.fSale.value) || 0,
    barcode,
    updatedAt: new Date().toISOString(),
  };

  if (state.editingId) {
    const idx = state.products.findIndex((x) => x.id === state.editingId);
    if (idx !== -1) state.products[idx] = { ...state.products[idx], ...data };
    showToast(`Товар «${data.name}» обновлён`);
  } else {
    state.products.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
    showToast(`Товар «${data.name}» добавлен`);
  }

  persist();
  renderStats();
  renderTable();
  closeModal(el.productModal);
}

// =========================================================
// ВАЛИДАЦИЯ
// =========================================================

function setFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const hint = document.querySelector(`.field__hint[data-for="${fieldId}"]`);
  if (input) input.classList.add('is-invalid');
  if (hint) {
    hint.textContent = message || '';
    hint.classList.toggle('is-error', Boolean(message));
  }
}

function clearFieldErrors() {
  document.querySelectorAll('.field__hint').forEach((h) => {
    h.textContent = '';
    h.classList.remove('is-error');
  });
  document.querySelectorAll('#productForm input, #productForm select').forEach((i) => {
    i.classList.remove('is-invalid');
  });
}

function validateForm() {
  clearFieldErrors();
  let ok = true;

  if (el.fName.value.trim().length < 2) {
    setFieldError('fName', 'Название минимум 2 символа');
    ok = false;
  }
  const qty = Number(el.fQty.value);
  if (el.fQty.value === '' || Number.isNaN(qty) || qty < 0) {
    setFieldError('fQty', 'Введите количество (0 или больше)');
    ok = false;
  }
  const cost = Number(el.fCost.value);
  if (el.fCost.value === '' || Number.isNaN(cost) || cost < 0) {
    setFieldError('fCost', 'Введите цену закупки (0 или больше)');
    ok = false;
  }
  const sale = Number(el.fSale.value);
  if (el.fSale.value === '' || Number.isNaN(sale) || sale < 0) {
    setFieldError('fSale', 'Введите цену продажи (0 или больше)');
    ok = false;
  }
  if (ok && sale < cost) {
    setFieldError('fSale', 'Продажа ниже закупки — проверьте цены');
  }
  return ok;
}

function updateMarginPreview() {
  const cost = Number(el.fCost.value) || 0;
  const sale = Number(el.fSale.value) || 0;
  const qty = Number(el.fQty.value) || 0;
  const profit = sale - cost;
  const markup = cost > 0 ? (profit / cost) * 100 : (sale > 0 ? 100 : 0);
  const stockValue = cost * qty;

  if (el.previewProfit) {
    el.previewProfit.textContent = `${profit > 0 ? '+' : ''}${fmt(profit)} KGS`;
    el.previewProfit.classList.toggle('is-negative', profit < 0);
  }
  if (el.previewMarkup) {
    el.previewMarkup.textContent = `${fmt(Math.round(markup))} %`;
    el.previewMarkup.classList.toggle('is-negative', markup < 0);
  }
  if (el.previewStockValue) {
    el.previewStockValue.textContent = `${fmt(Math.round(stockValue))} KGS`;
  }
}

// =========================================================
// МОДАЛЬНЫЕ ОКНА (общие)
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
// СОБЫТИЯ
// =========================================================

function bindEvents() {
  if (el.openAddBtn) el.openAddBtn.addEventListener('click', openAddModal);
  if (el.emptyAddBtn) el.emptyAddBtn.addEventListener('click', openAddModal);

  if (el.searchInput) el.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderTable();
  });

  if (el.chips) el.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.category = chip.dataset.cat;
    renderChips();
    renderTable();
  });

  if (el.stockBody) el.stockBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const act = btn.dataset.act;
    if (act === 'inc') changeQty(id, +1);
    else if (act === 'dec') changeQty(id, -1);
    else if (act === 'edit') openEditModal(id);
    else if (act === 'delete') openDeleteModal(id);
  });

  if (el.productForm) el.productForm.addEventListener('submit', saveProduct);

  ['input', 'change'].forEach((ev) => {
    if (el.fCost) el.fCost.addEventListener(ev, updateMarginPreview);
    if (el.fSale) el.fSale.addEventListener(ev, updateMarginPreview);
    if (el.fQty) el.fQty.addEventListener(ev, updateMarginPreview);
  });

  if (el.confirmDeleteBtn) el.confirmDeleteBtn.addEventListener('click', confirmDelete);

  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (el.productModal && !el.productModal.hidden) closeModal(el.productModal);
    else if (el.deleteModal && !el.deleteModal.hidden) closeModal(el.deleteModal);
    else if (scannerModal && !scannerModal.hidden) stopScanner();
  });

  if (window.KUT?.onStorage) {
    window.KUT.onStorage(({ key }) => {
      if (key === window.KUT.keys.products) {
        loadProducts();
        renderStats();
        renderTable();
      }
    });
  }

  window.addEventListener('kut:lang', () => {
    renderChips();
    renderTable();
  });
}

// =========================================================
// ИНИЦИАЛИЗАЦИЯ
// =========================================================

function renderCategoryOptions() {
  if (!el.fCategory) return;
  el.fCategory.innerHTML = CATEGORIES
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join('');
}

function init() {
  renderCategoryOptions();
  loadProducts();
  ensureBarcodeField();
  renderChips();
  renderStats();
  renderTable();
  bindEvents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
