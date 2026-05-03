/**
 * TEMPORARY Weight System
 * Assumption: 1 running meter = 300 grams = 0.3 kg
 * Will be replaced with real weight database / packing engine later.
 */

export const WEIGHT_PER_METER_KG = 0.3;

/**
 * Estimate weight from total running meters.
 * @param {number} totalMeters
 * @returns {number} weight in kg
 */
export function estimateWeight(totalMeters) {
  return totalMeters * WEIGHT_PER_METER_KG;
}
