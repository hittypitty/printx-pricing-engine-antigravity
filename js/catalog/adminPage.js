/**
 * Inventory Page (Manage Products)
 *
 * Two modes:
 *  - Database mode (js/config/supabase.js filled): inventory manager logs in,
 *    edits products/price tiers, adjusts stock with a reason, sees stock history.
 *    Changes are live for everyone.
 *  - Local mode (no Supabase config): edits saved in this browser only.
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
import * as db from './db.js';

const MODE = db.isDbConfigured() ? 'db' : 'local';

const state = {
  products: [],
  selectedId: null, // null + draft = new product
  draft: null,
  dirty: false,
  busy: false,
  user: null,
  staff: null, // { name, role }
  staffNames: {},
};

let root;

// ======================================================================
// Init
// ======================================================================

document.addEventListener('DOMContentLoaded', async () => {
  initHeader(document.getElementById('app-header'));
  root = document.getElementById('admin-root');
  bindEvents();

  window.addEventListener('beforeunload', e => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  if (MODE === 'local') {
    state.products = loadProducts();
    renderApp();
    return;
  }

  renderMessage('Checking login…');
  try {
    const session = await db.getSession();
    if (session) await enterApp(session);
    else renderLogin();
  } catch (err) {
    renderLogin(err.message);
  }
});

async function enterApp(session) {
  renderMessage('Loading inventory…');
  const staff = await db.getStaff(session.user.id);
  if (!staff) {
    renderNoAccess(session.user.email);
    return;
  }
  state.user = session.user;
  state.staff = staff;
  const [products, names] = await Promise.all([db.fetchProducts(), db.fetchStaffNames()]);
  state.products = products;
  state.staffNames = names;
  renderApp();
}

// ======================================================================
// Helpers
// ======================================================================

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
  if (d.isActive === undefined) d.isActive = true;
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

function setBusy(v) {
  state.busy = v;
  root.querySelectorAll('[data-busy-lock]').forEach(b => { b.disabled = v; });
}

function toast(msg, type = 'success') {
  let el = document.getElementById('admin-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'admin-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `admin-toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'admin-toast'; }, 2800);
}

function canDelete() {
  return MODE === 'local' || (state.staff && state.staff.role === 'admin');
}

function roleLabel(role) {
  return role === 'admin' ? 'Admin' : 'Inventory Manager';
}

// ======================================================================
// Screens: message / login / no access
// ======================================================================

function renderMessage(text) {
  root.innerHTML = `<div class="card"><div class="card-body text-muted">${escapeHtml(text)}</div></div>`;
}

function renderLogin(error = '') {
  root.innerHTML = `
    <section class="card auth-card">
      <div class="card-header"><h2 class="card-title">Inventory Login</h2></div>
      <form class="card-body auth-form" id="login-form" novalidate>
        <div class="field-group">
          <label class="field-label" for="login-email">Email</label>
          <input class="input-field" id="login-email" type="email" autocomplete="username" required />
        </div>
        <div class="field-group">
          <label class="field-label" for="login-password">Password</label>
          <input class="input-field" id="login-password" type="password" autocomplete="current-password" required />
        </div>
        <div class="validation-error" id="login-error" style="display: ${error ? 'block' : 'none'};">${escapeHtml(error)}</div>
        <button type="submit" class="btn btn-primary auth-submit" id="login-submit">Log in</button>
        <div class="text-muted auth-note">Only inventory staff can log in. Ask the admin to create your account.</div>
      </form>
    </section>
  `;
  const email = root.querySelector('#login-email');
  if (email) email.focus();
}

function renderNoAccess(email) {
  root.innerHTML = `
    <section class="card auth-card">
      <div class="card-header"><h2 class="card-title">No inventory access</h2></div>
      <div class="card-body">
        <p class="text-muted" style="margin-bottom: 16px;">
          You are logged in as <strong>${escapeHtml(email || '')}</strong>, but this account is not an inventory manager.
          Ask the admin to give you access.
        </p>
        <button type="button" class="btn" data-action="logout">Log out</button>
      </div>
    </section>
  `;
}

// ======================================================================
// Main app
// ======================================================================

function renderApp() {
  root.innerHTML = buildShell();
  renderList();
  if (state.products.length) {
    selectProduct(state.products[0].id);
  } else {
    startNewProduct();
  }
}

function buildShell() {
  const topBar = MODE === 'db'
    ? `
      <div class="admin-userbar card">
        <div>
          <span class="admin-user-name">${escapeHtml(state.staff.name || state.user.email)}</span>
          <span class="admin-role-pill">${roleLabel(state.staff.role)}</span>
          <span class="text-muted admin-user-email">${escapeHtml(state.user.email || '')}</span>
        </div>
        <div class="admin-userbar-actions">
          <span class="admin-live"><span class="admin-live-dot"></span>Live database</span>
          <button type="button" class="btn-add-conversion" data-action="refresh" data-busy-lock>Refresh</button>
          <button type="button" class="btn-add-conversion" data-action="logout">Log out</button>
        </div>
      </div>`
    : `
      <div class="admin-local-banner">
        <strong>Local mode:</strong> not connected to the database — edits are saved in this browser only.
        Add the Supabase URL &amp; anon key in <code>js/config/supabase.js</code> to enable inventory login.
      </div>`;

  const dataCard = MODE === 'local'
    ? `
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
      </section>`
    : '';

  return `
    ${topBar}
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
    ${dataCard}
  `;
}

function renderDataNote() {
  const note = root.querySelector('#admin-data-note');
  if (!note) return;
  note.textContent = hasLocalEdits()
    ? 'Your edits are saved in this browser. Use "Copy JSON" to move them into js/config/products.js for everyone.'
    : 'Showing default catalog from js/config/products.js.';
}

// ---------- Product list ----------

function renderList() {
  const list = root.querySelector('#admin-list');
  if (!list) return;
  if (state.products.length === 0) {
    list.innerHTML = '<div class="admin-list-empty text-muted">No products yet.</div>';
  } else {
    list.innerHTML = state.products.map(p => {
      const s = getStockStatus(p);
      const hidden = p.isActive === false;
      return `
        <button type="button" class="admin-list-item ${p.id === state.selectedId ? 'active' : ''}" data-action="select" data-id="${escapeHtml(p.id)}">
          <span class="admin-list-name">${escapeHtml(p.title || 'Untitled')}${hidden ? ' <span class="admin-hidden-pill">Hidden</span>' : ''}</span>
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
    isActive: true,
    tiers: [emptyTier(1)],
  };
  setDirty(false);
  renderList();
  renderEditor();
  const title = root.querySelector('[data-field="title"]');
  if (title) title.focus();
}

function stockSectionHTML(d, isNew) {
  // In database mode, stock of an existing product changes only via Add/Remove (logged, atomic)
  if (MODE === 'db' && !isNew) {
    return `
      <div class="admin-field admin-field-wide">
        <label class="field-label">Stock</label>
        <div class="stock-panel">
          <div class="stock-current">
            <div class="stock-current-value" id="stock-current">${escapeHtml(d.stock)} <span>${escapeHtml(d.unit || 'pc')}</span></div>
            <div id="stock-hint"></div>
          </div>
          <div class="stock-adjust">
            <input class="input-field" type="number" min="1" step="1" inputmode="numeric" id="adjust-qty" placeholder="Qty" aria-label="Quantity to add or remove" />
            <input class="input-field" type="text" id="adjust-reason" placeholder="Reason (e.g. New purchase, Damaged)" aria-label="Reason" />
            <div class="stock-adjust-buttons">
              <button type="button" class="btn stock-btn-add" data-action="stock-add" data-busy-lock>+ Add</button>
              <button type="button" class="btn stock-btn-remove" data-action="stock-remove" data-busy-lock>− Remove</button>
            </div>
          </div>
        </div>
        <div class="stock-history">
          <div class="field-label" style="margin: 16px 0 8px;">Recent stock changes</div>
          <div id="stock-history-list" class="text-muted">Loading…</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="admin-field">
      <label class="field-label" for="f-stock">${isNew ? 'Opening Stock' : 'Stock Available'}</label>
      <input class="input-field" id="f-stock" type="number" min="0" step="1" data-field="stock" value="${escapeHtml(d.stock)}" />
      <div class="admin-hint" id="stock-hint"></div>
    </div>
  `;
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
      ${stockSectionHTML(d, isNew)}
      <div class="admin-field">
        <label class="field-label" for="f-image">Image URL <span class="admin-optional">(optional)</span></label>
        <input class="input-field" id="f-image" data-field="image" value="${escapeHtml(d.image)}" placeholder="https://…" />
      </div>
      ${MODE === 'db' ? `
      <div class="admin-field admin-field-wide">
        <label class="catalog-toggle">
          <input type="checkbox" data-field="isActive" ${d.isActive !== false ? 'checked' : ''} />
          <span>Show on catalog</span>
        </label>
      </div>` : ''}
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
      ${!isNew && canDelete() ? '<button type="button" class="btn admin-delete" data-action="delete" data-busy-lock>Delete</button>' : ''}
      <div class="admin-actions-right">
        <button type="button" class="btn" data-action="discard">${isNew ? 'Cancel' : 'Discard changes'}</button>
        <button type="button" class="btn btn-primary" data-action="save" data-busy-lock>${isNew ? 'Add Product' : 'Save Changes'}</button>
      </div>
    </div>
  `;

  renderTierRows();
  updateStockHint();
  updatePreview();
  if (MODE === 'db' && !isNew) loadStockHistory(d.id);
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
  hint.className = MODE === 'db' && state.selectedId ? 'admin-hint stock-current-hint' : 'admin-hint';
}

function updatePreview() {
  const preview = root.querySelector('#tier-preview');
  const errorsEl = root.querySelector('#tier-errors');
  if (!preview || !errorsEl) return;
  const errors = validateTiers(state.draft.tiers);
  const unit = state.draft.unit || 'pc';

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

// ---------- Stock (database mode) ----------

async function loadStockHistory(productId) {
  const el = root.querySelector('#stock-history-list');
  if (!el) return;
  try {
    const rows = await db.fetchStockLog(productId, 10);
    if (state.selectedId !== productId) return; // user moved on
    if (rows.length === 0) {
      el.innerHTML = '<div class="text-muted">No stock changes yet.</div>';
      return;
    }
    el.className = '';
    el.innerHTML = `
      <table class="stock-log">
        <thead><tr><th>When</th><th>Change</th><th>Stock</th><th>Reason</th><th>By</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${escapeHtml(new Date(r.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td>
              <td class="${r.change >= 0 ? 'log-up' : 'log-down'}">${r.change > 0 ? '+' : ''}${r.change}</td>
              <td>${r.new_stock}</td>
              <td>${escapeHtml(r.reason || '')}</td>
              <td>${escapeHtml((r.user_id && state.staffNames[r.user_id]) || (r.user_id ? 'Staff' : 'System'))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    el.textContent = err.message;
  }
}

async function applyStockChange(direction) {
  const qtyInput = root.querySelector('#adjust-qty');
  const reasonInput = root.querySelector('#adjust-reason');
  const qty = parseInt(qtyInput.value, 10);
  if (!Number.isFinite(qty) || qty <= 0) {
    toast('Enter a quantity greater than 0', 'error');
    qtyInput.focus();
    return;
  }
  const id = state.selectedId;
  const change = direction === 'add' ? qty : -qty;
  setBusy(true);
  try {
    const newStock = await db.adjustStock(id, change, reasonInput.value.trim());
    const product = state.products.find(p => p.id === id);
    if (product) product.stock = newStock;
    if (state.selectedId === id) {
      state.draft.stock = newStock;
      const cur = root.querySelector('#stock-current');
      if (cur) cur.innerHTML = `${newStock} <span>${escapeHtml(state.draft.unit || 'pc')}</span>`;
      qtyInput.value = '';
      reasonInput.value = '';
      updateStockHint();
      loadStockHistory(id);
    }
    renderList();
    toast(`Stock ${change > 0 ? 'added' : 'removed'} — now ${newStock}`);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setBusy(false);
  }
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

async function save() {
  if (state.busy) return;
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
  const draft = {
    ...state.draft,
    id: isNew ? `${slugify(state.draft.title)}-${Date.now().toString(36)}` : state.selectedId,
  };

  let saved;
  if (MODE === 'db') {
    setBusy(true);
    try {
      saved = isNew ? await db.createProduct(draft) : await db.updateProduct(draft);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
      return;
    }
    setBusy(false);
  } else {
    saved = normalizeProduct(draft);
  }

  if (isNew) {
    state.products.push(saved);
  } else {
    state.products = state.products.map(p => (p.id === saved.id ? saved : p));
  }

  if (MODE === 'local' && !saveProducts(state.products)) {
    toast('Could not save — browser storage is blocked.', 'error');
    return;
  }

  state.selectedId = saved.id;
  state.draft = toDraft(saved);
  setDirty(false);
  renderList();
  renderEditor();
  toast(isNew ? 'Product added' : 'Changes saved');
}

async function removeProduct() {
  if (state.selectedId === null || state.busy) return;
  const product = state.products.find(p => p.id === state.selectedId);
  if (!window.confirm(`Delete "${product ? product.title : 'this product'}"? This cannot be undone.`)) return;

  if (MODE === 'db') {
    setBusy(true);
    try {
      await db.deleteProduct(state.selectedId);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  state.products = state.products.filter(p => p.id !== state.selectedId);
  if (MODE === 'local') saveProducts(state.products);
  setDirty(false);
  if (state.products.length) selectProduct(state.products[0].id);
  else startNewProduct();
  toast('Product deleted');
}

async function refresh() {
  if (!confirmDiscard()) return;
  setBusy(true);
  try {
    state.products = await db.fetchProducts();
    const keep = state.products.find(p => p.id === state.selectedId);
    setDirty(false);
    renderList();
    if (keep) selectProduct(keep.id);
    else if (state.products.length) selectProduct(state.products[0].id);
    else startNewProduct();
    toast('Inventory refreshed');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setBusy(false);
  }
}

// ======================================================================
// Events (delegated once on root — works for login and app screens)
// ======================================================================

function bindEvents() {
  root.addEventListener('submit', async e => {
    if (e.target.id !== 'login-form') return;
    e.preventDefault();
    const email = root.querySelector('#login-email').value.trim();
    const password = root.querySelector('#login-password').value;
    const errEl = root.querySelector('#login-error');
    const btn = root.querySelector('#login-submit');
    if (!email || !password) {
      errEl.textContent = 'Enter email and password.';
      errEl.style.display = 'block';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Logging in…';
    try {
      const session = await db.signIn(email, password);
      await enterApp(session);
    } catch (err) {
      renderLogin(err.message);
      const emailInput = root.querySelector('#login-email');
      if (emailInput) emailInput.value = email;
    }
  });

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
      state.draft[t.dataset.field] = t.type === 'checkbox' ? t.checked : t.value;
      setDirty(true);
      if (t.dataset.field === 'stock' || t.dataset.field === 'unit') updateStockHint();
      if (t.dataset.field === 'unit') updatePreview();
    }
  });

  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target.id === 'adjust-qty' || e.target.id === 'adjust-reason')) {
      e.preventDefault();
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
        removeProduct();
        break;
      case 'stock-add':
        applyStockChange('add');
        break;
      case 'stock-remove':
        applyStockChange('remove');
        break;
      case 'refresh':
        refresh();
        break;
      case 'logout':
        if (!confirmDiscard()) break;
        setDirty(false);
        try { await db.signOut(); } catch (err) { /* ignore */ }
        state.user = null;
        state.staff = null;
        state.products = [];
        renderLogin();
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
