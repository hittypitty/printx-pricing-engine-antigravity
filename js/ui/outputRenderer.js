/**
 * Output Renderer — 3-column KPI + breakdown + right-aligned total
 * Matches PrintX reference layout exactly.
 */

import { subscribe, getState } from '../state/store.js';

export function init(container) {
  container.innerHTML = buildHTML(getState());
  subscribe(state => updateDOM(container, state));
}

function buildHTML(state) {
  const deliveryCost = state.shippingCost + state.packagingCost;
  const deliveryText = state.deliveryMethod === 'pickup' ? 'Free' : '₹' + deliveryCost;
  const deliveryKpiSub = state.deliveryMethod === 'pickup' ? 'Office Pickup' : `ETA: ${state.eta}`;
  const effectiveRate = state.effectiveRate || '0.00';
  const isUVAuto = state.printTechnology === 'uv_dtf' && (state.inputMode === 'image' || state.inputMode === 'manual-size');
  
  const hasCart = state.cart && state.cart.length > 0;
  const metricLabelText = hasCart
    ? 'Items in Cart'
    : (isUVAuto ? 'Sheets Required' : (state.isSheetFormat ? 'Quantity' : 'Total Running'));
  const metricValueText = hasCart
    ? `${state.cart.length} item(s)`
    : (isUVAuto ? `${state.quantity} sheets` : (state.isSheetFormat ? state.quantity + ' pcs' : state.totalMeters.toFixed(3) + 'm'));
  const isAuto = state.inputMode === 'image' || state.inputMode === 'manual-size';
  const metricSubText = hasCart
    ? `${state.cart.reduce((sum, item) => sum + (item.isSheetFormat ? item.quantity : 1), 0)} items total`
    : (isAuto
        ? (state.printTechnology === 'uv_dtf'
            ? `${state.stickersPerSheet || 0} pcs / sheet`
            : `${state.stickersPerSheet || 0} pcs / meter`
          )
        : (state.isSheetFormat ? '@ ₹' + state.rateApplied + ' / pc' : '@ ₹' + state.rateApplied + ' / m')
      );

  const printSubText = hasCart ? 'Mixed Order' : (state.methodLabel || 'Running Meter');
  const showConversion = hasCart ? state.conversionCost > 0 : (state.conversions && state.conversions.length > 0);

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
            <line x1="8" y1="14" x2="8" y2="14.01"></line>
            <line x1="12" y1="14" x2="12" y2="14.01"></line>
            <line x1="16" y1="14" x2="16" y2="14.01"></line>
            <line x1="8" y1="18" x2="8" y2="18.01"></line>
            <line x1="12" y1="18" x2="12" y2="18.01"></line>
            <line x1="16" y1="18" x2="16" y2="18.01"></line>
          </svg>
          Decision & Calculation
        </h2>
      </div>
      <div class="card-body">
        <div class="kpi-grid" style="grid-template-columns: 1.2fr 0.9fr 0.9fr;">
          <div class="kpi-block">
            <div class="kpi-label" id="kpi-metric-label">${metricLabelText}</div>
            <div class="kpi-value" id="kpi-metric-value">${metricValueText}</div>
            <div class="kpi-sub" id="kpi-metric-sub">${metricSubText}</div>
          </div>
          <div class="kpi-block">
            <div class="kpi-label">Print Cost</div>
            <div class="kpi-value" id="kpi-print-cost" style="color: var(--accent-purple);">₹${state.printCost}</div>
            <div class="kpi-sub" id="kpi-print-sub">${printSubText}</div>
          </div>
          <div class="kpi-block kpi-delivery">
            <div class="kpi-label">Shipping & Pkg</div>
            <div class="kpi-value" id="kpi-delivery-cost">${deliveryText}</div>
            <div class="kpi-sub" id="kpi-delivery-sub">${deliveryKpiSub}</div>
          </div>
        </div>

        <div style="height: 1px; background: var(--border-color); margin: var(--space-xl) 0;"></div>

        <div style="display: flex; justify-content: space-between; align-items: flex-end;">
          <div class="breakdown-section" style="margin-bottom: 0;">
            <div class="breakdown-title" style="font-size: 15px; color: var(--text-secondary); margin-bottom: 12px; font-weight: 500;">Cost Breakdown</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div class="breakdown-badge breakdown-print-badge" id="breakdown-print">
                ${hasCart ? 'Print: ' + state.printBreakdown : 'Print: ' + (state.isSheetFormat ? state.quantity + ' pcs × ₹' + state.rateApplied + ' / pc' : state.totalMeters.toFixed(2) + ' meters × ₹' + state.rateApplied + ' / m')}
              </div>
              <div class="breakdown-badge" id="breakdown-conversion-row" style="display: ${showConversion ? 'inline-block' : 'none'}; background: #e0e7ff; color: #4338ca;">Conv: ${state.conversionBreakdown}</div>
              <div class="breakdown-badge breakdown-delivery-badge" id="breakdown-delivery-row" style="display: ${state.deliveryMethod === 'pickup' ? 'none' : 'inline-block'};">Ship: ${state.shippingBreakdown || state.partnerName} + ₹${state.packagingCost} Pkg</div>
            </div>
            <div id="breakdown-effective-rate" style="font-size: 12px; color: var(--text-muted); margin-top: 10px;">Effective print rate: ₹${effectiveRate} / sq in</div>
          </div>

          <div class="final-total" style="text-align: right; border-top: none; padding: 0;">
            <div class="final-total-label">Final Total</div>
            <div class="final-total-value" id="final-total-value">₹${state.finalTotal}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateDOM(container, state) {
  const deliveryCost = state.shippingCost + state.packagingCost;
  const deliveryText = state.deliveryMethod === 'pickup' ? 'Free' : '₹' + deliveryCost;
  const deliveryKpiSub = state.deliveryMethod === 'pickup' ? 'Office Pickup' : `ETA: ${state.eta}`;
  const effectiveRate = state.effectiveRate || '0.00';

  const isUVAuto = state.printTechnology === 'uv_dtf' && (state.inputMode === 'image' || state.inputMode === 'manual-size');
  
  const hasCart = state.cart && state.cart.length > 0;

  // KPI blocks
  const metricLabel = container.querySelector('#kpi-metric-label');
  const metricValue = container.querySelector('#kpi-metric-value');
  const metricSub = container.querySelector('#kpi-metric-sub');
  if (metricLabel) {
    metricLabel.textContent = hasCart
      ? 'Items in Cart'
      : (isUVAuto ? 'Sheets Required' : (state.isSheetFormat ? 'Quantity' : 'Total Running'));
  }
  if (metricValue) {
    metricValue.textContent = hasCart
      ? `${state.cart.length} item(s)`
      : (isUVAuto ? `${state.quantity} sheets` : (state.isSheetFormat ? state.quantity + ' pcs' : state.totalMeters.toFixed(3) + 'm'));
  }
  if (metricSub) {
    const isAuto = state.inputMode === 'image' || state.inputMode === 'manual-size';
    metricSub.textContent = hasCart
      ? `${state.cart.reduce((sum, item) => sum + (item.isSheetFormat ? item.quantity : 1), 0)} items total`
      : (isAuto
          ? (state.printTechnology === 'uv_dtf'
              ? `${state.stickersPerSheet || 0} pcs / sheet`
              : `${state.stickersPerSheet || 0} pcs / meter`
            )
          : (state.isSheetFormat ? '@ ₹' + state.rateApplied + ' / pc' : '@ ₹' + state.rateApplied + ' / m')
        );
  }

  const printCost = container.querySelector('#kpi-print-cost');
  const printSub = container.querySelector('#kpi-print-sub');
  if (printCost) printCost.textContent = '₹' + state.printCost;
  if (printSub) {
    printSub.textContent = hasCart
      ? 'Mixed Order'
      : (state.methodLabel || 'Running Meter');
  }

  const delCost = container.querySelector('#kpi-delivery-cost');
  const delSub = container.querySelector('#kpi-delivery-sub');
  if (delCost) delCost.textContent = deliveryText;
  if (delSub) delSub.innerHTML = deliveryKpiSub;

  // Breakdown badges
  const bPrint = container.querySelector('#breakdown-print');
  if (bPrint) {
    bPrint.textContent = hasCart
      ? 'Print: ' + state.printBreakdown
      : 'Print: ' + (state.isSheetFormat ? state.quantity + ' pcs × ₹' + state.rateApplied + ' / pc' : state.totalMeters.toFixed(2) + ' meters × ₹' + state.rateApplied + ' / m');
  }

  const bDelRow = container.querySelector('#breakdown-delivery-row');
  if (bDelRow) {
    bDelRow.style.display = state.deliveryMethod === 'pickup' ? 'none' : 'inline-block';
    bDelRow.textContent = 'Ship: ' + (state.shippingBreakdown || state.partnerName) + ' + ₹' + state.packagingCost + ' Pkg';
  }

  const bConvRow = container.querySelector('#breakdown-conversion-row');
  if (bConvRow) {
    const hasConv = hasCart ? state.conversionCost > 0 : (state.conversions && state.conversions.length > 0);
    bConvRow.style.display = hasConv ? 'inline-block' : 'none';
    bConvRow.textContent = 'Conv: ' + state.conversionBreakdown;
  }

  // Effective rate sub-text
  const bRate = container.querySelector('#breakdown-effective-rate');
  if (bRate) {
    bRate.textContent = 'Effective print rate: ₹' + effectiveRate + ' / sq in';
  }

  // Final total
  const finalTotal = container.querySelector('#final-total-value');
  if (finalTotal) finalTotal.textContent = '₹' + state.finalTotal;
}
