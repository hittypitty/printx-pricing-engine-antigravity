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
let open = false;
const secOpen = { parcel: true, weight: true, courier: true };
const rowOpen = new Set();
let sortBy = 'default';
const lastPct = {};
let dims = { l: 0, b: 0, h: 0 };
const VOL_DIVISOR = 5000;

function volWeight() { return (dims.l * dims.b * dims.h) / VOL_DIVISOR; }
function countedWeight() { return Math.max(weight, volWeight()); }
const fmt = n => String(Math.round(n * 100) / 100);

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function init(container, prefill) {
  if (!container) return;
  mount = container;
  if (prefill) {
    if (prefill.weight) weight = prefill.weight;
    dims = { l: prefill.l || 0, b: prefill.b || 0, h: prefill.h || 0 };
    open = true;
  }
  render();
  mount.addEventListener('input', e => {
    if (e.target.id === 'sc-weight') {
      weight = Math.max(0, Number(e.target.value) || 0);
      refreshResults();
      syncChips();
    }
    const k = { 'sc-l': 'l', 'sc-b': 'b', 'sc-h': 'h' }[e.target.id];
    if (k) {
      dims[k] = Math.max(0, Number(e.target.value) || 0);
      updateCube();
      refreshResults();
    }
  });
  mount.addEventListener('click', e => {
    const b = e.target.closest('[data-sc]');
    if (!b) return;
    if (b.dataset.sc === 'preset') setWeight(Number(b.dataset.value));
    if (b.dataset.sc === 'toggle') {
      open = !open;
      const card = mount.querySelector('.sc-card');
      card.classList.toggle('open', open);
      b.setAttribute('aria-expanded', String(open));
    }
    if (b.dataset.sc === 'step') setWeight(Math.max(0, Math.round((weight + Number(b.dataset.dir) * 0.5) * 100) / 100));
    if (b.dataset.sc === 'sort') { sortBy = b.dataset.value; refreshResults(); }
    if (b.dataset.sc === 'copy') copyRates(b);
    if (b.dataset.sc === 'sec') {
      const k = b.dataset.key;
      secOpen[k] = !secOpen[k];
      b.closest('.sc-acc').classList.toggle('open', secOpen[k]);
      b.setAttribute('aria-expanded', String(secOpen[k]));
    }
    if (b.dataset.sc === 'row') {
      const k = b.dataset.key;
      if (rowOpen.has(k)) rowOpen.delete(k); else rowOpen.add(k);
      b.closest('.sc-crow').classList.toggle('open', rowOpen.has(k));
      b.setAttribute('aria-expanded', String(rowOpen.has(k)));
    }
    if (b.dataset.sc === 'refresh') {
      dims = { l: 0, b: 0, h: 0 };
      updateCube();
      ['sc-l', 'sc-b', 'sc-h'].forEach(id => { const i = mount.querySelector('#' + id); if (i) i.value = ''; });
      setWeight(1);
    }
    if (b.dataset.sc === 'quote') setWeight(Number(getState().countedWeight) || 0);
  });
  subscribeConfig(() => refreshResults());
  subscribe(() => refreshQuoteButton());
}

