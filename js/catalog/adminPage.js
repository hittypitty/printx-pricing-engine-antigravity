/**
 * Manage Products Page — edit title, category, stock and price tiers.
 *
 * Price-tier fix: every tier input writes straight into the draft on 'input',
 * and "+ Add Tier" APPENDS a new row instead of rebuilding the list from stale
 * data — so existing tier details are never lost when a new tier is added.
 */

import { init as initHeader } from '../ui/header.js';
import {
  loadProducts,
  saveProducts,
  resetProducts,
  hasLocalEdits,
  normalizeProduct,
  validateTiers,
  getStockStatus,
  formatTierRange,
  formatINR,
  escapeHtml,
  slugify,
} from './productStore.js';

const state = {
  products: [],
  selectedId: null, // null + draft = new product
  draft: null,
  dirty: false,
};

let root;

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', () => {
  initHeader(document.getElementById('app-header'));
  root = document.getElementById('admin-root');
  state.products = loadProducts();
  root.innerHTML = buildShell();
  bindEvents();
  renderList();
  if (state.products.length) {
    selectProduct(state.products[0].id);
  } else {
    startNewProduct();
  }

  window.addEventListener('beforeunload', e => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
});

// ---------- Helpers ----------

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function emptyTier(minQty = 1) {
  return { minQty, maxQty: '', price: '' };
}

function toDraft(product) {
  const d = clone(product);
  d.tiers = d.tiers.map(t => ({
    minQty: t.minQty,
    maxQty: t.maxQty === null ? '' : t.maxQty,
    price: t.price,
  }));
  return d;
}

function confirmDiscard() {
  return !state.dirty || window.confirm('You have unsaved changes. Discard them?');
}

function setDirty(v) {
  state.dirty = v;
  const badge = root.querySelector('#editor-dirty');
  if (badge) badge.hidden = !v;
}

