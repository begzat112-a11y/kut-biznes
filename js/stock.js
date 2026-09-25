/* =========================================================
   КУТ: БИЗНЕС — Модуль «Склад и товары» (stock.js)
   Чистый ES6+. Данные в localStorage под ключом kut_products.
   Схема позиции: { id, name, category, unit, qty, costPrice, salePrice, createdAt, updatedAt }
   ========================================================= */

// ---------- Ключ хранилища ----------
const STORAGE_KEY = 'kut_products';
const LOW_STOCK_THRESHOLD = 5;

// ---------- Категории ----------
const CATEGORIES = ['Одежда', 'Продукты', 'Напитки', 'Выпечка', 'Услуги', 'Хозтовары', 'Другое'];
const CHIP_CATEGORIES = ['Все', ...CATEGORIES];

// ---------- Стартовый демо-набор (если хранилище пустое) ----------
// Совместим по смыслу с демо-каталогом из cash.js, чтобы связка «склад → касса»
// работала на следующем шаге без пустой страницы.
const SEED_PRODUCTS = [
  { id: 'p01', name: 'Лепёшка',                  category: 'Выпечка',   unit: 'шт',   qty: 40,  costPrice: 18,  salePrice: 25  },
  { id: 'p02', name: 'Боорсок (порция)',         category: 'Выпечка',   unit: 'порц.',qty: 12,  costPrice: 40,  salePrice: 60  },
  { id: 'p03', name: 'Самса',                    category: 'Выпечка',   unit: 'шт',   qty: 18,  costPrice: 42,  salePrice: 60  },
  { id: 'p04', name: 'Хлеб булка',               category: 'Выпечка',   unit: 'шт',   qty: 25,  costPrice: 22,  salePrice: 30  },
  { id: 'p05', name: 'Чай чёрный (пачка)',       category: 'Напитки',   unit: 'шт',   qty: 30,  costPrice: 140, salePrice: 180 },
  { id: 'p06', name: 'Вода 1,5 л',               category: 'Напитки',   unit: 'шт',   qty: 60,  costPrice: 32,  salePrice: 45  },
  { id: 'p07', name: 'Кола 1 л',                 category: 'Напитки',   unit: 'шт',   qty: 4,   costPrice: 68,  salePrice: 90  },
  { id: 'p08', name: 'Сок 1 л',                  category: 'Напитки',   unit: 'шт',   qty: 3,   costPrice: 85,  salePrice: 110 },
  { id: 'p09', name: 'Молоко 1 л',               category: 'Продукты',  unit: 'шт',   qty: 15,  costPrice: 58,  salePrice: 75  },
  { id: 'p10', name: 'Яйца (10 шт)',             category: 'Продукты',  unit: 'шт',   qty: 22,  costPrice: 105, salePrice: 130 },
  { id: 'p11', name: 'Рис 1 кг',                 category: 'Продукты',  unit: 'кг',   qty: 30,  costPrice: 95,  salePrice: 120 },
  { id: 'p12', name: 'Сахар 1 кг',               category: 'Продукты',  unit: 'кг',   qty: 20,  costPrice: 78,  salePrice: 95  },
  { id: 'p13', name: 'Масло растительное 1 л',   category: 'Продукты',  unit: 'л',    qty: 2,   costPrice: 135, salePrice: 170 },
  { id: 'p14', name: 'Макароны',                 category: 'Продукты',  unit: 'шт',   qty: 35,  costPrice: 52,  salePrice: 70  },
  { id: 'p15', name: 'Мыло',                     category: 'Хозтовары', unit: 'шт',   qty: 25,  costPrice: 28,  salePrice: 40  },
  { id: 'p16', name: 'Стиральный порошок',       category: 'Хозтовары', unit: 'шт',   qty: 8,   costPrice: 140, salePrice: 180 },
  { id: 'p17', name: 'Салфетки',                 category: 'Хозтовары', unit: 'шт',   qty: 50,  costPrice: 20,  salePrice: 30  },
  { id: 'p18', name: 'Пакет',                    category: 'Хозтовары', unit: 'шт',   qty: 100, costPrice: 3,   salePrice: 5   },
  { id: 'p19', name: 'Джинсы Турция',            category: 'Одежда',    unit: 'шт',   qty: 4,   costPrice: 1400,salePrice: 2200 },
  { id: 'p20', name: 'Свитер мужской',           category: 'Одежда',    unit: 'шт',   qty: 6,   costPrice: 900, salePrice: 1500 },
  { id: 'p21', name: 'Футболка базовая',         category: 'Одежда',    unit: 'шт',   qty: 12,  costPrice: 300, salePrice: 550  },
  { id: 'p22', name: 'Стрижка мужская',          category: 'Услуги',    unit: 'усл.', qty: 999, costPrice: 0,   salePrice: 350  },
];

