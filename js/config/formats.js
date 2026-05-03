/**
 * Format Definitions & Dual-Width Constants
 * 
 * ROLL_WIDTH (24")      → used ONLY for pricing calculations
 * PRINTABLE_WIDTH (22.5") → used for validation, image fitting, packing
 */

export const ROLL_WIDTH = 24;
export const PRINTABLE_WIDTH = 22.5;

export const FORMATS = {
  A4:     { printableWidth: 11,   pricingWidth: 11,   length: 8,    fixedPrice: 70,  label: 'A4' },
  A3:     { printableWidth: 11,   pricingWidth: 11,   length: 16,   fixedPrice: 120, label: 'A3' },
  A2:     { printableWidth: 22.5, pricingWidth: 22.5, length: 16.5, fixedPrice: 250, label: 'A2' },
  Meters: { printableWidth: PRINTABLE_WIDTH, pricingWidth: ROLL_WIDTH, length: null, fixedPrice: null, label: 'Meters' },
};
