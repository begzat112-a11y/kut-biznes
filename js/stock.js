/* =========================================================
   КУТ: БИЗНЕС — Модуль «Склад и товары» (stock.js) · Firebase v2
   Работает с Firestore через window.KUT и window.FB.
   Коллекция: businesses/{businessId}/products/{docId}
   Схема: { name, category, unit, qty, costPrice, salePrice,
            barcode, createdAt, updatedAt }
   ========================================================= */

(function () {
  'use strict';

  // =========================================================
  // 1. КОНСТАНТЫ
  // =========================================================
  const LOW_STOCK_THRESHOLD = 5;
  const CATEGORIES = ['Одежда', 'Продукты', 'Напитки', 'Выпечка', 'Услуги', 'Хозтовары', 'Другое'];
  const CHIP_CATEGORIES = ['Все', ...CATEGORIES];

  // =========================================================
  // 2. СОСТОЯНИЕ
  // =========================================================
  const state = {
    products: [],
    search: '',
    category: 'Все',
    editingId: null,
    deletingId: null,
    isOwner: true,
    unsubProducts: null,
  };

  // =========================================================
  // 3. DOM
  // =========================================================
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
    fBarcode:          $('#fBarcode'),
    barcodeScanBtn:    $('#barcodeScanBtn'),
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
  // 4. УТИЛИТЫ
  // =========================================================

  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  let toastTimer = null;
  function showToast(message, isError = false) {
    if (window.KUT?.toast) { window.KUT.toast(message, isError); return; }
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.toggle('toast--error', isError);
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
  }

  /** Firestore Timestamp | ISO | Date → Date */
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

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /**
   * Ждём, пока app.js выполнит boot() и установит businessId.
   * Если пользователя редиректит — цикл прерывается по таймауту.
   */
  async function waitForReady(timeoutMs) {
    timeoutMs = timeoutMs || 20000;
    const start = Date.now();

    while (!window.KUT) {
      if (Date.now() - start > timeoutMs) return null;
      await sleep(50);
    }

    while (true) {
      const st = window.KUT.getState ? window.KUT.getState() : null;
      if (st && st.businessId) return st;
      if (Date.now() - start > timeoutMs) return null;
      await sleep(100);
    }
  }

  // =========================================================
  // 5. СКАНЕР ШТРИХКОДА
  // =========================================================

  function ensureScannerModal() {
    if (document.getElementById('stockScannerModal')) {
      return document.getElementById('stockScannerModal');
    }
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'stockScannerModal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal__backdrop" data-close-scan></div>
      <div class="modal__dialog" role="dialog" aria-modal="true" style="max-width:520px;">
        <h3 style="margin:0 0 4px;">📷 Сканер штрихкода</h3>
        <p style="margin:0 0 14px; color:#64776E; font-size:13px;">
          Наведите камеру на штрихкод товара. Распознавание произойдёт автоматически.
        </p>
        <div id="stockScannerReader" style="width:100%; border-radius:14px; overflow:hidden; background:#000; min-height:220px;"></div>
        <div style="display:flex; gap:10px; margin-top:16px;">
          <button class="btn btn--ghost btn--block" type="button" data-close-scan>Отмена</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-close-scan]')) stopScanner();
    });
    return modal;
  }

  let scannerInstance = null;

  async function openScanner() {
    if (!window.Html5Qrcode) {
      showToast('Сканер не загружен. Проверьте интернет и обновите страницу.', true);
      return;
    }
    const modal = ensureScannerModal();
    const reader = modal.querySelector('#stockScannerReader');
    reader.innerHTML = '';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    try {
      scannerInstance = new window.Html5Qrcode('stockScannerReader');

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
          const code = String(decodedText).trim();
          if (el.fBarcode) el.fBarcode.value = code;
          if (navigator.vibrate) navigator.vibrate(80);
          showToast('Штрихкод считан: ' + code);
          stopScanner();
        },
        () => {}
      );
    } catch (err) {
      console.error('[stock scanner]', err);
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
    const modal = document.getElementById('stockScannerModal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }

  // =========================================================
  // 6. РЕНДЕР
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
      const ownerActions = state.isOwner ? `
        <button class="icon-btn" type="button" data-act="edit" aria-label="Редактировать" title="Редактировать">✏️</button>
        <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Удалить" title="Удалить">🗑️</button>
      ` : '';

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
              ${state.isOwner ? `<button class="qty-btn" type="button" data-act="dec" aria-label="Уменьшить">−</button>` : ''}
              <span class="qty-value">${fmt(p.qty)}<small>${escapeHtml(p.unit || 'шт')}</small></span>
              ${state.isOwner ? `<button class="qty-btn" type="button" data-act="inc" aria-label="Увеличить">+</button>` : ''}
            </div>
          </td>
          <td data-label="Закупка"><span class="price price--cost">${fmt(cost)} KGS</span></td>
          <td data-label="Продажа"><span class="price price--sale">${fmt(sale)} KGS</span></td>
          <td data-label="Маржа">
            <span class="price" style="${profit < 0 ? 'color:var(--kut-danger);' : 'color:var(--kut-green); font-weight:600;'}">${profitLabel}</span>
          </td>
          <td data-label="Действия">
            <div class="row-actions">${ownerActions}</div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================
  // 7. ДАННЫЕ — Firestore
  // =========================================================

  async function loadProducts() {
    try {
      const items = await window.FB.getCollection('products');
      state.products = items;
      renderStats();
      renderTable();
    } catch (err) {
      console.error('[stock] loadProducts failed:', err);
      showToast('Не удалось загрузить товары', true);
    }
  }

  function subscribeProducts() {
    if (state.unsubProducts) state.unsubProducts();
    state.unsubProducts = window.FB.subscribeCollection('products', (items) => {
      state.products = items;
      renderStats();
      renderTable();
    });
  }

  // =========================================================
  // 8. ОПЕРАЦИИ
  // =========================================================

  async function changeQty(productId, delta) {
    const p = state.products.find((x) => x.id === productId);
    if (!p) return;
    const next = Math.max(0, (Number(p.qty) || 0) + delta);
    try {
      await window.FB.updateItem('products', productId, { qty: Number(next.toFixed(2)) });
    } catch (err) {
      console.error('[stock] changeQty failed:', err);
      showToast('Не удалось обновить количество', true);
    }
  }

  function openAddModal() {
    state.editingId = null;
    if (el.productModalTitle) el.productModalTitle.textContent = 'Новый товар';
    if (el.productModalSub) el.productModalSub.textContent = 'Заполните данные — они сохранятся в облаке.';
    if (el.saveBtn) el.saveBtn.textContent = 'Добавить товар';

    if (el.productForm) el.productForm.reset();
    if (el.productId) el.productId.value = '';
    if (el.fName) el.fName.value = '';
    if (el.fCategory) el.fCategory.value = CATEGORIES[0];
    if (el.fUnit) el.fUnit.value = 'шт';
    if (el.fQty) el.fQty.value = '';
    if (el.fCost) el.fCost.value = '';
    if (el.fSale) el.fSale.value = '';
    if (el.fBarcode) el.fBarcode.value = '';

    clearFieldErrors();
    updateMarginPreview();
    openModal(el.productModal);
    if (el.fName) requestAnimationFrame(() => el.fName.focus());
  }

  function openEditModal(productId) {
    const p = state.products.find((x) => x.id === productId);
    if (!p) return;

    state.editingId = p.id;
    if (el.productModalTitle) el.productModalTitle.textContent = 'Редактировать товар';
    if (el.productModalSub) el.productModalSub.textContent = 'Измените данные и сохраните.';
    if (el.saveBtn) el.saveBtn.textContent = 'Сохранить изменения';

    if (el.productId) el.productId.value = p.id;
    if (el.fName) el.fName.value = p.name || '';
    if (el.fCategory) el.fCategory.value = CATEGORIES.includes(p.category) ? p.category : 'Другое';
    if (el.fUnit) el.fUnit.value = p.unit || 'шт';
    if (el.fQty) el.fQty.value = p.qty ?? '';
    if (el.fCost) el.fCost.value = p.costPrice ?? '';
    if (el.fSale) el.fSale.value = p.salePrice ?? '';
    if (el.fBarcode) el.fBarcode.value = p.barcode || '';

    clearFieldErrors();
    updateMarginPreview();
    openModal(el.productModal);
    if (el.fName) requestAnimationFrame(() => el.fName.focus());
  }

  function openDeleteModal(productId) {
    const p = state.products.find((x) => x.id === productId);
    if (!p) return;
    state.deletingId = p.id;
    if (el.deleteName) el.deleteName.textContent = `«${p.name}» будет удалён со склада.`;
    openModal(el.deleteModal);
  }

  async function confirmDelete() {
    const id = state.deletingId;
    if (!id) return;
    const p = state.products.find((x) => x.id === id);

    if (el.confirmDeleteBtn) {
      el.confirmDeleteBtn.disabled = true;
      el.confirmDeleteBtn.textContent = 'Удаляем...';
    }

    try {
      await window.FB.deleteItem('products', id);
      state.deletingId = null;
      closeModal(el.deleteModal);
      if (p) showToast(`Товар «${p.name}» удалён`);
    } catch (err) {
      console.error('[stock] delete failed:', err);
      showToast('Не удалось удалить товар', true);
    } finally {
      if (el.confirmDeleteBtn) {
        el.confirmDeleteBtn.disabled = false;
        el.confirmDeleteBtn.textContent = 'Удалить';
      }
    }
  }

  async function saveProduct(event) {
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
    };

    if (el.saveBtn) {
      el.saveBtn.disabled = true;
      el.saveBtn.textContent = state.editingId ? 'Сохраняем...' : 'Добавляем...';
    }

    try {
      if (state.editingId) {
        await window.FB.updateItem('products', state.editingId, data);
        showToast(`Товар «${data.name}» обновлён`);
      } else {
        await window.FB.addItem('products', data);
        showToast(`Товар «${data.name}» добавлен`);
      }
      closeModal(el.productModal);
    } catch (err) {
      console.error('[stock] save failed:', err);
      showToast('Не удалось сохранить товар. Проверьте права.', true);
    } finally {
      if (el.saveBtn) {
        el.saveBtn.disabled = false;
        el.saveBtn.textContent = state.editingId ? 'Сохранить изменения' : 'Добавить товар';
      }
    }
  }

  // =========================================================
  // 9. ВАЛИДАЦИЯ
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
    if (!el.fCost || !el.fSale || !el.fQty) return;
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
  // 10. МОДАЛЬНЫЕ ОКНА
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
  // 11. СОБЫТИЯ
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
      if (!state.isOwner) return;
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

    if (el.barcodeScanBtn) el.barcodeScanBtn.addEventListener('click', openScanner);

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
      else stopScanner();
    });

    window.addEventListener('kut:lang', () => {
      renderChips();
      renderTable();
      renderStats();
    });

    window.addEventListener('beforeunload', () => {
      if (state.unsubProducts) state.unsubProducts();
    });
  }

  // =========================================================
  // 12. ИНИЦИАЛИЗАЦИЯ
  // =========================================================

  function renderCategoryOptions() {
    if (!el.fCategory) return;
    el.fCategory.innerHTML = CATEGORIES
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join('');
  }

  async function init() {
    // 1. Ждём готовности ядра (auth + businessId)
    const st = await waitForReady();
    if (!st) return; // app.js сделал редирект

    // 2. Определяем роль (только владелец может редактировать)
    state.isOwner = st.profile?.role === 'owner' || st.profile?.role === 'super_admin';

    // 3. Если роль cashier — прячем кнопку «Добавить»
    if (!state.isOwner && el.openAddBtn) el.openAddBtn.style.display = 'none';
    if (!state.isOwner && el.emptyAddBtn) el.emptyAddBtn.style.display = 'none';

    // 4. Базовый рендер
    renderCategoryOptions();
    renderChips();
    renderStats();

    // 5. Подписка + первичная загрузка
    subscribeProducts();
    await loadProducts();

    // 6. События
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
