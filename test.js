const state = {
  // --- User Inputs ---
  format: 'A4',
  rawLength: '',
  quantity: 1,
  designCount: 0,
  deliveryMethod: 'pickup',
  selectedPartner: null,
  courierFilter: 'all',

  // --- Validation ---
  isValid: true,
  validationError: null,

  // --- Resolved (from formatParser — carries BOTH widths) ---
  printableWidth: 11,
  pricingWidth: 11,
  length: 8,
  totalMeters: 0,
  totalSqInches: 0,
  isSheetFormat: true,

  // --- Pricing ---
  printCost: 0,
  rateApplied: 0,
  methodLabel: '',
  printBreakdown: '',
  conversionCost: 0,
  conversionBreakdown: '',

  // --- Delivery ---
  packagingCost: 0,
  shippingCost: 0,
  partnerName: '',
  countedWeight: 0,
  eta: '',
  shippingBreakdown: '',
  allPartnerResults: [],

  // --- Output ---
  finalTotal: 0,
  quoteText: '',
};

function buildHTML(state) {
  const deliveryCost = state.shippingCost + state.packagingCost;
  const deliveryText = state.deliveryMethod === 'pickup' ? 'Free' : '₹' + deliveryCost;
  const deliverySub = state.deliveryMethod === 'pickup' ? 'Office Pickup' : state.partnerName;
  const deliveryKpiSub = state.deliveryMethod === 'pickup' ? 'Office Pickup' : `ETA: ${state.eta} (${state.countedWeight} kg)`;

  let effectiveText = '';
  if (state.isSheetFormat) {
    effectiveText = `Effective print rate: ₹${(state.printCost / state.quantity).toFixed(2)} / pc`;
  } else if (state.totalSqInches > 0) {
    effectiveText = `Effective print rate: ₹${(state.printCost / state.totalSqInches).toFixed(2)} / sq in`;
  }

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
        <div class="kpi-grid" style="grid-template-columns: 1fr 1fr 1.2fr;">
          <div class="kpi-block">
            <div class="kpi-label" id="kpi-metric-label">${state.isSheetFormat ? 'Quantity' : 'Total Running'}</div>
            <div class="kpi-value" id="kpi-metric-value">${state.isSheetFormat ? state.quantity + ' pcs' : state.totalMeters.toFixed(3) + 'm'}</div>
            <div class="kpi-sub" id="kpi-metric-sub">${state.isSheetFormat ? '' : '@ ₹' + state.rateApplied + ' / m'}</div>
          </div>
          <div class="kpi-block">
            <div class="kpi-label">Print Cost</div>
            <div class="kpi-value" id="kpi-print-cost" style="color: var(--accent-purple);">₹${state.printCost}</div>
            <div class="kpi-sub" id="kpi-print-sub">${(state.methodLabel || '').replace(' (', '<br>(')}</div>
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
                Print: ${state.printBreakdown || '—'}
              </div>
              <div class="breakdown-badge breakdown-delivery-badge" id="breakdown-delivery-row">
                Ship: ${state.shippingBreakdown ? state.shippingBreakdown : deliverySub + ' (' + deliveryText + ')'}
              </div>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 12px;" id="effective-rate">
              ${effectiveText}
            </div>
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

try {
  buildHTML(state);
  console.log("buildHTML OK");
} catch (e) {
  console.error("buildHTML ERROR:", e);
}
