/**
 * BV Catalog Page
 *
 * - Search bar + category filter (replaces Add to Cart)
 * - No reviews under the product title
 * - Quantity-wise price table instead of a single price tag
 * - Stock status computed from the real stock number (In / Low / Out of Stock)
 */

import { init as initHeader } from '../ui/header.js';
import { getConfig } from '../state/configStore.js';
import {
  loadProducts,
  getStockStatus,
  getTierForQty,
  getStartingPrice,
  formatTierRange,
  formatINR,
  escapeHtml,
} from './productStore.js';

const WHATSAPP_NUMBER = getConfig().branding.whatsappNumber || '917869581020';

const state = {
  products: [],
  query: '',
  category: 'All',
  inStockOnly: false,
  qty: new Map(), // productId -> selected quantity
};

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', () => {
  initHeader(document.getElementById('app-header'));
  state.products = loadProducts();

  const root = document.getElementById('catalog-root');
  root.innerHTML = buildShell();
  renderCategories(root);
  renderGrid(root);
  bindEvents(root);
});

// ---------- Shell ----------

function buildShell() {
  return `
    <section class="catalog-toolbar card">
      <div class="card-body">
        <label class="catalog-search" for="catalog-search-input">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="search" id="catalog-search-input" placeholder="Search products by name or category…" autocomplete="off" aria-label="Search products" />
          <button type="button" class="catalog-search-clear" id="catalog-search-clear" aria-label="Clear search" hidden>✕</button>
        </label>

        <div class="catalog-filters">
          <div class="catalog-chips" id="catalog-categories" role="group" aria-label="Category"></div>
          <label class="catalog-toggle">
            <input type="checkbox" id="catalog-instock" />
            <span>In stock only</span>
          </label>
        </div>
        <div class="catalog-count" id="catalog-count" aria-live="polite"></div>
      </div>
    </section>

    <section class="catalog-grid" id="catalog-grid"></section>
  `;
}

function getCategories() {
  const set = new Set(state.products.map(p => p.category));
  return ['All', ...Array.from(set).sort()];
}

function renderCategories(root) {
  const el = root.querySelector('#catalog-categories');
  el.innerHTML = getCategories().map(c => `
    <button type="button" class="chip ${state.category === c ? 'active' : ''}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>
  `).join('');
}

// ---------- Filtering ----------

function getFilteredProducts() {
  const q = state.query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  return state.products.filter(p => {
    if (state.category !== 'All' && p.category !== state.category) return false;
    if (state.inStockOnly && p.stock <= 0) return false;
    if (terms.length === 0) return true;
    const haystack = `${p.title} ${p.category}`.toLowerCase();
    return terms.every(t => haystack.includes(t));
  });
}

// ---------- Grid ----------

