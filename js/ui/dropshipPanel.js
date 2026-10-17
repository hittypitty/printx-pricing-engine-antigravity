/**
 * Dropship Panel — product selector for the "Dropship" print technology.
 * Lives inside the one-page Pricing Engine (mounted in #dropship-mount) and
 * feeds the same cart → Decision & Calculation → Client Quote flow.
 */

import { getState, subscribe } from '../state/store.js';
import { updateDropship, addToCart } from '../controller/appController.js';
import {
  baseRate, DIGITAL_RATES, DIGITAL_OPTIONS, DIGITAL_ADDONS, DIGITAL_DEFAULTS, digitalExtra, ADDONS, isApparel, placementsFor, groupedProducts, rateBreakdown, unitRate, lineTotal,
} from '../modules/dropshipEngine.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let mount = null;
let lastShape = '';

export function init(container) {
  if (!container) return;
  mount = container;
  render(current(getState()));
  mount.addEventListener('change', onChange);
  mount.addEventListener('input', onInput);
  mount.addEventListener('click', onClick);
  subscribe(state => {
    // Rebuild only when the structure changes (product / selections); keep typing focus otherwise.
    const d = current(state);
    const shape = JSON.stringify([state.printTechnology, d.variant, d.placements, d.addons, d.sheetSize, d.lamination, d.gsm, d.sides, d.sticker, state.cart ? state.cart.length : 0]);
    if (shape !== lastShape) render(d);
    else refreshSummary(d);
    syncAuto(state);
  });
}

const isDigital = () => getState().printTechnology === 'digital';
const current = state => (state.printTechnology === 'digital' ? state.digital : state.dropship);

function render(d) {
  const hadFocus = mount.contains(document.activeElement) ? document.activeElement.id : null;
  lastShape = JSON.stringify([getState().printTechnology, d.variant, d.placements, d.addons, d.sheetSize, d.lamination, d.gsm, d.sides, d.sticker, (getState().cart || []).length]);
  const apparel = isApparel(d.variant);

  const digital = isDigital();
  const groups = digital ? [{ label: 'Digital Printing (Paper)', items: Object.keys(DIGITAL_RATES) }] : groupedProducts();
  const productOptions = groups.map(g =>
    `<optgroup label="${esc(g.label)}">${g.items.map(n =>
      `<option value="${esc(n)}" ${n === d.variant ? 'selected' : ''}>${esc(n)} — ₹${baseRate(n)}</option>`).join('')}</optgroup>`
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
          ${digital ? 'Digital Printing (Paper)' : 'Dropship Product'}
        </h2>
      </div>
      <div class="card-body">
        <div class="ds-row">
          ${digital ? digitalSpecs(d) : `<div style="flex: 1 1 100%;">
            <label class="field-label">PRODUCT</label>
            <select class="input-field" data-ds="variant" id="ds-variant">${productOptions}</select>
          </div>`}
          <div style="flex: 1; min-width: 120px;">
            <label class="field-label">${digital ? 'SHEETS' : 'QUANTITY'}</label>
            <input type="number" class="input-field" min="1" step="1" value="${esc(d.qty)}" data-ds="qty" id="ds-qty" />
            <div class="ds-auto-hint" id="ds-auto-hint" hidden></div>
          </div>
          <div style="flex: 1; min-width: 110px;">
            <label class="field-label">PARCEL WT (KG)</label>
            <input type="number" class="input-field" min="0" step="0.05" value="${esc(d.weight)}" data-ds="weight" id="ds-weight" />
          </div>
        </div>
        ${digital ? digitalAddons(d) : placementRows}
        <div class="ds-summary" id="ds-summary"></div>
        <button type="button" class="btn btn-primary" data-ds="add" id="ds-add" style="width: 100%; margin-top: var(--space-lg); font-weight: 600;">+ Add to Quote</button>
      </div>
    </div>`;
  refreshSummary(d);
  syncAuto(getState());
  if (hadFocus) { const el = mount.querySelector('#' + hadFocus); if (el) el.focus(); }
}

function digitalSpecs(d) {
  return Object.entries(DIGITAL_OPTIONS).map(([key, o]) => `
    <div style="flex: 1 1 45%; min-width: 150px;">
      <label class="field-label">${o.label}</label>
      <select class="input-field" data-ds="spec" data-key="${key}" id="ds-spec-${key}">
        ${o.choices.map(c => `<option value="${esc(c.v)}" ${(d[key] ?? DIGITAL_DEFAULTS[key]) === c.v ? 'selected' : ''}>${esc(c.t)}${c.extra ? ' (+₹' + c.extra + ')' : ''}</option>`).join('')}
      </select>
    </div>`).join('');
}

function digitalAddons(d) {
  return `<div class="ds-block">
      <label class="field-label">ADD-ON</label>
      <div class="chip-group">
        ${DIGITAL_ADDONS.map(a => `<button type="button" class="chip ${(d.addons || []).includes(a.value) ? 'active' : ''}" data-ds="addon" data-value="${esc(a.value)}">${esc(a.value)}${a.extra ? ' (+₹' + a.extra + ')' : ''}</button>`).join('')}
      </div>
    </div>`;
}

// Digital: when designs are entered, the sheet count comes from them (read-only).
function syncAuto(state) {
  if (!mount) return;
  const input = mount.querySelector('#ds-qty');
  const hint = mount.querySelector('#ds-auto-hint');
  if (!input) return;
  const auto = state.printTechnology === 'digital' && state.autoSheets ? state.autoSheets : null;
  input.disabled = !!auto;
  if (auto) input.value = String(auto);
  else if (document.activeElement !== input) input.value = String(current(state).qty);
  if (hint) {
    hint.hidden = !auto;
    if (auto) hint.textContent = `Auto from ${state.autoDesigns} design${state.autoDesigns === 1 ? '' : 's'}. Clear designs to type sheets yourself.`;
  }
}

function refreshSummary(d) {
  const box = mount && mount.querySelector('#ds-summary');
  if (!box) return;
  const extra = isDigital() ? digitalExtra(d) : 0;
  const rows = rateBreakdown(d.variant, d.placements, d.addons, extra);
  const st = getState();
  const eff = st.printTechnology === 'digital' && st.autoSheets ? st.autoSheets : d.qty;
  const { qty, rate, total } = lineTotal(d.variant, eff, d.placements, d.addons, extra);
  box.innerHTML = `
    ${rows.map(r => `<div class="ds-line"><span>${esc(r.label)}</span><span>${r.amount ? '₹' + r.amount : 'FREE'}</span></div>`).join('')}
    <div class="ds-line ds-rate"><span>Rate per piece</span><span>₹${unitRate(d.variant, d.placements, d.addons, extra)}</span></div>
    <div class="ds-line ds-total"><span>${qty} pc × ₹${rate}</span><span>₹${total}</span></div>`;
}

function onChange(e) {
  const t = e.target.closest('[data-ds]');
  if (!t) return;
  const d = current(getState());
  if (t.dataset.ds === 'spec') {
    updateDropship({ [t.dataset.key]: t.value });
  } else if (t.dataset.ds === 'variant') {
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
  const d = current(getState());
  if (t.dataset.ds === 'addon') {
    const v = t.dataset.value;
    updateDropship({ addons: d.addons.includes(v) ? d.addons.filter(a => a !== v) : [...d.addons, v] });
  } else if (t.dataset.ds === 'add') {
    addToCart();
  }
}
