/**
 * Dropship Panel — product selector for the "Dropship" print technology.
 * Lives inside the one-page Pricing Engine (mounted in #dropship-mount) and
 * feeds the same cart → Decision & Calculation → Client Quote flow.
 */

import { getState, subscribe } from '../state/store.js';
import { updateDropship, addToCart } from '../controller/appController.js';
import {
  baseRate, ADDONS, isApparel, placementsFor, groupedProducts, rateBreakdown, unitRate, lineTotal,
} from '../modules/dropshipEngine.js';
import {
  DIGITAL_MATERIALS, PREMIUM_FINISHES, LAMINATIONS, GST_MODES, LAMINATION_MOQ, DIE_CUT_RATE, FILE_SETTING_RATE,
  DIGITAL_SHEET_LABEL, findMaterial, materialRateLabel, normalizeDigital, calcDigital,
} from '../modules/digitalEngine.js';

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
  // The ERP sync changed the product list / rates → rebuild the dropdown
  document.addEventListener('erp-catalog-changed', () => { lastShape = ''; render(current(getState())); });
  subscribe(state => {
    // Rebuild only when the structure changes (product / selections); keep typing focus otherwise.
    const d = current(state);
    const shape = shapeOf(state, d);
    if (shape !== lastShape) render(d);
    else refreshSummary(d);
    syncAuto(state);
  });
}

// Rebuild the panel only when a structural choice changes (not while typing sheets / weight).
const shapeOf = (state, d) => JSON.stringify([state.printTechnology, { ...d, qty: 0, weight: 0 }, state.cart ? state.cart.length : 0, (state.autoSheets || d.qty) >= LAMINATION_MOQ]);

const isDigital = () => getState().printTechnology === 'digital';
const current = state => (state.printTechnology === 'digital' ? state.digital : state.dropship);

