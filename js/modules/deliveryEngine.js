/**
 * Delivery Engine — Weight calculation, shipping cost, packaging
 * Pure function module — reads courier rates and weight config from configStore.
 */

import { getConfig } from '../state/configStore.js';
import { WEIGHT_CONFIG } from '../config/weightConfig.js';

/**
 * Calculate shipping cost for a single courier partner.
 *
 * @param {string} partnerKey - e.g., 'bluedart'
 * @param {number} totalMeters
 * @param {number} quantity
 * @returns {{ partnerKey, partnerName, shippingCost, countedWeight, eta, trackUrl, breakdown } | null}
 */
export function calculateShipping(partnerKey, totalMeters, quantity) {
  const { couriers } = getConfig();
  const partner = couriers[partnerKey];
  if (!partner) return null;

  // 1. Use only totalMeters
  const combinedMeters = totalMeters;

  // 2. Find slab (highest meter <= combinedMeters)
  let matchedSlab = WEIGHT_CONFIG[0]; // fallback
  for (let i = 0; i < WEIGHT_CONFIG.length; i++) {
    if (WEIGHT_CONFIG[i].meter <= combinedMeters) {
      matchedSlab = WEIGHT_CONFIG[i];
    } else {
      break; // Since array is sorted by meter, we can break once we exceed combinedMeters
    }
  }
  
  // If combinedMeters is larger than our largest slab, the loop naturally stops at the largest slab.

  // 3. Extract actual weight
  const actualWeight = matchedSlab.actualWeight;

  // 4. Calculate volumetric weight
  let volumetricWeight = 0;
  if (matchedSlab.l && matchedSlab.b && matchedSlab.h) {
    volumetricWeight = (matchedSlab.l * matchedSlab.b * matchedSlab.h) / 5000;
  }

  // 5. Final weight resolution
  let finalWeight = 0;
  if (matchedSlab.overrideWeight !== undefined) {
    finalWeight = matchedSlab.overrideWeight;
  } else {
    finalWeight = Math.max(actualWeight, volumetricWeight);
  }

  // Fallback if finalWeight is somehow 0
  finalWeight = Math.max(finalWeight, 0.01);

  const slabCount = Math.ceil(finalWeight / partner.slab);
  const shippingCost = partner.base + (Math.max(slabCount - 1, 0) * partner.add);

  return {
    partnerKey,
    partnerName: partner.name,
    shippingCost,
    countedWeight: Math.round(finalWeight * 100) / 100,
    eta: partner.eta,
    trackUrl: partner.trackUrl,
    breakdown: `${partner.name} (${slabCount} slabs)`,
  };
}

/**
 * Calculate all courier options, with optional filter/sort.
 *
 * @param {number} totalMeters
 * @param {number} quantity
 * @param {string} filter - 'all' | 'cheapest' | 'fastest'
 * @returns {Array} sorted partner results
 */
export function calculateAllShipping(totalMeters, quantity, filter) {
  const { couriers } = getConfig();
  const results = Object.keys(couriers)
    .map(key => calculateShipping(key, totalMeters, quantity))
    .filter(Boolean);

  switch (filter) {
    case 'cheapest':
      results.sort((a, b) => a.shippingCost - b.shippingCost);
      break;
    case 'fastest':
      results.sort((a, b) => parseInt(a.eta) - parseInt(b.eta));
      break;
    default:
      break;
  }

  return results;
}

/**
 * Get the best courier based on cost and ETA override rules.
 * @param {Array} results - Array of calculated courier results
 * @returns {string|null} partnerKey of the best courier
 */
export function getBestCourier(results) {
  if (!results || results.length === 0) return null;
  if (results.length === 1) return results[0].partnerKey;

  // Shallow copy to sort safely
  const sorted = [...results].sort((a, b) => a.shippingCost - b.shippingCost);

  const cheapest = sorted[0];
  const second = sorted[1];

  // If price difference small -> prefer faster courier
  if ((second.shippingCost - cheapest.shippingCost) <= 20) {
    const aDays = parseInt(cheapest.eta);
    const bDays = parseInt(second.eta);
    return aDays <= bDays ? cheapest.partnerKey : second.partnerKey;
  }

  return cheapest.partnerKey;
}

/**
 * Get packaging cost based on delivery method.
 * @param {string} deliveryMethod - 'pickup' | 'courier'
 * @returns {number} 0 or PACKAGING_COST
 */
export function getPackagingCost(deliveryMethod) {
  const { pricing } = getConfig();
  return deliveryMethod === 'courier' ? pricing.PACKAGING_COST : 0;
}
