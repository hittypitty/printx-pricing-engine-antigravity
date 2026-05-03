/**
 * Pricing Engine — Sheet pricing, micro-pricing, slab pricing, conversion cost
 * Pure function module — width-agnostic (uses pre-computed totalSqInches from formatParser).
 * Reads all rates from configStore (admin-editable).
 */

import { getConfig } from '../state/configStore.js';

/**
 * Calculate print cost using V1 rules exactly.
 * Decision tree:
 *   1. Sheet format (A4/A3/A2) → fixed price × quantity
 *   2. Meters + totalMeters < 1 → micro-pricing (sqInches × rate)
 *   3. Meters + totalMeters >= 1 → slab pricing (meters × slab rate)
 *
 * @param {{
 *   format: string,
 *   totalMeters: number,
 *   totalSqInches: number,
 *   quantity: number,
 *   pricingWidth: number,
 *   length: number,
 *   isSheetFormat: boolean
 * }} dims
 * @returns {{ printCost: number, rateApplied: number, methodLabel: string, breakdown: string }}
 */
export function calculatePrintCost(dims) {
  const { pricing, formats } = getConfig();
  const { format, totalMeters, totalSqInches, quantity, isSheetFormat } = dims;

  // 1. Sheet format → fixed price × quantity
  if (isSheetFormat) {
    const fmt = formats.FORMATS[format];
    const printCost = fmt.fixedPrice * quantity;
    const effectiveRate = totalSqInches > 0 ? (printCost / totalSqInches).toFixed(2) : '0.00';
    return {
      printCost,
      effectiveRate,
      rateApplied: fmt.fixedPrice,
      methodLabel: 'Fixed Sheet Price',
      breakdown: `${quantity} pcs × ₹${fmt.fixedPrice} / pc`,
    };
  }

  // 2. Slab pricing
  const slabs = pricing.METER_SLABS;
  const slab = slabs.find(s => totalMeters >= s.min && totalMeters <= s.max);
  const rate = slab ? slab.rate : slabs[slabs.length - 1].rate;
  const printCost = Math.ceil(totalMeters * rate);
  const effectiveRate = totalSqInches > 0 ? (printCost / totalSqInches).toFixed(2) : '0.00';

  return {
    printCost,
    effectiveRate,
    rateApplied: rate,
    methodLabel: 'Running Meter',
    breakdown: `${totalMeters.toFixed(2)} meters × ₹${rate} / m`,
  };
}

/**
 * Calculate conversion cost — separate from print cost.
 *
 * @param {number} [designCount]
 * @returns {{ conversionCost: number, designCount: number, breakdown: string }}
 */
export function calculateConversionCost(designCount) {
  const { pricing } = getConfig();
  const count = designCount !== undefined ? designCount : pricing.DEFAULT_DESIGN_COUNT;
  const cost = pricing.CONVERSION_COST;
  const conversionCost = count * cost;
  return {
    conversionCost,
    designCount: count,
    breakdown: `${count} design(s) × ₹${cost} = ₹${conversionCost}`,
  };
}