function toast(msg, type = 'success') {
  const el = root.querySelector('#admin-toast');
  el.textContent = msg;
  el.className = `admin-toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'admin-toast'; }, 2400);
}

// ---------- Shell ----------

function buildShell() {
  return `
    <div class="admin-grid">
      <section class="card admin-list-card">
        <div class="card-header admin-list-header">
          <h2 class="card-title">Products</h2>
          <button type="button" class="btn-add-conversion" data-action="new-product">+ New Product</button>
        </div>
        <div class="admin-list" id="admin-list"></div>
      </section>

      <section class="card admin-editor-card">
        <div class="card-header admin-editor-header">
          <h2 class="card-title" id="editor-title">Edit Product</h2>
          <span class="admin-dirty" id="editor-dirty" hidden>Unsaved changes</span>
        </div>
        <div class="card-body" id="admin-editor"></div>
      </section>
    </div>

    <section class="card admin-data-card">
      <div class="card-body admin-data-body">
        <div>
          <div class="admin-data-title">Catalog data</div>
          <div class="text-muted" id="admin-data-note"></div>
        </div>
        <div class="admin-data-actions">
          <button type="button" class="btn-add-conversion" data-action="export">Copy JSON</button>
          <button type="button" class="btn-add-conversion admin-danger-outline" data-action="reset-all">Reset to defaults</button>
        </div>
      </div>
    </section>

    <div class="admin-toast" id="admin-toast" role="status" aria-live="polite"></div>
  `;
}

function renderDataNote() {
  const note = root.querySelector('#admin-data-note');
  note.textContent = hasLocalEdits()
    ? 'Your edits are saved in this browser. Use "Copy JSON" to move them into js/config/products.js for everyone.'
    : 'Showing default catalog from js/config/products.js.';
}

// ---------- Product list ----------

function renderList() {
  const list = root.querySelector('#admin-list');
  if (state.products.length === 0) {
    list.innerHTML = '<div class="admin-list-empty text-muted">No products yet.</div>';
  } else {
    list.innerHTML = state.products.map(p => {
      const s = getStockStatus(p);
      return `
        <button type="button" class="admin-list-item ${p.id === state.selectedId ? 'active' : ''}" data-action="select" data-id="${escapeHtml(p.id)}">
          <span class="admin-list-name">${escapeHtml(p.title || 'Untitled')}</span>
          <span class="admin-list-meta">
            <span class="stock-pill stock-${s.key}">${s.label}</span>
            <span>${p.stock} ${escapeHtml(p.unit)} · ${p.tiers.length} tier${p.tiers.length === 1 ? '' : 's'}</span>
          </span>
        </button>
      `;
    }).join('');
  }
  renderDataNote();
}

// ---------- Editor ----------

function selectProduct(id) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;
  state.selectedId = id;
  state.draft = toDraft(product);
  setDirty(false);
  renderList();
  renderEditor();
}

function startNewProduct() {
  state.selectedId = null;
  state.draft = {
    id: '',
    title: '',
    category: '',
    image: '',
    unit: 'pc',
    stock: 0,
    tiers: [emptyTier(1)],
  };
  setDirty(false);
  renderList();
  renderEditor();
  const title = root.querySelector('[data-field="title"]');
  if (title) title.focus();
}

function renderEditor() {
  const d = state.draft;
  const isNew = state.selectedId === null;
  root.querySelector('#editor-title').textContent = isNew ? 'New Product' : 'Edit Product';

  const categories = Array.from(new Set(state.products.map(p => p.category))).sort();

  root.querySelector('#admin-editor').innerHTML = `
    <div class="admin-form">
      <div class="admin-field admin-field-wide">
        <label class="field-label" for="f-title">Product Title</label>
        <input class="input-field" id="f-title" data-field="title" value="${escapeHtml(d.title)}" placeholder="e.g. White Sublimation Mug" />
      </div>
      <div class="admin-field">
        <label class="field-label" for="f-category">Category</label>
        <input class="input-field" id="f-category" data-field="category" value="${escapeHtml(d.category)}" list="category-options" placeholder="e.g. Drinkware" />
        <datalist id="category-options">${categories.map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}</datalist>
      </div>
      <div class="admin-field">
        <label class="field-label" for="f-unit">Unit</label>
        <input class="input-field" id="f-unit" data-field="unit" value="${escapeHtml(d.unit)}" placeholder="pc / pack / roll" />
      </div>
      <div class="admin-field">
        <label class="field-label" for="f-stock">Stock Available</label>
        <input class="input-field" id="f-stock" type="number" min="0" step="1" data-field="stock" value="${escapeHtml(d.stock)}" />
        <div class="admin-hint" id="stock-hint"></div>
      </div>
      <div class="admin-field">
        <label class="field-label" for="f-image">Image URL <span class="admin-optional">(optional)</span></label>
        <input class="input-field" id="f-image" data-field="image" value="${escapeHtml(d.image)}" placeholder="https://…" />
      </div>
    </div>

    <div class="admin-tiers">
      <div class="admin-tiers-header">
        <div>
          <div class="field-label" style="margin-bottom: 2px;">Price Tiers (Quantity-wise)</div>
          <div class="admin-hint">Leave "To qty" empty on the last tier for "and above".</div>
        </div>
        <button type="button" class="btn-add-conversion" data-action="add-tier">+ Add Tier</button>
      </div>
      <div class="tier-row tier-row-head" aria-hidden="true">
        <span>#</span><span>From qty</span><span>To qty</span><span>Price / unit (₹)</span><span></span>
      </div>
      <div id="tier-rows"></div>
      <div class="validation-error" id="tier-errors" style="display: none;"></div>
    </div>

    <div class="admin-preview">
      <div class="field-label">Customer preview</div>
      <div id="tier-preview"></div>
    </div>

    <div class="admin-actions">
      ${isNew ? '' : '<button type="button" class="btn admin-delete" data-action="delete">Delete</button>'}
      <div class="admin-actions-right">
        <button type="button" class="btn" data-action="discard">${isNew ? 'Cancel' : 'Discard changes'}</button>
        <button type="button" class="btn btn-primary" data-action="save">${isNew ? 'Add Product' : 'Save Changes'}</button>
      </div>
    </div>
  `;

  renderTierRows();
  updateStockHint();
  updatePreview();
}

function tierRowHTML(t, i) {
  return `
    <div class="tier-row" data-tier-row="${i}">
      <span class="tier-index">${i + 1}</span>
      <input class="input-field" type="number" min="1" step="1" inputmode="numeric" data-tier="${i}" data-key="minQty" value="${escapeHtml(t.minQty)}" aria-label="Tier ${i + 1} from quantity" />
      <input class="input-field" type="number" min="1" step="1" inputmode="numeric" data-tier="${i}" data-key="maxQty" value="${escapeHtml(t.maxQty)}" placeholder="& above" aria-label="Tier ${i + 1} to quantity" />
      <input class="input-field" type="number" min="0" step="0.01" inputmode="decimal" data-tier="${i}" data-key="price" value="${escapeHtml(t.price)}" placeholder="0" aria-label="Tier ${i + 1} price" />
      <button type="button" class="tier-remove" data-action="remove-tier" data-tier="${i}" aria-label="Remove tier ${i + 1}" ${state.draft.tiers.length === 1 ? 'disabled' : ''}>✕</button>
    </div>
  `;
}

/** Full rebuild — only used on load and after removing a tier (always from the up-to-date draft). */
function renderTierRows() {
  const wrap = root.querySelector('#tier-rows');
  wrap.innerHTML = state.draft.tiers.map(tierRowHTML).join('');
}

function syncRemoveButtons() {
  const disable = state.draft.tiers.length === 1;
  root.querySelectorAll('.tier-remove').forEach(b => { b.disabled = disable; });
}

/**
 * Add a tier: pre-fill sensible values from the previous tier and APPEND a row.
 * Existing rows (and whatever the user typed in them) are left untouched.
 */
function addTier() {
  const tiers = state.draft.tiers;
  const last = tiers[tiers.length - 1];
  let nextMin = 1;

  if (last) {
    const lastMin = parseInt(last.minQty, 10) || 1;
    const lastMax = parseInt(last.maxQty, 10);
    if (Number.isFinite(lastMax)) {
      nextMin = lastMax + 1;
    } else {
      // Previous tier was open-ended: close it at a sensible point
      nextMin = lastMin + 10;
      last.maxQty = nextMin - 1;
      const prevMaxInput = root.querySelector(`[data-tier="${tiers.length - 1}"][data-key="maxQty"]`);
      if (prevMaxInput) prevMaxInput.value = last.maxQty;
    }
  }

  const tier = emptyTier(nextMin);
  tiers.push(tier);
  root.querySelector('#tier-rows').insertAdjacentHTML('beforeend', tierRowHTML(tier, tiers.length - 1));
  syncRemoveButtons();
  setDirty(true);
  updatePreview();

  const priceInput = root.querySelector(`[data-tier="${tiers.length - 1}"][data-key="price"]`);
  if (priceInput) priceInput.focus();
}

function removeTier(index) {
  if (state.draft.tiers.length <= 1) return;
  state.draft.tiers.splice(index, 1);
  renderTierRows();
  setDirty(true);
  updatePreview();
}

function updateStockHint() {
  const hint = root.querySelector('#stock-hint');
  if (!hint) return;
  const s = getStockStatus({ stock: state.draft.stock, unit: state.draft.unit || 'pc' });
  hint.innerHTML = `Shows as <span class="stock-pill stock-${s.key}">${s.label}</span>`;
}

function updatePreview() {
  const preview = root.querySelector('#tier-preview');
  const errorsEl = root.querySelector('#tier-errors');
  const errors = validateTiers(state.draft.tiers);
  const unit = state.draft.unit || 'pc';

  // Only show errors for tiers the user has started filling
  const showErrors = errors.length > 0 && state.dirty;
  errorsEl.style.display = showErrors ? 'block' : 'none';
  errorsEl.innerHTML = showErrors ? errors.map(e => `<div>${escapeHtml(e)}</div>`).join('') : '';

  const filled = normalizeProduct({ ...state.draft, tiers: state.draft.tiers.filter(t => t.price !== '' && t.minQty !== '') }).tiers;
  if (filled.length === 0) {
    preview.innerHTML = '<div class="text-muted">Add tier prices to see the preview.</div>';
    return;
  }
  preview.innerHTML = `
    <table class="tier-table">
      <thead><tr><th>Quantity</th><th>Price / ${escapeHtml(unit)}</th></tr></thead>
      <tbody>
        ${filled.map(t => `<tr><td>${escapeHtml(formatTierRange(t, unit))}</td><td>${formatINR(t.price)}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}

// ---------- Save / delete ----------

function collectErrors() {
  const d = state.draft;
  const errors = [];
  if (!String(d.title).trim()) errors.push('Product title is required.');
  const stock = Number(d.stock);
  if (d.stock === '' || !Number.isInteger(stock) || stock < 0) errors.push('Stock must be a whole number (0 or more).');
  return errors.concat(validateTiers(d.tiers));
}

function save() {
  setDirty(true); // so validation messages show
  const errors = collectErrors();
  const errorsEl = root.querySelector('#tier-errors');
  if (errors.length) {
    errorsEl.style.display = 'block';
    errorsEl.innerHTML = errors.map(e => `<div>${escapeHtml(e)}</div>`).join('');
    errorsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const isNew = state.selectedId === null;
  const product = normalizeProduct({
    ...state.draft,
    id: isNew ? `${slugify(state.draft.title)}-${Date.now().toString(36)}` : state.selectedId,
  });

  if (isNew) {
    state.products.push(product);
  } else {
    state.products = state.products.map(p => (p.id === product.id ? product : p));
  }

  if (!saveProducts(state.products)) {
    toast('Could not save — browser storage is blocked.', 'error');
    return;
  }

  state.selectedId = product.id;
  state.draft = toDraft(product);
  setDirty(false);
  renderList();
  renderEditor();
  toast(isNew ? 'Product added' : 'Changes saved');
}

function deleteProduct() {
  if (state.selectedId === null) return;
  const product = state.products.find(p => p.id === state.selectedId);
  if (!window.confirm(`Delete "${product ? product.title : 'this product'}"?`)) return;
  state.products = state.products.filter(p => p.id !== state.selectedId);
  saveProducts(state.products);
  setDirty(false);
  if (state.products.length) selectProduct(state.products[0].id);
  else startNewProduct();
  toast('Product deleted');
}

// ---------- Events ----------

function bindEvents() {
  root.addEventListener('input', e => {
    const t = e.target;
    if (!state.draft) return;

    if (t.dataset.tier !== undefined && t.dataset.key) {
      const i = Number(t.dataset.tier);
      if (state.draft.tiers[i]) state.draft.tiers[i][t.dataset.key] = t.value;
      setDirty(true);
      updatePreview();
      return;
    }

    if (t.dataset.field) {
      state.draft[t.dataset.field] = t.value;
      setDirty(true);
      if (t.dataset.field === 'stock' || t.dataset.field === 'unit') updateStockHint();
      if (t.dataset.field === 'unit') updatePreview();
    }
  });

  root.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'select':
        if (btn.dataset.id !== state.selectedId && confirmDiscard()) selectProduct(btn.dataset.id);
        break;
      case 'new-product':
        if (confirmDiscard()) startNewProduct();
        break;
      case 'add-tier':
        addTier();
        break;
      case 'remove-tier':
        removeTier(Number(btn.dataset.tier));
        break;
      case 'save':
        save();
        break;
      case 'delete':
        deleteProduct();
        break;
      case 'discard':
        setDirty(false);
        if (state.selectedId) selectProduct(state.selectedId);
        else if (state.products.length) selectProduct(state.products[0].id);
        else startNewProduct();
        break;
      case 'export': {
        const json = JSON.stringify(state.products, null, 2);
        try {
          await navigator.clipboard.writeText(json);
          toast('Catalog JSON copied');
        } catch (err) {
          toast('Copy failed — clipboard not available', 'error');
        }
        break;
      }
      case 'reset-all':
        if (window.confirm('Reset the catalog to the default products? Your browser edits will be removed.')) {
          state.products = resetProducts();
          setDirty(false);
          if (state.products.length) selectProduct(state.products[0].id);
          else startNewProduct();
          toast('Catalog reset to defaults');
        }
        break;
    }
  });
}