function renderGrid(root) {
  const grid = root.querySelector('#catalog-grid');
  const list = getFilteredProducts();
  const countEl = root.querySelector('#catalog-count');
  countEl.textContent = `${list.length} of ${state.products.length} products`;

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty card">
        <div class="card-body">
          <div class="catalog-empty-title">No products found</div>
          <div class="text-muted">Try a different search term or category.</div>
        </div>
      </div>
    `;
    return;
  }

  grid.innerHTML = list.map(buildCard).join('');
}

function getQty(product) {
  const saved = state.qty.get(product.id);
  if (saved) return saved;
  return product.tiers.length ? product.tiers[0].minQty : 1;
}

function buildPlaceholder(product) {
  const initials = product.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
  return `<div class="product-image-placeholder" aria-hidden="true">${escapeHtml(initials || 'BV')}</div>`;
}

function buildCard(product) {
  const stock = getStockStatus(product);
  const isOut = stock.key === 'out';
  const qty = getQty(product);
  const startPrice = getStartingPrice(product);

  const image = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'product-image-placeholder',textContent:'BV'}))" />`
    : buildPlaceholder(product);

  return `
    <article class="product-card card ${isOut ? 'is-out' : ''}" data-id="${escapeHtml(product.id)}">
      <div class="product-image">${image}</div>
      <div class="product-body">
        <div class="product-category">${escapeHtml(product.category)}</div>
        <h3 class="product-title">${escapeHtml(product.title)}</h3>

        <div class="stock-status stock-${stock.key}">
          <span class="stock-dot" aria-hidden="true"></span>
          <span class="stock-label">${stock.label}</span>
          <span class="stock-detail">· ${escapeHtml(stock.detail)}</span>
        </div>

        <div class="tier-block">
          <div class="tier-heading">
            <span>Quantity-wise Price</span>
            ${startPrice !== null ? `<span class="tier-from">from ${formatINR(startPrice)}/${escapeHtml(product.unit)}</span>` : ''}
          </div>
          ${product.tiers.length ? `
            <table class="tier-table">
              <thead><tr><th>Quantity</th><th>Price / ${escapeHtml(product.unit)}</th></tr></thead>
              <tbody>
                ${product.tiers.map((t, i) => `
                  <tr data-tier-index="${i}">
                    <td>${escapeHtml(formatTierRange(t, product.unit))}</td>
                    <td>${formatINR(t.price)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<div class="text-muted">Price on request</div>'}
        </div>

        <div class="product-qty">
          <label class="field-label" for="qty-${escapeHtml(product.id)}">Quantity</label>
          <div class="number-input-group">
            <button type="button" class="btn-spin" data-action="dec" ${isOut ? 'disabled' : ''} aria-label="Decrease quantity">-</button>
            <input type="number" class="input-field" id="qty-${escapeHtml(product.id)}" min="1" ${isOut ? '' : `max="${product.stock}"`} value="${qty}" data-action="qty" ${isOut ? 'disabled' : ''} />
            <button type="button" class="btn-spin" data-action="inc" ${isOut ? 'disabled' : ''} aria-label="Increase quantity">+</button>
          </div>
          <div class="product-estimate" data-role="estimate"></div>
        </div>

        <a class="btn btn-whatsapp product-enquire ${isOut ? 'is-disabled' : ''}" data-role="enquire" target="_blank" rel="noopener" ${isOut ? 'aria-disabled="true" tabindex="-1"' : ''}>
          ${isOut ? 'Out of Stock' : 'Enquire on WhatsApp'}
        </a>
      </div>
    </article>
  `;
}

/**
 * Update only the qty-dependent parts of a card (keeps focus in the input).
 */
function updateCardPricing(card) {
  const product = state.products.find(p => p.id === card.dataset.id);
  if (!product) return;
  const qty = getQty(product);
  const stock = getStockStatus(product);
  const tier = getTierForQty(product, qty);

  // Highlight active tier row
  card.querySelectorAll('.tier-table tbody tr').forEach((row, i) => {
    row.classList.toggle('active', tier !== null && product.tiers[i] === tier);
  });

  const estimate = card.querySelector('[data-role="estimate"]');
  const enquire = card.querySelector('[data-role="enquire"]');

  if (stock.key === 'out') {
    estimate.innerHTML = '';
    enquire.removeAttribute('href');
    return;
  }

  const overStock = qty > product.stock;
  if (tier) {
    const total = tier.price * qty;
    estimate.innerHTML = `
      <span>${formatINR(tier.price)} × ${qty} = <strong>${formatINR(total)}</strong></span>
      ${overStock ? `<span class="estimate-warning">Only ${product.stock} ${escapeHtml(product.unit)} in stock</span>` : ''}
    `;
  } else {
    estimate.innerHTML = overStock
      ? `<span class="estimate-warning">Only ${product.stock} ${escapeHtml(product.unit)} in stock</span>`
      : '';
  }

  const msg = tier
    ? `Hi, I'm interested in *${product.title}*.\nQuantity: ${qty} ${product.unit}\nPrice: ${formatINR(tier.price)}/${product.unit} (Total ${formatINR(tier.price * qty)})\nPlease confirm availability.`
    : `Hi, I'm interested in *${product.title}* (Qty: ${qty} ${product.unit}). Please share the price.`;
  enquire.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

function refreshAllCards(root) {
  root.querySelectorAll('.product-card').forEach(updateCardPricing);
}

// ---------- Events ----------

function setQty(card, rawValue) {
  const product = state.products.find(p => p.id === card.dataset.id);
  if (!product) return;
  let qty = parseInt(rawValue, 10);
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  state.qty.set(product.id, qty);
  const input = card.querySelector('[data-action="qty"]');
  if (input && String(input.value) !== String(qty)) input.value = qty;
  updateCardPricing(card);
}

function bindEvents(root) {
  const searchInput = root.querySelector('#catalog-search-input');
  const clearBtn = root.querySelector('#catalog-search-clear');

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    clearBtn.hidden = searchInput.value === '';
    renderGrid(root);
    refreshAllCards(root);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    clearBtn.hidden = true;
    renderGrid(root);
    refreshAllCards(root);
    searchInput.focus();
  });

  root.querySelector('#catalog-instock').addEventListener('change', e => {
    state.inStockOnly = e.target.checked;
    renderGrid(root);
    refreshAllCards(root);
  });

  root.addEventListener('click', e => {
    const chip = e.target.closest('[data-category]');
    if (chip) {
      state.category = chip.dataset.category;
      renderCategories(root);
      renderGrid(root);
      refreshAllCards(root);
      return;
    }

    const btn = e.target.closest('[data-action="inc"], [data-action="dec"]');
    if (btn) {
      const card = btn.closest('.product-card');
      const product = state.products.find(p => p.id === card.dataset.id);
      const current = getQty(product);
      setQty(card, btn.dataset.action === 'inc' ? current + 1 : Math.max(1, current - 1));
      return;
    }

    const enquire = e.target.closest('[data-role="enquire"]');
    if (enquire && enquire.classList.contains('is-disabled')) {
      e.preventDefault();
    }
  });

  root.addEventListener('input', e => {
    if (e.target.dataset.action === 'qty') {
      const card = e.target.closest('.product-card');
      const val = parseInt(e.target.value, 10);
      if (Number.isFinite(val) && val >= 1) {
        state.qty.set(card.dataset.id, val);
        updateCardPricing(card);
      }
    }
  });

  root.addEventListener('change', e => {
    if (e.target.dataset.action === 'qty') {
      setQty(e.target.closest('.product-card'), e.target.value);
    }
  });

  refreshAllCards(root);
}