function render(d) {
  const hadFocus = mount.contains(document.activeElement) ? document.activeElement.id : null;
  lastShape = shapeOf(getState(), d);
  const apparel = isApparel(d.variant);

  const digital = isDigital();
  const groups = digital ? [] : groupedProducts();
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
          ${digital ? 'Digital Printing' : 'Dropship Product'}
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
        ${digital ? digitalExtras(d) : placementRows}
        <div class="ds-summary" id="ds-summary"></div>
        <button type="button" class="btn btn-primary" data-ds="add" id="ds-add" style="width: 100%; margin-top: var(--space-lg); font-weight: 600;">+ Add to Quote</button>
      </div>
    </div>`;
  refreshSummary(d);
  syncAuto(getState());
  if (hadFocus) { const el = mount.querySelector('#' + hadFocus); if (el) el.focus(); }
}

function digitalSpecs(d) {
  const m = findMaterial(d.material);
  const groups = ['Paper', 'NT', 'Stickers'].map(g => `<optgroup label="${g === 'Stickers' ? 'Stickers (die-cut included)' : g}">${
    DIGITAL_MATERIALS.filter(x => x.group === g).map(x =>
      `<option value="${esc(x.key)}" ${x.key === m.key ? 'selected' : ''}>${esc(x.key)} — ${materialRateLabel(x)}</option>`).join('')}</optgroup>`).join('');
  return `
    <div style="flex: 1 1 60%; min-width: 200px;">
      <label class="field-label">MATERIAL <span class="ds-sub">(₹ per sheet: single / double)</span></label>
      <select class="input-field" data-ds="spec" data-key="material" id="ds-spec-material">${groups}</select>
    </div>
    <div style="flex: 1 1 30%; min-width: 140px;">
      <label class="field-label">PRINT SIDES</label>
      <select class="input-field" data-ds="spec" data-key="sides" id="ds-spec-sides">
        <option value="Single side" ${d.sides === 'Single side' ? 'selected' : ''}>Single side</option>
        <option value="Double side" ${d.sides === 'Double side' ? 'selected' : ''} ${m.double == null ? 'disabled' : ''}>Double side${m.double == null ? ' (not for stickers)' : ''}</option>
      </select>
    </div>
    <div style="flex: 1 1 30%; min-width: 120px;">
      <label class="field-label">SHEET SIZE</label>
      <input type="text" class="input-field" value="${esc(DIGITAL_SHEET_LABEL)}" disabled id="ds-sheet-size" />
    </div>`;
}

function digitalExtras(d) {
  const m = findMaterial(d.material);
  const premiumOn = d.premium !== 'None';
  const sheets = (getState().autoSheets || d.qty);
  const premiumBlock = m.premium ? `
    <div class="ds-block">
      <label class="field-label">PREMIUM FINISH <span class="ds-sub">(one only — ₹${m.premium} / sheet, includes die-cut &amp; file setting)</span></label>
      <div class="chip-group">
        <button type="button" class="chip ${!premiumOn ? 'active' : ''}" data-ds="premium" data-value="None">None</button>
        ${PREMIUM_FINISHES.map(f => `<button type="button" class="chip ${d.premium === f ? 'active' : ''}" data-ds="premium" data-value="${esc(f)}">${esc(f)}</button>`).join('')}
      </div>
    </div>` : '';
  return `
    ${premiumBlock}
    <div class="ds-row" style="margin-top: var(--space-lg);">
      <div style="flex: 1 1 45%; min-width: 160px;">
        <label class="field-label">LAMINATION <span class="ds-sub">(per side, per sheet)</span></label>
        <select class="input-field" data-ds="spec" data-key="lamination" id="ds-spec-lamination">
          ${LAMINATIONS.map(l => `<option value="${l}" ${d.lamination === l ? 'selected' : ''} ${l === 'Velvet' && sheets < LAMINATION_MOQ ? 'disabled' : ''}>${
            l === 'None' ? 'No lamination' : l === 'Velvet' ? `Velvet (${LAMINATION_MOQ}+ sheets only)` : l}</option>`).join('')}
        </select>
      </div>
      <div style="flex: 1 1 45%; min-width: 160px;">
        <label class="field-label">GST / TAX</label>
        <select class="input-field" data-ds="spec" data-key="gst" id="ds-spec-gst">
          ${GST_MODES.map(g => `<option value="${g.v}" ${d.gst === g.v ? 'selected' : ''}>${esc(g.t)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="ds-block">
      <label class="field-label">FINISHING</label>
      <div class="chip-group">
        <label class="chip ${d.dieCut ? 'active' : ''}" style="cursor: ${m.sticker ? 'default' : 'pointer'};">
          <input type="checkbox" data-ds="flag" data-key="dieCut" id="ds-flag-dieCut" ${d.dieCut ? 'checked' : ''} ${m.sticker ? 'disabled' : ''} style="display:none;" />
          Plotter die-cut ${premiumOn ? '(included)' : '(+₹' + DIE_CUT_RATE + ' / sheet' + (m.sticker ? ', compulsory' : '') + ')'}
        </label>
        <label class="chip ${d.fileSetting ? 'active' : ''}" style="cursor: ${d.dieCut ? 'default' : 'pointer'};">
          <input type="checkbox" data-ds="flag" data-key="fileSetting" id="ds-flag-fileSetting" ${d.fileSetting ? 'checked' : ''} ${d.dieCut ? 'disabled' : ''} style="display:none;" />
          File setting ${premiumOn ? '(included)' : '(+₹' + FILE_SETTING_RATE + ' / order' + (d.dieCut ? ', auto with die-cut' : '') + ')'}
        </label>
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
  const st = getState();
  const eff = st.printTechnology === 'digital' && st.autoSheets ? st.autoSheets : d.qty;
  if (isDigital()) {
    const r = calcDigital(d, eff);
    if (!r.valid) {
      box.innerHTML = `<div class="ds-line" style="color:#dc2626;"><span>⚠ ${esc(r.error)}</span></div>`;
      return;
    }
    const money = n => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    box.innerHTML = `
      ${r.lines.map(l => `<div class="ds-line"><span>${esc(l.label)}</span><span>${l.amount ? '₹' + money(l.amount) : esc(l.note || 'Included')}</span></div>`).join('')}
      <div class="ds-line ds-rate"><span>Subtotal (${r.sheets} sheet${r.sheets > 1 ? 's' : ''})</span><span>₹${money(r.subtotal)}</span></div>
      ${r.gstMode === 'add' ? `<div class="ds-line"><span>GST 18% (added)</span><span>₹${money(r.gstAdd)}</span></div>` : ''}
      ${r.gstMode === 'inclusive' ? `<div class="ds-line"><span>GST 18% included (base ₹${money(r.gstBase)})</span><span>₹${money(r.gstIncluded)}</span></div>` : ''}
      <div class="ds-line ds-total"><span>${r.gstMode === 'add' ? 'Total with GST' : 'Total'} <span class="ds-sub">(shipping extra)</span></span><span>₹${money(r.totalExShipping)}</span></div>`;
    return;
  }
  const rows = rateBreakdown(d.variant, d.placements, d.addons, 0);
  const { qty, rate, total } = lineTotal(d.variant, eff, d.placements, d.addons, 0);
  box.innerHTML = `
    ${rows.map(r => `<div class="ds-line"><span>${esc(r.label)}</span><span>${r.amount ? '₹' + r.amount : 'FREE'}</span></div>`).join('')}
    <div class="ds-line ds-rate"><span>Rate per piece</span><span>₹${unitRate(d.variant, d.placements, d.addons, 0)}</span></div>
    <div class="ds-line ds-total"><span>${qty} pc × ₹${rate}</span><span>₹${total}</span></div>`;
}

function onChange(e) {
  const t = e.target.closest('[data-ds]');
  if (!t) return;
  const d = current(getState());
  if (t.dataset.ds === 'flag') {
    updateDropship({ [t.dataset.key]: t.checked });
  } else if (t.dataset.ds === 'spec') {
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
  if (t.dataset.ds === 'premium') {
    // Gold Foil OR Spot UV — one at a time; None clears it
    updateDropship({ premium: t.dataset.value });
  } else if (t.dataset.ds === 'addon') {
    const v = t.dataset.value;
    const has = (d.addons || []).includes(v);
    updateDropship({ addons: has ? d.addons.filter(a => a !== v) : [...d.addons, v] });
  } else if (t.dataset.ds === 'add') {
    addToCart();
  }
}