function acc(key, title, summary, body) {
  const o = secOpen[key];
  return `
    <section class="sc-acc ${o ? 'open' : ''}" data-key="${key}">
      <button type="button" class="sc-acc-head" data-sc="sec" data-key="${key}" aria-expanded="${o}">
        <span class="sc-acc-title">${title}</span>
        <span class="sc-acc-sum">${summary}</span>
        <svg class="sc-acc-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div class="sc-acc-body"><div class="sc-acc-inner">${body}</div></div>
    </section>`;
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
    <div class="card sc-card ${open ? 'open' : ''}">
      <button type="button" class="card-header sc-toggle" data-sc="toggle" aria-expanded="${open}" aria-controls="sc-panel">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <rect x="4" y="2" width="16" height="20" rx="2"></rect>
            <line x1="8" y1="6" x2="16" y2="6"></line>
            <line x1="8" y1="11" x2="8" y2="11.01"></line><line x1="12" y1="11" x2="12" y2="11.01"></line><line x1="16" y1="11" x2="16" y2="11.01"></line>
            <line x1="8" y1="15" x2="8" y2="15.01"></line><line x1="12" y1="15" x2="12" y2="15.01"></line><line x1="16" y1="15" x2="16" y2="15.01"></line>
          </svg>
          Shipping Calculator
        </h2>
        <svg class="sc-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div class="sc-collapse" id="sc-panel"><div class="sc-collapse-inner">
      <div class="card-body">
        <div class="sc-toolbar"><span class="sc-hint">Enter weight and size. The higher of actual and volumetric weight is charged.</span><button type="button" class="chip sc-refresh" data-sc="refresh" title="Clear weight and size">↻ Refresh</button></div>
        ${acc('parcel', 'Parcel details', '<span id="sc-sum-parcel"></span>', `
        <div class="field-group">
          <label class="field-label" for="sc-weight">PARCEL WEIGHT (KG)</label>
          <div class="sc-stepper">
            <button type="button" class="sc-step" data-sc="step" data-dir="-1" aria-label="Decrease weight">−</button>
            <input type="number" class="input-field" id="sc-weight" min="0" step="0.05" value="${weight}" />
            <button type="button" class="sc-step" data-sc="step" data-dir="1" aria-label="Increase weight">+</button>
          </div>
        </div>
        <div class="field-group" style="margin-top: var(--space-md);">
          <label class="field-label">PARCEL SIZE (CM) — optional, for volumetric weight</label>
          <div class="sc-size-wrap">
          <div class="sc-cube-stage" aria-hidden="true"><div class="sc-cube empty" id="sc-cube">
            <i class="cf f-front"></i><i class="cf f-back"></i><i class="cf f-right"></i><i class="cf f-left"></i><i class="cf f-top"></i><i class="cf f-bottom"></i>
          </div></div>
          <div class="sc-dims">
            <label class="sc-dim"><span>L</span><input type="number" class="input-field" id="sc-l" min="0" step="1" placeholder="L" value="${dims.l || ''}" aria-label="Length in cm" /></label>
            <label class="sc-dim"><span>B</span><input type="number" class="input-field" id="sc-b" min="0" step="1" placeholder="B" value="${dims.b || ''}" aria-label="Breadth in cm" /></label>
            <label class="sc-dim"><span>H</span><input type="number" class="input-field" id="sc-h" min="0" step="1" placeholder="H" value="${dims.h || ''}" aria-label="Height in cm" /></label>
          </div></div>
        </div>
        <div class="chip-group sc-chips" style="margin-top: var(--space-md);">
          ${PRESETS.map(w => `<button type="button" class="chip" data-sc="preset" data-value="${w}">${w} kg</button>`).join('')}
          <button type="button" class="chip" data-sc="quote" id="sc-from-quote">Use quote weight</button>
        </div>
        `)}
        <div id="sc-results" class="sc-results"></div>
        <div class="sc-note">Estimate only. Includes the standard packaging charge. Final charges may vary after packing.</div>
      </div>
      </div></div>
    </div>`;
  refreshResults();
  syncChips();
  refreshQuoteButton();
  updateCube();
}

function updateCube() {
  const cube = mount && mount.querySelector('#sc-cube');
  if (!cube) return;
  const has = dims.l > 0 && dims.b > 0 && dims.h > 0;
  cube.classList.toggle('empty', !has);
  const L0 = has ? dims.l : 40, B0 = has ? dims.b : 30, H0 = has ? dims.h : 30;
  const k = 96 / Math.max(L0, B0, H0, 1);
  const L = Math.max(8, L0 * k), B = Math.max(8, B0 * k), H = Math.max(8, H0 * k);
  const set = (cls, w, h, t) => { const f = cube.querySelector('.' + cls); f.style.width = w + 'px'; f.style.height = h + 'px'; f.style.transform = 'translate(-50%,-50%) ' + t; };
  set('f-front', L, H, `translateZ(${B / 2}px)`);
  set('f-back', L, H, `rotateY(180deg) translateZ(${B / 2}px)`);
  set('f-right', B, H, `rotateY(90deg) translateZ(${L / 2}px)`);
  set('f-left', B, H, `rotateY(-90deg) translateZ(${L / 2}px)`);
  set('f-top', L, B, `rotateX(90deg) translateZ(${H / 2}px)`);
  set('f-bottom', L, B, `rotateX(-90deg) translateZ(${H / 2}px)`);
}

function copyRates(btn) {
  const counted = countedWeight();
  const config = getConfig();
  const pack = (config.pricing && config.pricing.PACKAGING_COST) || 0;
  const rows = calculateAllShipping(0, 1, 'cheapest', counted, config);
  const lines = rows.map(r => `• ${r.partnerName} (${r.eta}): ₹${Math.ceil(r.shippingCost + pack)}`);
  const text = `Shipping estimate for ${fmt(counted)} kg parcel (packaging included):\n${lines.join('\n')}`;
  const done = () => { const o = btn.textContent; btn.textContent = '✓ Copied'; btn.classList.add('done'); setTimeout(() => { btn.textContent = o; btn.classList.remove('done'); }, 1400); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done); else done();
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
  const vol = volWeight();
  const counted = countedWeight();
  if (!(counted > 0)) {
    box.innerHTML = '<div class="sc-empty">Enter a parcel weight (or size) to see courier charges.</div>';
    return;
  }
  const config = getConfig();
  const pack = (config.pricing && config.pricing.PACKAGING_COST) || 0;
  const rows = calculateAllShipping(0, 1, 'cheapest', counted, config);
  if (!rows.length) {
    box.innerHTML = '<div class="sc-empty">No courier supports this weight. Maximum supported is 20 kg.</div>';
    return;
  }
  const cheapest = Math.min(...rows.map(r => r.shippingCost));
  const fastest = Math.min(...rows.map(r => parseInt(r.eta) || 99));
  const basis = vol > weight ? 'Volumetric weight is higher' : 'Actual weight is higher';
  const sum = box.ownerDocument.getElementById('sc-sum-parcel');
  if (sum) sum.textContent = `${fmt(weight)} kg${vol > 0 ? ` · ${dims.l}×${dims.b}×${dims.h} cm` : ''}`;
  const best = Math.ceil(cheapest + pack);
  const maxW = Math.max(weight, vol, 0.01);
  const aPct = Math.round((weight / maxW) * 100), vPct = Math.round((vol / maxW) * 100);
  const volWins = vol > weight;
  const bar = (id, label, val, pct, win) => {
    const prev = lastPct[id] == null ? 0 : lastPct[id];
    lastPct[id] = pct;
    return `<div class="sc-bar ${win ? 'win' : ''}"><div class="sc-bar-top"><span>${label}</span><b>${val}</b>${win ? '<em>Charged</em>' : ''}</div><div class="sc-bar-track"><i data-pct="${pct}" style="width:${prev}%"></i></div></div>`;
  };
  const weightBody = `
    ${bar('a', 'Actual weight', fmt(weight) + ' kg', aPct, !volWins)}
    ${bar('v', 'Volumetric weight', vol > 0 ? fmt(vol) + ' kg' : '—', vPct, volWins)}
    <div class="sc-meta">${vol > 0 ? `${dims.l} × ${dims.b} × ${dims.h} cm ÷ 5000 = ${fmt(vol)} kg. ${basis}, so ${fmt(counted)} kg is charged.` : 'Add L, B and H to check volumetric weight. Actual weight is charged until then.'}</div>`;
  const maxTot = Math.max(...rows.map(r => r.shippingCost + pack));
  const list = rows.slice();
  if (sortBy === 'cheap') list.sort((x, y) => x.shippingCost - y.shippingCost);
  if (sortBy === 'fast') list.sort((x, y) => (parseInt(x.eta) || 99) - (parseInt(y.eta) || 99) || x.shippingCost - y.shippingCost);
  const sortBtn = (v, t) => `<button type="button" class="sc-sort ${sortBy === v ? 'active' : ''}" data-sc="sort" data-value="${v}">${t}</button>`;
  const courierBody = `
    <div class="sc-sortbar"><span>Sort</span>${sortBtn('default', 'Default')}${sortBtn('cheap', 'Cheapest')}${sortBtn('fast', 'Fastest')}<button type="button" class="sc-copy" data-sc="copy">Copy rates</button></div>
    <div class="sc-table" role="table" aria-label="Courier charges">
      <div class="sc-row sc-head" role="row"><span>Courier</span><span>ETA</span><span>Shipping</span><span>Total</span></div>
      ${list.map(r => {
        const k = r.partnerKey || r.partnerName;
        const o = rowOpen.has(k);
        const tot = Math.ceil(r.shippingCost + pack);
        return `
        <div class="sc-crow ${o ? 'open' : ''} ${r.shippingCost === cheapest ? 'is-cheap' : ''}">
          <button type="button" class="sc-row sc-rowbtn" data-sc="row" data-key="${esc(k)}" aria-expanded="${o}">
            <span class="sc-name"><svg class="sc-row-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>${esc(r.partnerName)}
              ${r.shippingCost === cheapest ? '<em class="sc-badge sc-cheap">Cheapest</em>' : ''}
              ${(parseInt(r.eta) || 99) === fastest ? '<em class="sc-badge sc-fast">Fastest</em>' : ''}
            </span>
            <span>${esc(r.eta)}</span>
            <span>₹${Math.ceil(r.shippingCost)}</span>
            <span class="sc-total">₹${tot}</span>
            <span class="sc-cost"><i style="width:${Math.max(6, Math.round((r.shippingCost + pack) / maxTot * 100))}%"></i></span>
          </button>
          <div class="sc-detail"><div class="sc-detail-inner">
            <dl>
              <div><dt>Courier charge</dt><dd>₹${Math.ceil(r.shippingCost)}</dd></div>
              <div><dt>Packaging</dt><dd>₹${pack}</dd></div>
              <div><dt>Weight charged</dt><dd>${fmt(counted)} kg</dd></div>
              <div><dt>Delivery time</dt><dd>${esc(r.eta)}</dd></div>
              <div class="sc-dl-wide"><dt>Rate used</dt><dd>${esc(r.breakdown || r.partnerName)}</dd></div>
              <div class="sc-dl-sum"><dt>Total</dt><dd>₹${tot}</dd></div>
            </dl>
          </div></div>
        </div>`;
      }).join('')}
    </div>
    <div class="sc-meta">Packaging ₹${pack} is included in Total. Tap a courier to see how its charge is made.</div>`;
  box.innerHTML =
    acc('weight', 'Weight check', `Counted ${fmt(counted)} kg`, weightBody) +
    acc('courier', 'Courier charges', `From ₹${best}`, courierBody);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    box.querySelectorAll('.sc-bar-track i').forEach(i => { i.style.width = i.dataset.pct + '%'; });
  }));
}
