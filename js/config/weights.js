/**
 * Weight Constants
 * WEIGHT_PER_METER_KG is used to extrapolate fabric weight beyond the last
 * row of WEIGHT_CONFIG (weightConfig.js), which holds the real packed weights.
 */

export const WEIGHT_PER_METER_KG = 0.1;

export const UV_DTF_SHIPPING_SLABS = [
  { min: 1, max: 2, weight: 0.2 },
  { min: 3, max: 8, weight: 0.3 },
  { min: 9, max: 30, weight: 0.4 },
  { min: 31, max: 999, weight: 1.35 }
];
