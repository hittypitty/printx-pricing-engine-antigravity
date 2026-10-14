/**
 * Main — Bootstrap entry point
 * Imports all UI modules, wires them to containers, triggers initial calculation.
 */

import { init as initHeader } from './ui/header.js';
import { init as initInput } from './ui/inputRenderer.js';
import { init as initDropship } from './ui/dropshipPanel.js';
import { init as initShipCalc } from './ui/shippingCalculator.js';
import { init as initOutput } from './ui/outputRenderer.js';
import { init as initQuote } from './ui/quoteRenderer.js';
import { recalculate } from './controller/appController.js';
import { getState } from './state/store.js';
import { readPrefill, applyPrefill } from './state/urlPrefill.js';

document.addEventListener('DOMContentLoaded', () => {
  // Details sent from the ERP via the URL (optional)
  const prefill = readPrefill();
  applyPrefill(prefill, getState());

  // Initialize UI modules with their container elements
  initHeader(document.getElementById('app-header'));
  initInput(document.getElementById('app-inputs'));
  initDropship(document.getElementById('dropship-mount'));
  initShipCalc(document.getElementById('shipcalc-mount'), prefill.calc);
  showErpBanner(prefill.info);
  initOutput(document.getElementById('app-outputs'));
  initQuote(document.getElementById('app-quote'));
  document.body.classList.add('intro');
  setTimeout(() => document.body.classList.remove('intro'), 1800);

  // Run initial calculation with default state
  recalculate();
});

function showErpBanner(info) {
  if (!info) return;
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bits = [info.ref && `Order <b>${esc(info.ref)}</b>`, info.name && esc(info.name), [info.city, info.pin].filter(Boolean).map(esc).join(' - ')].filter(Boolean);
  const bar = document.createElement('div');
  bar.className = 'erp-banner';
  bar.innerHTML = `<span class="erp-dot"></span><span>Opened from ERP: ${bits.join(' · ')}</span>`;
  const grid = document.querySelector('.app-grid');
  grid.parentNode.insertBefore(bar, grid);
}
