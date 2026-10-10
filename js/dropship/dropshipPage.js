/**
 * Dropship Calculator page — pick product + qty + print placements → rate, total, WhatsApp quote.
 */

import { init as initHeader } from '../ui/header.js';
import {
  DROPSHIP_RATES, SIZE_RATE, ADDONS, isApparel, placementsFor, unitRate, lineTotal,
} from './dropshipRates.js';

const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));


function describe(line) {
  const parts = Object.entries(line.placements).map(([k, s]) => `${k}: ${s}`);
  line.addons.forEach(a => parts.push(a));
  return parts.length ? ` (${parts.join(', ')})` : '';
}

const ICON = {
  box: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
  print: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
  truck: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>',
  cart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>',
  calc: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
  msg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f7a21b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
};

const card = (icon, title, body, extraId = '') => `
  <div class="card" ${extraId ? `id="${extraId}"` : ''}>
    <div class="card-header"><h2 class="card-title">${icon}${title}</h2></div>
    <div class="card-body">${body}</div>
  </div>`;

const state = {
  placements: {}, addons: new Set(), lines: [],
  qty: 1, delivery: 'pickup', shipping: 0,
};
const TRANSPORT_CHARGE = 50; // same as the Pricing Engine's local transport

document.addEventListener('DOMContentLoaded', () => {
  initHeader(document.getElementById('app-header'));
  const inputs = document.getElementById('ds-inputs');
  const outputs = document.getElementById('ds-outputs');
  let variant = Object.keys(DROPSHIP_RATES)[0];

  inputs.innerHTML =
    card(ICON.box, 'Dropship Product', `
      <div class="field-group">
        <label class="field-label">PRODUCT</label>
        <select class="input-field" id="ds-product">
          ${Object.keys(DROPSHIP_RATES).map(k => `<option value="${esc(k)}">${esc(k)} — ₹${DROPSHIP_RATES[k]}</option>`).join('')}
        </select>
      </div>
      <div class="input-row" style="margin-bottom:0">
        <div class="input-col">
          <label class="field-label">BASE RATE (₹ / PC)</label>
          <input type="text" class="input-field input-fixed" id="ds-base" disabled />
        </div>
        <div class="input-col">
          <label class="field-label">QUANTITY (PIECES)</label>
          <div class="number-input-group">
            <button class="btn-spin" id="ds-dec">-</button>
            <input type="number" class="input-field" min="1" value="1" id="ds-qty" />
            <button class="btn-spin" id="ds-inc">+</button>
          </div>
        </div>
      </div>`) +
    `<div id="ds-print-card">` +
    card(ICON.print, 'Print Details', `
      <label class="field-label">PRINT PLACEMENTS</label>
      <div id="ds-placements"></div>
      <div style="height:1px;background:var(--border-color);margin:var(--space-xl) 0;"></div>
      <label class="field-label">SPECIAL ADD-ONS</label>
      <div class="ds-chips" id="ds-addons"></div>`) +
    `</div>` +
    card(ICON.truck, 'Delivery Details', `
      <div class="field-group" style="margin-bottom:0">
        <label class="field-label">DELIVERY METHOD</label>
        <div class="btn-group" id="ds-delivery">
          <button class="btn btn-select active" data-value="pickup">🏢 Office Pickup</button>
          <button class="btn btn-select" data-value="transport">🚚 Local Transport</button>
          <button class="btn btn-select" data-value="courier">📦 Courier</button>
        </div>
      </div>
      <div id="ds-courier-box" style="display:none;margin-top:var(--space-xl)">
        <label class="field-label">COURIER CHARGE (₹)</label>
        <input type="number" class="input-field" min="0" value="0" id="ds-shipping" />
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px">Courier ka charge Pricing Engine page se nikaal ke yahan daalo.</div>
      </div>`) +
    `<div class="card"><div class="card-body">
      <div class="ds-rate-box" id="ds-preview" style="margin-top:0"></div>
      <button class="btn btn-primary" id="ds-add" style="width:100%;margin-top:var(--space-lg);font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Add to Quote
      </button>
    </div></div>` +
    `<div class="card" id="ds-cart-card" style="display:none">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h2 class="card-title">${ICON.cart}Quote Items</h2>
        <button class="ds-remove" id="ds-clear">✕ Clear All</button>
      </div>
      <div class="card-body" style="padding-top:0"><div id="ds-items" style="display:flex;flex-direction:column;gap:12px;margin-top:12px;"></div></div>
    </div>`;

  outputs.innerHTML =
    card(ICON.calc, 'Decision &amp; Calculation', `
      <div class="kpi-grid" style="grid-template-columns: 1.2fr 0.9fr 0.9fr;">
        <div class="kpi-block"><div class="kpi-label">Pieces</div><div class="kpi-value" id="k-qty">0 pcs</div><div class="kpi-sub" id="k-lines">0 items</div></div>
        <div class="kpi-block"><div class="kpi-label">Product Cost</div><div class="kpi-value" id="k-products" style="color: var(--accent-purple);">₹0</div><div class="kpi-sub">Dropship rates</div></div>
        <div class="kpi-block kpi-delivery"><div class="kpi-label">Shipping</div><div class="kpi-value" id="k-ship">Free</div><div class="kpi-sub" id="k-ship-sub">Office Pickup</div></div>
      </div>
      <div style="height:1px;background:var(--border-color);margin:var(--space-xl) 0;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;">
        <div class="breakdown-section" style="margin-bottom:0">
          <div class="breakdown-title" style="font-size:15px;color:var(--text-secondary);margin-bottom:12px;font-weight:500;">Cost Breakdown</div>
          <div id="ds-breakdown"></div>
        </div>
        <div class="final-total" style="text-align:right;border-top:none;padding:0;">
          <div class="final-total-label">Final Total</div>
          <div class="final-total-value" id="ds-total">₹0</div>
        </div>
      </div>`) +
    `<div class="card quote-card">
      <div class="card-header quote-header">
        <h2 class="card-title" style="margin-bottom:0;">${ICON.msg}Client Quote Message</h2>
        <div class="quote-actions">
          <button class="btn btn-primary" id="ds-copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy Message
          </button>
        </div>
      </div>
      <div class="card-body">
        <textarea class="input-field quote-textarea" id="ds-quote" rows="12" readonly></textarea>
      </div>
    </div>`;

  const $ = id => document.getElementById(id);
  const productSel = $('ds-product');

  const qtyNow = () => Math.max(1, Math.floor(Number($('ds-qty').value) || 1));

  function updatePreview() {
    const { qty, rate, total } = lineTotal(variant, qtyNow(), state.placements, [...state.addons]);
    $('ds-preview').innerHTML = `Rate: <b>${inr(rate)}</b> / pc × ${qty} = <b>${inr(total)}</b>`;
  }

  function renderOptions() {
    $('ds-base').value = '₹' + (DROPSHIP_RATES[variant] || 0);
    $('ds-print-card').style.display = isApparel(variant) ? 'block' : 'none';
    const box = $('ds-placements');
    box.innerHTML = '';
    placementsFor(variant).forEach(p => {
      const div = document.createElement('div');
      div.className = 'ds-place';
      div.innerHTML = `<div class="ds-place-title">${p.key}</div><div class="ds-chips"></div>`;
      const chips = div.querySelector('.ds-chips');
      const mk = (label, active, onClick) => {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'chip' + (active ? ' active' : '');
        c.textContent = label;
        c.onclick = onClick;
        chips.appendChild(c);
      };
      mk('No print', !state.placements[p.key], () => { delete state.placements[p.key]; renderOptions(); });
      p.sizes.forEach(sz => mk(`${sz} (+₹${SIZE_RATE[sz]})`, state.placements[p.key] === sz, () => { state.placements[p.key] = sz; renderOptions(); }));
      box.appendChild(div);
    });
    const ad = $('ds-addons');
    ad.innerHTML = '';
    ADDONS.forEach(a => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip' + (state.addons.has(a.value) ? ' active' : '');
      c.textContent = a.label;
      c.onclick = () => { state.addons.has(a.value) ? state.addons.delete(a.value) : state.addons.add(a.value); renderOptions(); };
      ad.appendChild(c);
    });
    updatePreview();
  }

  function shippingNow() {
    if (state.delivery === 'transport') return TRANSPORT_CHARGE;
    if (state.delivery === 'courier') return Math.max(0, Number($('ds-shipping').value) || 0);
    return 0;
  }

  function renderQuote() {
    const items = $('ds-items');
    items.innerHTML = '';
    state.lines.forEach((l, i) => {
      const div = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML = `
        <div class="cart-item-details">
          <div class="cart-item-title">${esc(l.variant)}</div>
          <div class="cart-item-sub"><span>${l.qty} pcs × ${inr(l.rate)}</span>${describe(l) ? `<span>${esc(describe(l).trim())}</span>` : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <b>${inr(l.total)}</b>
          <button class="ds-remove" data-i="${i}" title="Remove">✕</button>
        </div>`;
      items.appendChild(div);
    });
    items.querySelectorAll('.ds-remove').forEach(b => { b.onclick = () => { state.lines.splice(Number(b.dataset.i), 1); renderQuote(); }; });
    $('ds-cart-card').style.display = state.lines.length ? 'block' : 'none';

    const products = state.lines.reduce((s, l) => s + l.total, 0);
    const pcs = state.lines.reduce((s, l) => s + l.qty, 0);
    const ship = shippingNow();
    const shipLabel = { pickup: 'Office Pickup', transport: 'Local Transport', courier: 'Courier' }[state.delivery];
    $('k-qty').textContent = `${pcs} pcs`;
    $('k-lines').textContent = `${state.lines.length} item${state.lines.length === 1 ? '' : 's'}`;
    $('k-products').textContent = inr(products);
    $('k-ship').textContent = ship ? inr(ship) : 'Free';
    $('k-ship-sub').textContent = shipLabel;
    $('ds-total').textContent = inr(products + ship);
    $('ds-breakdown').innerHTML = state.lines.length
      ? `<div class="breakdown-badge breakdown-print-badge">Products: ${state.lines.length} item${state.lines.length === 1 ? '' : 's'} = ${inr(products)}</div>` +
        (ship ? `<div class="breakdown-badge breakdown-delivery-badge">Ship: ${shipLabel} ${inr(ship)}</div>` : '')
      : '<div class="ds-empty" style="padding:0;text-align:left">Add products to see the breakdown.</div>';

    if (!state.lines.length) { $('ds-quote').value = ''; return; }
    const lines = state.lines.map((l, i) => `${i + 1}. ${l.variant}${describe(l)}\n   ${l.qty} × ${inr(l.rate)} = ${inr(l.total)}`).join('\n');
    $('ds-quote').value =
      `Hello! 👋\nThank you for reaching out to us.\nHere is the quote for your dropship requirement:\n\n${lines}\n\n` +
      `Products: ${inr(products)}\n` +
      (state.delivery === 'pickup' ? `Delivery: Office Pickup\n` : `Shipping (${shipLabel}): ${inr(ship)}\n`) +
      `*Total: ${inr(products + ship)}*\n\n— PrintX / Bazarville`;
  }

  $('ds-add').onclick = () => {
    const apparel = isApparel(variant);
    const placements = apparel ? { ...state.placements } : {};
    const addons = apparel ? [...state.addons] : [];
    const { qty, rate, total } = lineTotal(variant, qtyNow(), placements, addons);
    state.lines.push({ variant, qty, rate, total, placements, addons });
    renderQuote();
  };
  $('ds-clear').onclick = () => { state.lines = []; renderQuote(); };
  $('ds-copy').onclick = async () => {
    const ta = $('ds-quote');
    if (!ta.value) return;
    const btn = $('ds-copy');
    const original = btn.innerHTML;
    try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand('copy'); }
    btn.innerHTML = '✅ Copied!';
    btn.classList.add('btn-success');
    setTimeout(() => { btn.innerHTML = original; btn.classList.remove('btn-success'); }, 2000);
  };
  productSel.onchange = () => { variant = productSel.value; state.placements = {}; state.addons = new Set(); renderOptions(); };
  $('ds-qty').oninput = updatePreview;
  $('ds-dec').onclick = () => { $('ds-qty').value = Math.max(1, qtyNow() - 1); updatePreview(); };
  $('ds-inc').onclick = () => { $('ds-qty').value = qtyNow() + 1; updatePreview(); };
  $('ds-delivery').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      state.delivery = b.dataset.value;
      $('ds-delivery').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      $('ds-courier-box').style.display = state.delivery === 'courier' ? 'block' : 'none';
      renderQuote();
    };
  });
  $('ds-shipping').oninput = renderQuote;

  renderOptions();
  renderQuote();
});

// re-export for tests / debugging
export { unitRate };