// ---------- Состояние ----------
const state = {
  products: [],
  search: '',
  category: 'Все',
  editingId: null,
  deletingId: null,
};

// ---------- Ссылки на DOM ----------
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
// Утилиты
// =========================================================

const fmt = (n) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const fmtMoney = (n) => fmt(n) + ' KGS';

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('localStorage write failed:', e);
    showToast('Не удалось сохранить данные локально', true);
  }
}

/** Простая защита от XSS при рендере пользовательских строк в HTML */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/** Уникальный id */
function uid() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/** Показ тоста */
let toastTimer = null;
function showToast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle('toast--error', isError);
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
}

// =========================================================
// Загрузка / сохранение
// =========================================================

function loadProducts() {
  const stored = readLS(STORAGE_KEY, null);
  if (Array.isArray(stored) && stored.length > 0) {
    state.products = stored;
    return;
  }
  // Пусто → засеваем стартовым набором и сохраняем
  state.products = SEED_PRODUCTS.map((p) => ({
    ...p,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  writeLS(STORAGE_KEY, state.products);
}

function persist() {
  writeLS(STORAGE_KEY, state.products);
}

// =========================================================
// Рендер: статистика
// =========================================================

function renderStats() {
  const list = state.products;
  const totalItems = list.length;
  const stockValue = list.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.costPrice) || 0), 0);
  const lowStock = list.filter((p) => Number(p.qty) < LOW_STOCK_THRESHOLD).length;

  el.statTotalItems.innerHTML = `${fmt(totalItems)}<small>поз.</small>`;
  el.statStockValue.innerHTML = `${fmt(Math.round(stockValue))}<small>KGS</small>`;
  el.statLowStock.innerHTML = `${fmt(lowStock)}<small>поз.</small>`;
}

// =========================================================
// Рендер: чипы категорий
// =========================================================

function renderChips() {
  el.chips.innerHTML = CHIP_CATEGORIES.map((cat) => {
    const active = cat === state.category ? ' is-active' : '';
    return `<button class="chip${active}" type="button" role="tab" aria-selected="${cat === state.category}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
  }).join('');
}

// =========================================================
// Рендер: таблица товаров
// =========================================================

function getVisibleProducts() {
  const q = state.search.trim().toLowerCase();
  return state.products
    .filter((p) => {
      const matchCat = state.category === 'Все' || p.category === state.category;
      const matchSearch =
        !q ||
        String(p.name).toLowerCase().includes(q) ||
        String(p.category).toLowerCase().includes(q);
      return matchCat && matchSearch;
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
}

/** Эмодзи-подсказка по категории (небольшой UX-плюс) */
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

/** Бейдж остатка с цветовой градацией */
function qtyBadge(qty, unit) {
  const q = Number(qty) || 0;
  let cls = 'badge';
  if (q <= 0) cls += ' badge--danger';
  else if (q < LOW_STOCK_THRESHOLD) cls += ' badge--warn';
  const text = q <= 0 ? 'Нет в наличии' : `${fmt(q)} ${escapeHtml(unit)}`;
  return `<span class="${cls}">${text}</span>`;
}

function renderTable() {
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
    const profitCls = profit < 0 ? 'is-negative' : '';
    const profitLabel = `${profit > 0 ? '+' : ''}${fmt(profit)} KGS`;

    return `
      <tr data-id="${escapeHtml(p.id)}">
        <td data-label="Товар">
          <div class="cell-name">
            <div class="cell-name__emoji" aria-hidden="true">${emojiForCategory(p.category)}</div>
            <div class="cell-name__text">
              <div class="cell-name__title" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
              <div class="cell-name__sub">Обновлено: ${formatDate(p.updatedAt)}</div>
            </div>
          </div>
        </td>
        <td data-label="Категория"><span class="badge">${escapeHtml(p.category)}</span></td>
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
          <span class="price ${profitCls}" style="${profit < 0 ? 'color:var(--kut-danger);' : 'color:var(--kut-green); font-weight:600;'}">${profitLabel}</span>
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

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

// =========================================================
// Операции с товарами
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
  el.productModalTitle.textContent = 'Новый товар';
  el.productModalSub.textContent = 'Заполните данные — они сохранятся в вашем складе.';
  el.saveBtn.textContent = 'Добавить товар';

  el.productForm.reset();
  el.productId.value = '';
  el.fName.value = '';
  el.fCategory.value = CATEGORIES[0];
  el.fUnit.value = 'шт';
  el.fQty.value = '';
  el.fCost.value = '';
  el.fSale.value = '';

  clearFieldErrors();
  updateMarginPreview();
  openModal(el.productModal);
  requestAnimationFrame(() => el.fName.focus());
}

function openEditModal(productId) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return;

  state.editingId = p.id;
  el.productModalTitle.textContent = 'Редактировать товар';
  el.productModalSub.textContent = 'Измените данные и сохраните.';
  el.saveBtn.textContent = 'Сохранить изменения';

  el.productId.value = p.id;
  el.fName.value = p.name || '';
  el.fCategory.value = CATEGORIES.includes(p.category) ? p.category : 'Другое';
  el.fUnit.value = p.unit || 'шт';
  el.fQty.value = p.qty ?? '';
  el.fCost.value = p.costPrice ?? '';
  el.fSale.value = p.salePrice ?? '';

  clearFieldErrors();
  updateMarginPreview();
  openModal(el.productModal);
  requestAnimationFrame(() => el.fName.focus());
}

function openDeleteModal(productId) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return;
  state.deletingId = p.id;
  el.deleteName.textContent = `«${p.name}» будет удалён со склада.`;
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

  const data = {
    name: el.fName.value.trim(),
    category: el.fCategory.value,
    unit: el.fUnit.value,
    qty: Number(el.fQty.value) || 0,
    costPrice: Number(el.fCost.value) || 0,
    salePrice: Number(el.fSale.value) || 0,
    updatedAt: new Date().toISOString(),
  };

  if (state.editingId) {
    const idx = state.products.findIndex((x) => x.id === state.editingId);
    if (idx !== -1) {
      state.products[idx] = { ...state.products[idx], ...data };
    }
    showToast(`Товар «${data.name}» обновлён`);
  } else {
    state.products.push({
      id: uid(),
      ...data,
      createdAt: new Date().toISOString(),
    });
    showToast(`Товар «${data.name}» добавлен`);
  }

  persist();
  renderStats();
  renderTable();
  closeModal(el.productModal);
}

