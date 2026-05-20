/**
 * Delivery Engine — Weight calculation, shipping cost, packaging
 * Pure function module — reads courier rates and weight config from configStore.
 */

import { getConfig } from '../state/configStore.js';
import { WEIGHT_CONFIG } from '../config/weightConfig.js';

/**
 * Calculate A3 equivalent sheet count.
 */
export function calculateUVDTFA3EquivalentSheets(format, quantity, length) {
  if (format === 'A4') {
    return quantity * 0.5;
  } else if (format === 'A3') {
    return quantity * 1.0;
  } else if (format === 'Custom') {
    const L = Number(length) || 16;
    return quantity * (L / 16);
  }
  return quantity;
}

/**
 * Get shipping weight for UV DTF based on A3 equivalent sheets.
 */
export function getUVDTFWeight(format, quantity, length) {
  const a3Equivalent = calculateUVDTFA3EquivalentSheets(format, quantity, length);
  const qty = Math.ceil(a3Equivalent);
  
  const { weights } = getConfig();
  const slabs = weights.UV_DTF_SHIPPING_SLABS || [];
  const matched = slabs.find(s => qty >= s.min && qty <= s.max);
  if (matched) {
    return matched.weight;
  }
  if (slabs.length > 0) {
    return slabs[slabs.length - 1].weight;
  }
  return 0.2; // default fallback
}

/**
 * Get shipping weight for Fabric DTF using WEIGHT_CONFIG.
 */
export function getFabricWeight(totalMeters) {
  const combinedMeters = totalMeters;
  let matchedSlab = WEIGHT_CONFIG[0];
  for (let i = 0; i < WEIGHT_CONFIG.length; i++) {
    if (WEIGHT_CONFIG[i].meter <= combinedMeters) {
      matchedSlab = WEIGHT_CONFIG[i];
    } else {
      break;
    }
  }

  const actualWeight = matchedSlab.actualWeight;
  let volumetricWeight = 0;
  if (matchedSlab.l && matchedSlab.b && matchedSlab.h) {
    volumetricWeight = (matchedSlab.l * matchedSlab.b * matchedSlab.h) / 5000;
  }

  let finalWeight = 0;
  if (matchedSlab.overrideWeight !== undefined) {
    finalWeight = matchedSlab.overrideWeight;
  } else {
    finalWeight = Math.max(actualWeight, volumetricWeight);
  }

  return Math.max(finalWeight, 0.01);
}

/**
 * Calculate shipping cost for a single courier partner.
 *
 * @param {string} partnerKey - e.g., 'bluedart'
 * @param {number} totalMeters
 * @param {number} quantity
 * @param {number} [weightOverride] - Pre-calculated weight (e.g. for UV DTF or global state)
 * @returns {{ partnerKey, partnerName, shippingCost, countedWeight, eta, trackUrl, breakdown } | null}
 */
export function calculateShipping(partnerKey, totalMeters, quantity, weightOverride) {
  const { couriers } = getConfig();
  const partner = couriers[partnerKey];
  if (!partner) return null;

  let finalWeight = 0;
  if (weightOverride !== undefined && weightOverride !== null) {
    finalWeight = weightOverride;
  } else {
    finalWeight = getFabricWeight(totalMeters);
  }

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
 * @param {number} [weightOverride]
 * @returns {Array} sorted partner results
 */
export function calculateAllShipping(totalMeters, quantity, filter, weightOverride) {
  const { couriers } = getConfig();
  const results = Object.keys(couriers)
    .map(key => calculateShipping(key, totalMeters, quantity, weightOverride))
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
