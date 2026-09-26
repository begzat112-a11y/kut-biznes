/* =========================================================
   КУТ: БИЗНЕС — Модуль «Склад и товары» (stock.js) · v6
   + Складской журнал (warehouse_logs) — автотриггеры при +/−
     и при создании нового товара
   + Своя категория через «Другое»
   + Категории подтягиваются из существующих товаров
   ========================================================= */

(function () {
  'use strict';

  const LOW_STOCK_THRESHOLD = 5;
  const BASE_CATEGORIES = ['Одежда', 'Продукты', 'Напитки', 'Выпечка', 'Услуги', 'Хозтовары'];
  const OTHER_LABEL = 'Другое';
  const CHIP_OTHER = 'Все';

  const state = {
    products: [],
    search: '',
    category: 'Все',
    editingId: null,
    deletingId: null,
    canEdit: false,
    unsubProducts: null,
  };

  const $ = (s) => document.querySelector(s);
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
    customCategoryWrap:$('#customCategoryWrap'),
    fCustomCategory:   $('#fCustomCategory'),
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
    deleteModal:      $('#deleteModal'),
    deleteName:       $('#deleteName'),
    confirmDeleteBtn: $('#confirmDeleteBtn'),
  };

  const fmt = (n) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function showToast(message, isError) {
    if (window.KUT?.toast) window.KUT.toast(message, isError);
    else console.log('[stock]', message);
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
      if (st && st.businessId) return st;
      if (Date.now() - start > timeoutMs) return null;
      await sleep(100);
    }
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

  // =========================================================
  // СКЛАДСКОЙ ЖУРНАЛ — безопасный хелпер
  // =========================================================
  function logWarehouse(params) {
    if (!window.WAREHOUSE_LOG) {
      console.warn('[stock] WAREHOUSE_LOG не подключён');
      return;
    }
    window.WAREHOUSE_LOG.saveLog(params).catch((e) => {
      console.warn('[stock] ошибка записи в журнал:', e);
    });
  }

  // =========================================================
  // КАТЕГОРИИ
  // =========================================================

  function getAllCategories() {
    const set = new Set(BASE_CATEGORIES);
    (state.products || []).forEach((p) => {
      const cat = String(p.category || '').trim();
      if (cat && cat !== OTHER_LABEL) set.add(cat);
    });
    return Array.from(set);
  }

  function getChipCategories() {
    const set = new Set([CHIP_OTHER, ...getAllCategories()]);
    return Array.from(set);
  }

  function isBaseCategory(cat) {
    return BASE_CATEGORIES.indexOf(cat) !== -1;
  }

  function renderCategoryOptions(selected) {
    if (!el.fCategory) return;
    const cats = getAllCategories();
    const options = cats
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join('');
    const otherSelected = selected && !cats.includes(selected) ? ' selected' : '';
    el.fCategory.innerHTML = options +
      `<option value="${OTHER_LABEL}"${otherSelected}>${OTHER_LABEL}</option>`;

    if (selected && cats.includes(selected)) {
      el.fCategory.value = selected;
    } else if (selected && !cats.includes(selected)) {
      el.fCategory.value = OTHER_LABEL;
    }
  }

  function toggleCustomCategory(show) {
    if (!el.customCategoryWrap) return;
    el.customCategoryWrap.classList.toggle('is-visible', Boolean(show));
    if (show) {
      requestAnimationFrame(() => el.fCustomCategory && el.fCustomCategory.focus());
    } else if (el.fCustomCategory) {
      el.fCustomCategory.value = '';
      el.fCustomCategory.classList.remove('is-invalid');
    }
  }

  function syncCustomCategoryVisibility() {
    const isOther = el.fCategory.value === OTHER_LABEL;
    toggleCustomCategory(isOther);
    setFieldError('fCategory', '');
  }

  function resolveCategory() {
    const sel = el.fCategory.value;
    if (sel === OTHER_LABEL) {
      return (el.fCustomCategory.value || '').trim();
    }
    return sel;
  }

  // =========================================================
  // СКАНЕР ШТРИХКОДА
  // =========================================================
  let scannerModal = null;
  let scannerInstance = null;

  function ensureScannerModal() {
    if (document.getElementById('stockScannerModal')) {
      scannerModal = document.getElementById('stockScannerModal');
      return scannerModal;
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
          Наведите камеру на штрихкод товара.
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
    scannerModal = modal;
    return modal;
  }

  async function openScanner() {
    if (!window.Html5Qrcode) {
      showToast('Сканер ещё загружается. Попробуйте через секунду.', true);
      return;
    }
    const Html5Qrcode = window.Html5Qrcode;
    const modal = ensureScannerModal();
    const readerEl = modal.querySelector('#stockScannerReader');
    readerEl.innerHTML = '';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    try {
      scannerInstance = new Html5Qrcode('stockScannerReader');
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
      showToast('Не удалось запустить камеру.', true);
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
  // РЕНДЕР
  // =========================================================
  function renderStats() {
    const list = state.products;
    const totalItems = list.length;
    const stockValue = list.reduce(
      (s, p) => s + (Number(p.qty) || 0) * (Number(p.costPrice) || 0), 0);
    const lowStock = list.filter((p) => Number(p.qty) < LOW_STOCK_THRESHOLD).length;

    if (el.statTotalItems) el.statTotalItems.innerHTML = `${fmt(totalItems)}<small>поз.</small>`;
    if (el.statStockValue) el.statStockValue.innerHTML = `${fmt(Math.round(stockValue))}<small>KGS</small>`;
    if (el.statLowStock) el.statLowStock.innerHTML = `${fmt(lowStock)}<small>поз.</small>`;
  }

  function renderChips() {
    if (!el.chips) return;
    const cats = getChipCategories();
    el.chips.innerHTML = cats.map((cat) => {
      const active = cat === state.category ? ' is-active' : '';
      return `<button class="chip${active}" type="button" role="tab"
              aria-selected="${cat === state.category}"
              data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    }).join('');
  }

  function getVisibleProducts() {
    const q = state.search.trim().toLowerCase();
    return state.products
      .filter((p) => {
        const matchCat = state.category === 'Все' || p.category === state.category;
        const matchSearch = !q ||
          String(p.name).toLowerCase().includes(q) ||
          String(p.category).toLowerCase().includes(q) ||
          String(p.barcode || '').includes(q);
        return matchCat && matchSearch;
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
  }

  function renderTable() {
    if (!el.stockBody) return;
    const items = getVisibleProducts();

    if (state.products.length === 0) {
      el.stockTable.hidden = true;
      el.stockEmpty.hidden = false;
      el.stockBody.innerHTML = '';
      return;
    }
    el.stockTable.hidden = false;
    el.stockEmpty.hidden = true;

    if (items.length === 0) {
      el.stockBody.innerHTML = `
        <tr><td colspan="7" style="text-align:center; padding:40px 16px; color:var(--kut-muted);">
          По вашему запросу ничего не найдено.
        </td></tr>`;
      return;
    }

    el.stockBody.innerHTML = items.map((p) => {
      const cost = Number(p.costPrice) || 0;
      const sale = Number(p.salePrice) || 0;
      const profit = sale - cost;
      const profitLabel = `${profit > 0 ? '+' : ''}${fmt(profit)} KGS`;
      const barcode = p.barcode ? escapeHtml(p.barcode) : '—';
      const editActions = state.canEdit ? `
        <button class="icon-btn" type="button" data-act="edit" title="Редактировать">✏️</button>
        <button class="icon-btn icon-btn--danger" type="button" data-act="delete" title="Удалить">🗑️</button>
      ` : '';
      const qtyBtns  = state.canEdit ? `<button class="qty-btn" type="button" data-act="dec">−</button>` : '';
      const qtyBtns2 = state.canEdit ? `<button class="qty-btn" type="button" data-act="inc">+</button>` : '';

      const isCustom = !isBaseCategory(p.category);
      const badgeCls = isCustom ? 'badge badge--custom' : 'badge';

      return `
        <tr data-id="${escapeHtml(p.id)}">
          <td data-label="Товар">
            <div class="cell-name">
              <div class="cell-name__emoji">${emojiForCategory(p.category)}</div>
              <div class="cell-name__text">
                <div class="cell-name__title" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
                <div class="cell-name__sub">Штрихкод: ${barcode}</div>
              </div>
            </div>
          </td>
          <td data-label="Категория"><span class="${badgeCls}">${escapeHtml(p.category)}</span></td>
          <td data-label="Остаток">
            <div class="qty-cell">
              ${qtyBtns}
              <span class="qty-value">${fmt(p.qty)}<small>${escapeHtml(p.unit || 'шт')}</small></span>
              ${qtyBtns2}
            </div>
          </td>
          <td data-label="Себестоимость">
            <div class="price-block">
              <span class="price price--cost">${fmt(cost)} KGS</span>
              <small>за 1 ${escapeHtml(p.unit || 'шт')}</small>
            </div>
          </td>
          <td data-label="Цена продажи">
            <div class="price-block">
              <span class="price price--sale">${fmt(sale)} KGS</span>
              <small>за 1 ${escapeHtml(p.unit || 'шт')}</small>
            </div>
          </td>
          <td data-label="Маржа">
            <span class="price" style="${profit < 0 ? 'color:var(--kut-danger);' : 'color:var(--kut-green); font-weight:600;'}">${profitLabel}</span>
          </td>
          <td data-label="Действия">
            <div class="row-actions">${editActions}</div>
          </td>
        </tr>`;
    }).join('');
  }

  // =========================================================
  // ОПЕРАЦИИ
  // =========================================================

  async function changeQty(productId, delta) {
    if (!state.canEdit) return;
    const p = state.products.find((x) => x.id === productId);
    if (!p) return;
    const next = Math.max(0, (Number(p.qty) || 0) + delta);
    try {
      await window.FB.updateItem('products', productId, { qty: Number(next.toFixed(2)) });

      // Триггер: записать операцию в складской журнал
      if (delta !== 0) {
        logWarehouse({
          actionType: delta > 0 ? 'in' : 'out',
          itemName:   p.name,
          quantity:   Math.abs(delta),
          unit:       p.unit || 'шт',
          totalPrice: Math.abs(delta) * (Number(p.costPrice) || 0),
        });
      }
    } catch (err) {
      console.error('[stock] changeQty:', err);
      showToast('Не удалось обновить количество', true);
    }
  }

  function openAddModal() {
    if (!state.canEdit) return;
    state.editingId = null;
    el.productModalTitle.textContent = 'Новый товар';
    el.productModalSub.textContent = 'Заполните данные — они сохранятся в облаке.';
    el.saveBtn.textContent = 'Добавить товар';

    el.productForm.reset();
    el.productId.value = '';
    el.fName.value = '';
    renderCategoryOptions(BASE_CATEGORIES[0]);
    el.fUnit.value = 'шт';
    el.fQty.value = '';
    el.fCost.value = '';
    el.fSale.value = '';
    el.fBarcode.value = '';
    if (el.fCustomCategory) el.fCustomCategory.value = '';

    el.customCategoryWrap.classList.remove('is-visible');

    clearFieldErrors();
    updateMarginPreview();
    openModal(el.productModal);
    requestAnimationFrame(() => el.fName.focus());
  }

  function openEditModal(productId) {
    if (!state.canEdit) return;
    const p = state.products.find((x) => x.id === productId);
    if (!p) return;
    state.editingId = p.id;
    el.productModalTitle.textContent = 'Редактировать товар';
    el.productModalSub.textContent = 'Измените данные и сохраните.';
    el.saveBtn.textContent = 'Сохранить изменения';

    el.productId.value = p.id;
    el.fName.value = p.name || '';

    const cat = String(p.category || '').trim();
    const isCustom = cat && !isBaseCategory(cat);

    if (isCustom) {
      renderCategoryOptions(OTHER_LABEL);
      el.fCategory.value = OTHER_LABEL;
      el.customCategoryWrap.classList.add('is-visible');
      if (el.fCustomCategory) el.fCustomCategory.value = cat;
    } else {
      renderCategoryOptions(cat);
      el.customCategoryWrap.classList.remove('is-visible');
      if (el.fCustomCategory) el.fCustomCategory.value = '';
    }

    el.fUnit.value = p.unit || 'шт';
    el.fQty.value = p.qty ?? '';
    el.fCost.value = p.costPrice ?? '';
    el.fSale.value = p.salePrice ?? '';
    el.fBarcode.value = p.barcode || '';

    clearFieldErrors();
    updateMarginPreview();
    openModal(el.productModal);
    requestAnimationFrame(() => el.fName.focus());
  }

  function openDeleteModal(productId) {
    if (!state.canEdit) return;
    const p = state.products.find((x) => x.id === productId);
    if (!p) return;
    state.deletingId = p.id;
    el.deleteName.textContent = `«${p.name}» будет удалён со склада.`;
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
      console.error('[stock] delete:', err);
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
      category: resolveCategory(),
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

        // Триггер: первый приход нового товара — тоже в журнал
        if (Number(data.qty) > 0) {
          logWarehouse({
            actionType: 'in',
            itemName:   data.name,
            quantity:   Number(data.qty),
            unit:       data.unit || 'шт',
            totalPrice: Number(data.qty) * (Number(data.costPrice) || 0),
          });
        }
      }
      closeModal(el.productModal);
    } catch (err) {
      console.error('[stock] save:', err);
      showToast('Не удалось сохранить. Проверьте права.', true);
    } finally {
      if (el.saveBtn) {
        el.saveBtn.disabled = false;
        el.saveBtn.textContent = state.editingId ? 'Сохранить изменения' : 'Добавить товар';
      }
    }
  }

  // =========================================================
  // ВАЛИДАЦИЯ
  // =========================================================
  function setFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const hint = document.querySelector(`.field__hint[data-for="${fieldId}"]`);
    if (input) input.classList.add('is-invalid');
    if (hint) {
      hint.textContent = message || (fieldId === 'fCost' ? 'Сколько вы заплатили поставщику за 1 единицу' : '');
      hint.classList.toggle('is-error', Boolean(message));
    }
  }
  function clearFieldErrors() {
    document.querySelectorAll('.field__hint').forEach((h) => {
      h.textContent = '';
      h.classList.remove('is-error');
    });
    document.querySelectorAll('#productForm input, #productForm select')
      .forEach((i) => i.classList.remove('is-invalid'));
  }
  function validateForm() {
    clearFieldErrors();
    let ok = true;

    if (el.fName.value.trim().length < 2) {
      setFieldError('fName', 'Название минимум 2 символа');
      ok = false;
    }

    const finalCat = resolveCategory();
    if (el.fCategory.value === OTHER_LABEL) {
      if (!finalCat || finalCat.length < 2) {
        setFieldError('fCategory', 'Введите название категории (мин. 2 символа)');
        if (el.fCustomCategory) el.fCustomCategory.classList.add('is-invalid');
        ok = false;
      } else if (finalCat === OTHER_LABEL) {
        setFieldError('fCategory', 'Введите название своей категории');
        ok = false;
      }
    } else if (!finalCat) {
      setFieldError('fCategory', 'Выберите категорию');
      ok = false;
    }

    const qty = Number(el.fQty.value);
    if (el.fQty.value === '' || Number.isNaN(qty) || qty < 0) {
      setFieldError('fQty', 'Введите количество'); ok = false;
    }
    const cost = Number(el.fCost.value);
    if (el.fCost.value === '' || Number.isNaN(cost) || cost < 0) {
      setFieldError('fCost', 'Введите себестоимость (0 или больше)'); ok = false;
    }
    const sale = Number(el.fSale.value);
    if (el.fSale.value === '' || Number.isNaN(sale) || sale < 0) {
      setFieldError('fSale', 'Введите цену продажи'); ok = false;
    }
    if (ok && sale < cost) setFieldError('fSale', 'Цена продажи ниже себестоимости — проверьте');

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
  // МОДАЛКИ
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
      state.search = e.target.value; renderTable();
    });
    if (el.chips) el.chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.category = chip.dataset.cat;
      renderChips(); renderTable();
    });
    if (el.stockBody) el.stockBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (!state.canEdit) return;
      const row = btn.closest('tr[data-id]');
      if (!row) return;
      const id = row.dataset.id;
      const act = btn.dataset.act;
      if (act === 'inc') changeQty(id, +1);
      else if (act === 'dec') changeQty(id, -1);
      else if (act === 'edit') openEditModal(id);
      else if (act === 'delete') openDeleteModal(id);
    });

    if (el.fCategory) {
      el.fCategory.addEventListener('change', syncCustomCategoryVisibility);
    }
    if (el.fCustomCategory) {
      el.fCustomCategory.addEventListener('input', () => {
        if (el.fCustomCategory.classList.contains('is-invalid')) {
          el.fCustomCategory.classList.remove('is-invalid');
          const hint = document.querySelector('.field__hint[data-for="fCategory"]');
          if (hint) { hint.textContent = ''; hint.classList.remove('is-error'); }
        }
      });
    }

    if (el.productForm) el.productForm.addEventListener('submit', saveProduct);
    ['input', 'change'].forEach((ev) => {
      if (el.fCost) el.fCost.addEventListener(ev, updateMarginPreview);
      if (el.fSale) el.fSale.addEventListener(ev, updateMarginPreview);
      if (el.fQty)  el.fQty.addEventListener(ev, updateMarginPreview);
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
      renderChips(); renderTable(); renderStats();
    });
    window.addEventListener('beforeunload', () => {
      if (state.unsubProducts) state.unsubProducts();
    });
  }

  // =========================================================
  // ИНИЦИАЛИЗАЦИЯ
  // =========================================================
  async function init() {
    const st = await waitForReady();
    if (!st) { console.warn('[stock] Не дождались businessId'); return; }

    const role = st.profile?.role;
    state.canEdit = role === 'owner' || role === 'manager' || role === 'super_admin';
    if (!state.canEdit) {
      if (el.openAddBtn) el.openAddBtn.style.display = 'none';
      if (el.emptyAddBtn) el.emptyAddBtn.style.display = 'none';
    }

    renderCategoryOptions(BASE_CATEGORIES[0]);
    renderChips();
    renderStats();

    state.unsubProducts = window.FB.subscribeCollection('products', (items) => {
      state.products = items;
      renderStats();
      renderTable();
      renderChips();

      if (!el.productModal || el.productModal.hidden) {
        renderCategoryOptions(el.fCategory.value || BASE_CATEGORIES[0]);
      }
    });

    bindEvents();
    console.info('[stock] Подключено · роль:', role, '· canEdit:', state.canEdit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