// =========================================================
// Валидация
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

  const name = el.fName.value.trim();
  if (name.length < 2) {
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
    // Не блокируем, но предупреждаем — иногда делают акции в убыток
    setFieldError('fSale', 'Продажа ниже закупки — проверьте цены');
  }

  return ok;
}

// =========================================================
// Превью маржи в модалке
// =========================================================

function updateMarginPreview() {
  const cost = Number(el.fCost.value) || 0;
  const sale = Number(el.fSale.value) || 0;
  const qty = Number(el.fQty.value) || 0;

  const profit = sale - cost;
  const markup = cost > 0 ? (profit / cost) * 100 : (sale > 0 ? 100 : 0);
  const stockValue = cost * qty;

  el.previewProfit.textContent = `${profit > 0 ? '+' : ''}${fmt(profit)} KGS`;
  el.previewProfit.classList.toggle('is-negative', profit < 0);

  el.previewMarkup.textContent = `${fmt(Math.round(markup))} %`;
  el.previewMarkup.classList.toggle('is-negative', markup < 0);

  el.previewStockValue.textContent = `${fmt(Math.round(stockValue))} KGS`;
}

// =========================================================
// Модальные окна
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
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
}

// =========================================================
// События
// =========================================================

function bindEvents() {
  // Открыть добавление
  el.openAddBtn.addEventListener('click', openAddModal);
  el.emptyAddBtn.addEventListener('click', openAddModal);

  // Поиск
  el.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderTable();
  });

  // Фильтр по категориям
  el.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.category = chip.dataset.cat;
    renderChips();
    renderTable();
  });

  // Делегирование в таблице: +/-/редактировать/удалить
  el.stockBody.addEventListener('click', (e) => {
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

  // Сохранение формы
  el.productForm.addEventListener('submit', saveProduct);

  // Превью маржи
  ['input', 'change'].forEach((ev) => {
    el.fCost.addEventListener(ev, updateMarginPreview);
    el.fSale.addEventListener(ev, updateMarginPreview);
    el.fQty.addEventListener(ev, updateMarginPreview);
  });

  // Удаление
  el.confirmDeleteBtn.addEventListener('click', confirmDelete);

  // Закрытие модалок по [data-close]
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal);
    }
  });

  // Escape
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.productModal.hidden) closeModal(el.productModal);
    else if (!el.deleteModal.hidden) closeModal(el.deleteModal);
  });

  // Синхронизация между вкладками
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    state.products = readLS(STORAGE_KEY, []);
    renderStats();
    renderTable();
  });
}

// =========================================================
// Инициализация
// =========================================================

function renderCategoryOptions() {
  el.fCategory.innerHTML = CATEGORIES
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join('');
}

function init() {
  renderCategoryOptions();
  loadProducts();
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
