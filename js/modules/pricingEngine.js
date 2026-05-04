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

  // 2. Micro-pricing (< 1 meter)
  if (totalMeters < 1 && totalMeters > 0) {
    const rate = pricing.MICRO_RATE_SQ_INCH || 0.5;
    const printCost = Math.ceil(totalSqInches * rate);
    const effectiveRate = rate.toFixed(2);
    
    return {
      printCost,
      effectiveRate,
      rateApplied: rate,
      methodLabel: 'Micro-Pricing (< 1m)',
      breakdown: `${totalSqInches.toFixed(2)} sq in × ₹${rate} / sq in`,
    };
  }

  // 3. Slab pricing (>= 1 meter)
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
 * Calculate conversion cost based on array of selected conversions.
 *
 * @param {Array<{id: string, type: string, qty: number}>} conversions
 * @returns {{ conversionCost: number, breakdown: string, breakdownList: string[] }}
 */
export function calculateConversionCost(conversions) {
  const { pricing } = getConfig();
  if (!conversions || conversions.length === 0) {
    return { conversionCost: 0, breakdown: '', breakdownList: [] };
  }
  
  const costPerUnit = pricing.CONVERSION_COST; // default 50
  let conversionCost = 0;
  const breakdownList = [];
  
  conversions.forEach(c => {
    const cost = c.qty * costPerUnit;
    conversionCost += cost;
    breakdownList.push(`${c.qty} × ${c.type} (₹${cost})`);
  });
  
  return {
    conversionCost,
    breakdown: breakdownList.join(' + ') + ` = ₹${conversionCost}`,
    breakdownList
  };
}
