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
  return `
    <div class="card">
      <div class="card-header" style="justify-content: space-between;">
        <h2 class="card-title" style="margin-bottom: 0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f7a21b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          Client Quote Message
        </h2>
        <button class="btn btn-primary" id="btn-copy-quote" style="padding: 10px 16px; font-size: 13px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy Message
        </button>
      </div>
      <div class="card-body">
        <textarea class="input-field" id="quote-textarea" rows="12" style="font-family: var(--font-mono); font-size: 13px; line-height: 1.5; resize: none;">${state.quoteText || ''}</textarea>
        <div id="copy-feedback" style="display: none; color: var(--success); font-size: 13px; margin-top: 8px; text-align: right;">
          ✓ Copied to clipboard!
        </div>
      </div>
    </div>
  `;
}

try {
  buildHTML(state);
  console.log("quote buildHTML OK");
} catch (e) {
  console.error("quote buildHTML ERROR:", e);
}
