/**
 * TEMPORARY Weight System
 * Assumption: 1 running meter = 300 grams = 0.3 kg
 * Will be replaced with real weight database / packing engine later.
 */

export const WEIGHT_PER_METER_KG = 0.3;

export const UV_DTF_SHIPPING_SLABS = [
  { min: 1, max: 2, weight: 0.2 },
  { min: 3, max: 8, weight: 0.3 },
  { min: 9, max: 30, weight: 0.4 },
  { min: 31, max: 999, weight: 1.35 }
];

/**
 * Estimate weight from total running meters.
 * @param {number} totalMeters
 * @returns {number} weight in kg
 */
export function estimateWeight(totalMeters) {
  return totalMeters * WEIGHT_PER_METER_KG;
}
