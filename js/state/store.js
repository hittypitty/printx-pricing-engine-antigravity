/**
 * Centralized State Store — Single source of truth
 * UI reads from here via subscribe(). Only the controller writes via update().
 */

const state = {
  // --- User Inputs ---
  inputMode: 'manual', // 'manual' | 'image'
  images: [], // Array of uploaded image objects
  format: 'A4',
  rawLength: '',
  quantity: 1,
  conversions: [], // Array of { id, type, qty }
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

const listeners = [];

export function getState() {
  return { ...state };
}

export function update(partial) {
  Object.assign(state, partial);
  listeners.forEach(fn => fn(getState()));
}

export function subscribe(fn) {
  listeners.push(fn);
}
