/**
 * Product Store — BV Web catalog data + pure helpers
 *
 * Data source: PRODUCTS (config) merged with any edits saved from
 * "Manage Products" in localStorage. Swap load/save for a database later.
 */

import { PRODUCTS, LOW_STOCK_THRESHOLD } from '../config/products.js';

const STORAGE_KEY = 'bv_products_v1';

// ---------- Persistence ----------

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function loadProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalizeProduct);
    }
  } catch (e) {
    // Storage blocked / corrupted — fall back to defaults
  }
  return clone(PRODUCTS).map(normalizeProduct);
}

export function saveProducts(products) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    return true;
  } catch (e) {
    return false;
  }
}

export function resetProducts() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
  return clone(PRODUCTS).map(normalizeProduct);
}

export function hasLocalEdits() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return false;
  }
}

// ---------- Normalisation ----------

function toInt(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeTier(t) {
  const maxRaw = t.maxQty;
  return {
    minQty: Math.max(1, toInt(t.minQty, 1)),
    maxQty: maxRaw === null || maxRaw === '' || maxRaw === undefined ? null : toInt(maxRaw, null),
    price: Math.max(0, toNum(t.price, 0)),
  };
}

export function normalizeProduct(p) {
  return {
    id: String(p.id || ''),
    title: String(p.title || '').trim(),
    category: String(p.category || 'General').trim() || 'General',
    image: String(p.image || '').trim(),
    unit: String(p.unit || 'pc').trim() || 'pc',
    stock: Math.max(0, toInt(p.stock, 0)),
    tiers: (Array.isArray(p.tiers) ? p.tiers : [])
      .map(normalizeTier)
      .sort((a, b) => a.minQty - b.minQty),
  };
}

// ---------- Stock ----------

/**
 * Stock status derived ONLY from the actual stock number.
 * @returns {{ key: 'in'|'low'|'out', label: string, detail: string }}
 */
export function getStockStatus(product) {
  const stock = Math.max(0, toInt(product.stock, 0));
  const unit = product.unit || 'pc';
  if (stock <= 0) {
    return { key: 'out', label: 'Out of Stock', detail: 'Currently unavailable' };
  }
  if (stock <= LOW_STOCK_THRESHOLD) {
    return { key: 'low', label: 'Low Stock', detail: `Only ${stock} ${unit} left` };
  }
  return { key: 'in', label: 'In Stock', detail: `${stock} ${unit} available` };
}

// ---------- Price tiers ----------

/**
 * Find the tier that applies to a quantity.
 * Quantities below the first tier use the first tier.
 */
export function getTierForQty(product, qty) {
  const tiers = product.tiers || [];
  if (tiers.length === 0) return null;
  const q = Math.max(1, toInt(qty, 1));
  let match = null;
  for (const t of tiers) {
    const withinMax = t.maxQty === null || q <= t.maxQty;
    if (q >= t.minQty && withinMax) {
      match = t;
      break;
    }
  }
  if (match) return match;
  // Fallbacks: below first tier → first; beyond a closed last tier → last
  return q < tiers[0].minQty ? tiers[0] : tiers[tiers.length - 1];
}

export function getStartingPrice(product) {
  const tiers = product.tiers || [];
  if (tiers.length === 0) return null;
  return Math.min(...tiers.map(t => t.price));
}

export function formatTierRange(t, unit = 'pc') {
  if (t.maxQty === null) return `${t.minQty}+ ${unit}`;
  if (t.minQty === t.maxQty) return `${t.minQty} ${unit}`;
  return `${t.minQty} – ${t.maxQty} ${unit}`;
}

export function formatINR(n) {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * Validate a tier list: ascending, non-overlapping, prices > 0,
 * only the last tier may be open-ended.
 * @returns {string[]} list of human-readable errors (empty = valid)
 */
export function validateTiers(rawTiers) {
  const errors = [];
  if (!rawTiers || rawTiers.length === 0) {
    errors.push('Add at least one price tier.');
    return errors;
  }
  const tiers = rawTiers.map(normalizeTier);
  tiers.forEach((t, i) => {
    const n = i + 1;
    const raw = rawTiers[i];
    if (raw.minQty === '' || raw.minQty === null || raw.minQty === undefined) {
      errors.push(`Tier ${n}: "From qty" is required.`);
    }
    if (raw.price === '' || raw.price === null || raw.price === undefined || t.price <= 0) {
      errors.push(`Tier ${n}: price must be greater than 0.`);
    }
    if (t.maxQty !== null && t.maxQty < t.minQty) {
      errors.push(`Tier ${n}: "To qty" cannot be less than "From qty".`);
    }
    if (t.maxQty === null && i !== tiers.length - 1) {
      errors.push(`Tier ${n}: only the last tier can be open-ended ("and above").`);
    }
    if (i > 0) {
      const prev = tiers[i - 1];
      if (prev.maxQty !== null && t.minQty <= prev.maxQty) {
        errors.push(`Tier ${n}: starts at ${t.minQty} but Tier ${i} ends at ${prev.maxQty} (overlap).`);
      } else if (prev.maxQty !== null && t.minQty !== prev.maxQty + 1) {
        errors.push(`Tier ${n}: should start at ${prev.maxQty + 1} (gap after Tier ${i}).`);
      }
    }
  });
  return errors;
}

// ---------- Misc ----------

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product';
}
