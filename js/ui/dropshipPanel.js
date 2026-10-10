/**
 * Dropship Panel — product selector for the "Dropship" print technology.
 * Lives inside the one-page Pricing Engine (mounted in #dropship-mount) and
 * feeds the same cart → Decision & Calculation → Client Quote flow.
 */

import { getState, subscribe } from '../state/store.js';
import { updateDropship, addToCart } from '../controller/appController.js';
import {
  DROPSHIP_RATES, ADDONS, isApparel, placementsFor, groupedProducts, rateBreakdown, unitRate, lineTotal,
} from '../modules/dropshipEngine.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let mount = null;
let lastShape = '';

export function init(container) {
  if (!container) return;
  mount = container;
  render(getState().dropship);
  mount.addEventListener('change', onChange);
  mount.addEventListener('input', onInput);
  mount.addEventListener('click', onClick);
  subscribe(state => {
    // Rebuild only when the structure changes (product / selections); keep typing focus otherwise.
    const d = state.dropship;
    const shape = JSON.stringify([d.variant, d.placements, d.addons, state.cart ? state.cart.length : 0]);
    if (shape !== lastShape) render(d);
    else refreshSummary(d);
  });
}

function render(d) {
  const hadFocus = mount.contains(document.activeElement) ? document.activeElement.id : null;
  lastShape = JSON.stringify([d.variant, d.placements, d.addons, (getState().cart || []).length]);
  const apparel = isApparel(d.variant);

  const productOptions = groupedProducts().map(g =>
    `<optgroup label="${esc(g.label)}">${g.items.map(n =>
      `<option value="${esc(n)}" ${n === d.variant ? 'selected' : ''}>${esc(n)} — ₹${DROPSHIP_RATES[n]}</option>`).join('')}</optgroup>`
  ).join('');

  const placementRows = apparel ? `
    <div class="ds-block">
      <label class="field-label">PRINT PLACEMENTS</label>
      <div class="ds-grid">
        ${placementsFor(d.variant).map(p => `
          <div>
            <div class="ds-sub">${esc(p.key)}</div>
            <select class="input-field" data-ds="placement" data-key="${esc(p.key)}" id="ds-pl-${esc(p.key.replace(/\s+/g, '-'))}">
              <option value="">None</option>
              ${p.sizes.map(sz => `<option value="${esc(sz)}" ${d.placements[p.key] === sz ? 'selected' : ''}>${esc(sz)}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>
    </div>
    <div class="ds-block">
      <label class="field-label">ADD-ONS</label>
      <div class="chip-group">
        ${ADDONS.map(a => `<button type="button" class="chip ${d.addons.includes(a.value) ? 'active' : ''}" data-ds="addon" data-value="${esc(a.value)}">${esc(a.label)}</button>`).join('')}
      </div>
    </div>` : '';

  mount.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
          Dropship Product
        </h2>
      </div>
      <div class="card-body">
        <div class="ds-row">
          <div style="flex: 1 1 100%;">
            <label class="field-label">PRODUCT</label>
            <select class="input-field" data-ds="variant" id="ds-variant">${productOptions}</select>
          </div>
          <div style="flex: 1; min-width: 120px;">
            <label class="field-label">QUANTITY</label>
            <input type="number" class="input-field" min="1" step="1" value="${esc(d.qty)}" data-ds="qty" id="ds-qty" />
          </div>
          <div style="flex: 1; min-width: 110px;">
            <label class="field-label">PARCEL WT (KG)</label>
            <input type="number" class="input-field" min="0" step="0.05" value="${esc(d.weight)}" data-ds="weight" id="ds-weight" />
          </div>
        </div>
        ${placementRows}
        <div class="ds-summary" id="ds-summary"></div>
        <button type="button" class="btn btn-primary" data-ds="add" id="ds-add" style="width: 100%; margin-top: var(--space-lg); font-weight: 600;">+ Add to Quote</button>
      </div>
    </div>`;
  refreshSummary(d);
  if (hadFocus) { const el = mount.querySelector('#' + hadFocus); if (el) el.focus(); }
}

function refreshSummary(d) {
  const box = mount && mount.querySelector('#ds-summary');
  if (!box) return;
  const rows = rateBreakdown(d.variant, d.placements, d.addons);
  const { qty, rate, total } = lineTotal(d.variant, d.qty, d.placements, d.addons);
  box.innerHTML = `
    ${rows.map(r => `<div class="ds-line"><span>${esc(r.label)}</span><span>${r.amount ? '₹' + r.amount : 'FREE'}</span></div>`).join('')}
    <div class="ds-line ds-rate"><span>Rate per piece</span><span>₹${unitRate(d.variant, d.placements, d.addons)}</span></div>
    <div class="ds-line ds-total"><span>${qty} pc × ₹${rate}</span><span>₹${total}</span></div>`;
}

function onChange(e) {
  const t = e.target.closest('[data-ds]');
  if (!t) return;
  const d = getState().dropship;
  if (t.dataset.ds === 'variant') {
    updateDropship({ variant: t.value, placements: {}, addons: [] });
  } else if (t.dataset.ds === 'placement') {
    const placements = { ...d.placements };
    if (t.value) placements[t.dataset.key] = t.value; else delete placements[t.dataset.key];
    updateDropship({ placements });
  }
}

function onInput(e) {
  const t = e.target.closest('[data-ds]');
  if (!t) return;
  if (t.dataset.ds === 'qty') updateDropship({ qty: Math.max(1, Math.floor(Number(t.value) || 1)) });
  else if (t.dataset.ds === 'weight') updateDropship({ weight: Math.max(0, Number(t.value) || 0) });
}

function onClick(e) {
  const t = e.target.closest('[data-ds]');
  if (!t) return;
  const d = getState().dropship;
  if (t.dataset.ds === 'addon') {
    const v = t.dataset.value;
    updateDropship({ addons: d.addons.includes(v) ? d.addons.filter(a => a !== v) : [...d.addons, v] });
  } else if (t.dataset.ds === 'add') {
    addToCart();
  }
}
