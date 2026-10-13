/**
 * Shipping Calculator — standalone courier rate check by parcel weight.
 * Does not change the quote. Uses the same courier rates and packaging charge as the quote.
 */

import { getConfig, subscribeConfig } from '../state/configStore.js';
import { getState, subscribe } from '../state/store.js';
import { calculateAllShipping } from '../modules/deliveryEngine.js';

const PRESETS = [0.5, 1, 2, 5, 10];
let mount = null;
let weight = 1;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function init(container) {
  if (!container) return;
  mount = container;
  render();
  mount.addEventListener('input', e => {
    if (e.target.id === 'sc-weight') {
      weight = Math.max(0, Number(e.target.value) || 0);
      refreshResults();
      syncChips();
    }
  });
  mount.addEventListener('click', e => {
    const b = e.target.closest('[data-sc]');
    if (!b) return;
    if (b.dataset.sc === 'preset') setWeight(Number(b.dataset.value));
    if (b.dataset.sc === 'quote') setWeight(Number(getState().countedWeight) || 0);
  });
  subscribeConfig(() => refreshResults());
  subscribe(() => refreshQuoteButton());
}

function setWeight(w) {
  weight = w;
  const input = mount.querySelector('#sc-weight');
  if (input) input.value = String(w);
  refreshResults();
  syncChips();
}

function render() {
  mount.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <rect x="4" y="2" width="16" height="20" rx="2"></rect>
            <line x1="8" y1="6" x2="16" y2="6"></line>
            <line x1="8" y1="11" x2="8" y2="11.01"></line><line x1="12" y1="11" x2="12" y2="11.01"></line><line x1="16" y1="11" x2="16" y2="11.01"></line>
            <line x1="8" y1="15" x2="8" y2="15.01"></line><line x1="12" y1="15" x2="12" y2="15.01"></line><line x1="16" y1="15" x2="16" y2="15.01"></line>
          </svg>
          Shipping Calculator
        </h2>
      </div>
      <div class="card-body">
        <div class="field-group">
          <label class="field-label" for="sc-weight">PARCEL WEIGHT (KG)</label>
          <input type="number" class="input-field" id="sc-weight" min="0" step="0.05" value="${weight}" />
        </div>
        <div class="chip-group sc-chips" style="margin-top: var(--space-md);">
          ${PRESETS.map(w => `<button type="button" class="chip" data-sc="preset" data-value="${w}">${w} kg</button>`).join('')}
          <button type="button" class="chip" data-sc="quote" id="sc-from-quote">Use quote weight</button>
        </div>
        <div id="sc-results" class="sc-results"></div>
        <div class="sc-note">Estimate only. Includes the standard packaging charge. Final charges may vary after packing.</div>
      </div>
    </div>`;
  refreshResults();
  syncChips();
  refreshQuoteButton();
}

function syncChips() {
  mount.querySelectorAll('[data-sc="preset"]').forEach(b => b.classList.toggle('active', Number(b.dataset.value) === weight));
}

function refreshQuoteButton() {
  const b = mount && mount.querySelector('#sc-from-quote');
  if (!b) return;
  const w = Number(getState().countedWeight) || 0;
  b.hidden = !(w > 0);
  if (w > 0) b.textContent = `Use quote weight (${w} kg)`;
}

function refreshResults() {
  const box = mount && mount.querySelector('#sc-results');
  if (!box) return;
  if (!(weight > 0)) {
    box.innerHTML = '<div class="sc-empty">Enter a parcel weight to see courier charges.</div>';
    return;
  }
  const config = getConfig();
  const pack = (config.pricing && config.pricing.PACKAGING_COST) || 0;
  const rows = calculateAllShipping(0, 1, 'cheapest', weight, config);
  if (!rows.length) {
    box.innerHTML = '<div class="sc-empty">No courier supports this weight. Maximum supported is 20 kg.</div>';
    return;
  }
  const cheapest = Math.min(...rows.map(r => r.shippingCost));
  const fastest = Math.min(...rows.map(r => parseInt(r.eta) || 99));
  box.innerHTML = `
    <div class="sc-table" role="table" aria-label="Courier charges">
      <div class="sc-row sc-head" role="row"><span>Courier</span><span>ETA</span><span>Shipping</span><span>Total</span></div>
      ${rows.map(r => `
        <div class="sc-row" role="row">
          <span class="sc-name">${esc(r.partnerName)}
            ${r.shippingCost === cheapest ? '<em class="sc-badge sc-cheap">Cheapest</em>' : ''}
            ${(parseInt(r.eta) || 99) === fastest ? '<em class="sc-badge sc-fast">Fastest</em>' : ''}
          </span>
          <span>${esc(r.eta)}</span>
          <span>₹${Math.ceil(r.shippingCost)}</span>
          <span class="sc-total">₹${Math.ceil(r.shippingCost + pack)}</span>
        </div>`).join('')}
    </div>
    <div class="sc-meta">Counted weight ${weight} kg · packaging ₹${pack} included in Total</div>`;
}
