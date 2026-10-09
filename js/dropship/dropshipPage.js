/**
 * Dropship Calculator page — pick product + qty + print placements → rate, total, WhatsApp quote.
 */

import { init as initHeader } from '../ui/header.js';
import {
  DROPSHIP_RATES, SIZE_RATE, ADDONS, isApparel, placementsFor, unitRate, lineTotal,
} from './dropshipRates.js';

const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = { placements: {}, addons: new Set(), lines: [] };

function describe(line) {
  const parts = Object.entries(line.placements).map(([k, s]) => `${k}: ${s}`);
  line.addons.forEach(a => parts.push(a));
  return parts.length ? ` (${parts.join(', ')})` : '';
}

document.addEventListener('DOMContentLoaded', () => {
  initHeader(document.getElementById('app-header'));
  const root = document.getElementById('dropship-root');

  root.innerHTML = `
    <h1>📦 Dropship Calculator</h1>
    <div class="ds-sub">Product + quantity + print placement chuno — rate aur total apne aap calculate honge.</div>
    <div class="ds-grid">
      <div>
        <div class="ds-card">
          <h2>1. Product</h2>
          <label for="ds-product">Product</label>
          <select id="ds-product">
            ${Object.keys(DROPSHIP_RATES).map(k => `<option value="${esc(k)}">${esc(k)} — ₹${DROPSHIP_RATES[k]}</option>`).join('')}
          </select>
          <div class="ds-row">
            <div><label for="ds-qty">Quantity</label><input type="number" id="ds-qty" min="1" value="1" /></div>
            <div><label>Base rate (₹ / pc)</label><input type="text" id="ds-base" disabled /></div>
          </div>
          <div id="ds-print-block">
            <label>Print placements (har jagah ka size chuno)</label>
            <div id="ds-placements"></div>
            <label>Special add-ons</label>
            <div class="ds-chips" id="ds-addons"></div>
          </div>
          <div class="ds-preview" id="ds-preview"></div>
          <button class="ds-btn ds-btn-primary" id="ds-add">➕ Quote me add karo</button>
        </div>
        <div class="ds-card">
          <h2>2. Shipping</h2>
          <div class="ds-row">
            <div>
              <label for="ds-delivery">Delivery</label>
              <select id="ds-delivery">
                <option value="pickup">Pickup from Office</option>
                <option value="courier">Courier</option>
              </select>
            </div>
            <div>
              <label for="ds-shipping">Shipping charge (₹)</label>
              <input type="number" id="ds-shipping" min="0" value="0" />
            </div>
          </div>
          <div class="ds-muted" style="margin-top:6px">Courier ka charge pata nahi ho to Pricing Engine page se nikaal ke yahan daalo.</div>
        </div>
      </div>
      <div>
        <div class="ds-card">
          <h2>Quote</h2>
          <div id="ds-empty" class="ds-muted">Abhi koi product add nahi hua.</div>
          <table id="ds-lines" style="display:none">
            <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Total</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
          <div id="ds-sums" style="display:none">
            <div class="ds-sum"><span>Products</span><span id="ds-s-products"></span></div>
            <div class="ds-sum"><span>Shipping</span><span id="ds-s-ship"></span></div>
            <div class="ds-sum grand"><span>Grand Total</span><span id="ds-s-total"></span></div>
          </div>
          <textarea id="ds-quote" readonly placeholder="WhatsApp quote yahan banega"></textarea>
          <button class="ds-btn ds-btn-wa" id="ds-copy">📋 Copy WhatsApp Quote</button>
        </div>
      </div>
    </div>`;

  const $ = id => document.getElementById(id);
  const productSel = $('ds-product');

  function updatePreview() {
    const { qty, rate, total } = lineTotal(productSel.value, $('ds-qty').value, state.placements, [...state.addons]);
    $('ds-preview').innerHTML = `Rate: <b>${inr(rate)}</b> / pc × ${qty} = <b>${inr(total)}</b>`;
  }

  function renderOptions() {
    const v = productSel.value;
    $('ds-base').value = '₹' + (DROPSHIP_RATES[v] || 0);
    $('ds-print-block').style.display = isApparel(v) ? 'block' : 'none';
    const box = $('ds-placements');
    box.innerHTML = '';
    placementsFor(v).forEach(p => {
      const div = document.createElement('div');
      div.className = 'ds-place';
      div.innerHTML = `<b>${p.key}</b><div class="ds-chips" style="margin-top:6px"></div>`;
      const chips = div.querySelector('.ds-chips');
      const none = document.createElement('span');
      none.className = 'ds-chip' + (state.placements[p.key] ? '' : ' active');
      none.textContent = 'No print';
      none.onclick = () => { delete state.placements[p.key]; renderOptions(); };
      chips.appendChild(none);
      p.sizes.forEach(sz => {
        const c = document.createElement('span');
        c.className = 'ds-chip' + (state.placements[p.key] === sz ? ' active' : '');
        c.textContent = `${sz} (+₹${SIZE_RATE[sz]})`;
        c.onclick = () => { state.placements[p.key] = sz; renderOptions(); };
        chips.appendChild(c);
      });
      box.appendChild(div);
    });
    const ad = $('ds-addons');
    ad.innerHTML = '';
    ADDONS.forEach(a => {
      const c = document.createElement('span');
      c.className = 'ds-chip' + (state.addons.has(a.value) ? ' active' : '');
      c.textContent = a.label;
      c.onclick = () => { state.addons.has(a.value) ? state.addons.delete(a.value) : state.addons.add(a.value); renderOptions(); };
      ad.appendChild(c);
    });
    updatePreview();
  }

  function renderQuote() {
    const tbody = $('ds-lines').querySelector('tbody');
    tbody.innerHTML = '';
    state.lines.forEach((l, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(l.variant)}<div class="ds-muted">${esc(describe(l).trim())}</div></td><td class="num">${l.qty}</td><td class="num">${inr(l.rate)}</td><td class="num">${inr(l.total)}</td><td><button class="ds-btn ds-btn-x" data-i="${i}">✕</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button').forEach(b => { b.onclick = () => { state.lines.splice(Number(b.dataset.i), 1); renderQuote(); }; });

    const has = state.lines.length > 0;
    $('ds-empty').style.display = has ? 'none' : 'block';
    $('ds-lines').style.display = has ? 'table' : 'none';
    $('ds-sums').style.display = has ? 'block' : 'none';
    const isCourier = $('ds-delivery').value === 'courier';
    const products = state.lines.reduce((s, l) => s + l.total, 0);
    const ship = isCourier ? Math.max(0, Number($('ds-shipping').value) || 0) : 0;
    $('ds-s-products').textContent = inr(products);
    $('ds-s-ship').textContent = isCourier ? inr(ship) : 'Pickup (free)';
    $('ds-s-total').textContent = inr(products + ship);

    if (!has) { $('ds-quote').value = ''; return; }
    const lines = state.lines.map((l, i) => `${i + 1}. ${l.variant}${describe(l)}\n   ${l.qty} × ${inr(l.rate)} = ${inr(l.total)}`).join('\n');
    $('ds-quote').value =
      `Hello! 👋\nThank you for reaching out to us.\nHere is the quote for your dropship requirement:\n\n${lines}\n\n` +
      `Products: ${inr(products)}\n` +
      (isCourier ? `Shipping: ${inr(ship)}\n` : `Delivery: Pickup from Office\n`) +
      `*Total: ${inr(products + ship)}*\n\n— PrintX / Bazarville`;
  }

  $('ds-add').onclick = () => {
    const v = productSel.value;
    const apparel = isApparel(v);
    const placements = apparel ? { ...state.placements } : {};
    const addons = apparel ? [...state.addons] : [];
    const { qty, rate, total } = lineTotal(v, $('ds-qty').value, placements, addons);
    state.lines.push({ variant: v, qty, rate, total, placements, addons });
    renderQuote();
  };
  $('ds-copy').onclick = async () => {
    const t = $('ds-quote').value;
    if (!t) return;
    try { await navigator.clipboard.writeText(t); }
    catch { $('ds-quote').select(); document.execCommand('copy'); }
    $('ds-copy').textContent = '✅ Copied!';
    setTimeout(() => { $('ds-copy').textContent = '📋 Copy WhatsApp Quote'; }, 1500);
  };
  productSel.onchange = () => { state.placements = {}; state.addons = new Set(); renderOptions(); };
  $('ds-qty').oninput = updatePreview;
  $('ds-delivery').onchange = renderQuote;
  $('ds-shipping').oninput = renderQuote;

  renderOptions();
  renderQuote();
});

// re-export for tests / debugging
export { unitRate };
