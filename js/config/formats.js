/**
 * Format Definitions & Dual-Width Constants
 *
 * ROLL_WIDTH (24")      → used ONLY for pricing calculations
 * PRINTABLE_WIDTH (22.8") → used for validation, image fitting, packing
 */

export const ROLL_WIDTH = 24;
export const PRINTABLE_WIDTH = 22.8;

// Per-technology printable limits (inches)
export const UV_SHEET_WIDTH = 11;
export const UV_A3_LENGTH = 16;
export const UV_CUSTOM_MAX_LENGTH = 20;
export const SUBLIMATION_WIDTH = 24;

export const FORMATS = {
  A4:     { printableWidth: 11,   pricingWidth: 11,   length: 8,    fixedPrice: 70,  label: 'A4' },
  A3:     { printableWidth: 11,   pricingWidth: 11,   length: 16,   fixedPrice: 120, label: 'A3' },
  A2:     { printableWidth: 22.5, pricingWidth: 22.5, length: 16.5, fixedPrice: 250, label: 'A2' },
  Meters: { printableWidth: PRINTABLE_WIDTH, pricingWidth: ROLL_WIDTH, length: null, fixedPrice: null, label: 'Meters' },
  Custom: { printableWidth: 11,              pricingWidth: 11,         length: null, fixedPrice: null, label: 'Custom' },
  Roll:   { printableWidth: 24,              pricingWidth: 24,         length: null, fixedPrice: null, label: 'Roll' },
};

/**
 * Max printable width for a print technology (single source of truth).
 * @param {'fabric'|'uv_dtf'|'sublimation'} tech
 * @returns {number} inches
 */
export function getPrintableWidthFor(tech) {
  if (tech === 'uv_dtf') return UV_SHEET_WIDTH;
  if (tech === 'sublimation') return SUBLIMATION_WIDTH;
  return PRINTABLE_WIDTH;
}

/**
 * Gap between designs when packing (inches).
 * UV DTF uses 2mm, others 0.2".
 */
export function getPackingMarginFor(tech) {
  return tech === 'uv_dtf' ? 0.0787 : 0.2;
}
