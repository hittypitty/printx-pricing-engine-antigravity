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
import { isDbConfigured, fetchProducts } from './db.js';

const WHATSAPP_NUMBER = getConfig().branding.whatsappNumber || '917869581020';

const WA_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.03c-.25.69-1.44 1.32-1.98 1.37-.51.05-.98.24-3.3-.69-2.79-1.1-4.56-3.95-4.7-4.13-.14-.18-1.12-1.49-1.12-2.85 0-1.35.71-2.02.96-2.29.25-.28.55-.35.73-.35h.53c.17 0 .4-.06.62.48.25.6.83 2.06.9 2.21.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.03 1.12 1 2.07 1.31 2.36 1.46.29.15.46.12.63-.07.17-.19.73-.85.92-1.15.19-.29.39-.24.65-.15.27.1 1.7.8 1.99.95.29.15.48.22.55.34.07.13.07.71-.18 1.4z"/></svg>`;

function waLink(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

const state = {
  products: [],
  query: '',
  category: 'All',
  inStockOnly: false,
  qty: new Map(), // productId -> selected quantity
};

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', async () => {
  initHeader(document.getElementById('app-header'));
  const root = document.getElementById('catalog-root');

  if (isDbConfigured()) {
    root.innerHTML = '<div class="card"><div class="card-body text-muted">Loading products…</div></div>';
    try {
      // Only products marked "Show on catalog"
      state.products = (await fetchProducts()).filter(p => p.isActive);
    } catch (err) {
      root.innerHTML = `
        <div class="card catalog-empty"><div class="card-body">
          <div class="catalog-empty-title">Could not load products</div>
          <div class="text-muted">${escapeHtml(err.message)}</div>
        </div></div>`;
      return;
    }
  } else {
    state.products = loadProducts();
  }

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

    <a class="wa-fab" href="${waLink('Hi Bazarville, I have an enquiry about your products. Please share details.')}" target="_blank" rel="noopener" aria-label="Enquire on WhatsApp">
      ${WA_ICON}<span>Enquire on WhatsApp</span>
    </a>
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
          <div class="text-muted">Try a different search term or category — or ask us, we may still have it.</div>
          <a class="btn btn-whatsapp catalog-empty-wa" target="_blank" rel="noopener"
             href="${waLink(state.query.trim()
               ? `Hi Bazarville, I'm looking for "${state.query.trim()}". Do you have it? Please share price and availability.`
               : 'Hi Bazarville, I am looking for a product that is not in your catalog. Please help.')}">
            ${WA_ICON} Ask on WhatsApp
          </a>
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
            <button type="button" class="btn-spin" data-action="dec" aria-label="Decrease quantity">-</button>
            <input type="number" class="input-field" id="qty-${escapeHtml(product.id)}" min="1" value="${qty}" data-action="qty" />
            <button type="button" class="btn-spin" data-action="inc" aria-label="Increase quantity">+</button>
          </div>
          <div class="product-estimate" data-role="estimate"></div>
        </div>

        <a class="btn btn-whatsapp product-enquire ${isOut ? 'is-out' : ''}" data-role="enquire" target="_blank" rel="noopener">
          ${WA_ICON}<span>${isOut ? 'Ask availability on WhatsApp' : 'Enquire on WhatsApp'}</span>
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
    estimate.innerHTML = '<span class="estimate-warning">Currently out of stock — ask us for the next availability</span>';
    enquire.href = waLink(
      `Hi Bazarville, I'm interested in *${product.title}* (Qty: ${qty} ${product.unit}).\n` +
      'It shows Out of Stock on your catalog — when will it be available?'
    );
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

  const lines = [`Hi Bazarville, I'm interested in *${product.title}*.`, `Quantity: ${qty} ${product.unit}`];
  if (tier) lines.push(`Price: ${formatINR(tier.price)}/${product.unit} (Total ${formatINR(tier.price * qty)})`);
  else lines.push('Please share the price.');
  if (overStock) lines.push(`(Catalog shows only ${product.stock} ${product.unit} in stock)`);
  lines.push('Please confirm availability.');
  enquire.href = waLink(lines.join('\n'));
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
