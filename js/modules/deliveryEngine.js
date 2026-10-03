/**
 * Delivery Engine — Weight calculation, shipping cost, packaging
 * Pure function module — reads courier rates and weight config from config parameter.
 */

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
export const UV_DTF_HISTORICAL_WEIGHTS = {
  1: 0.15,
  2: 0.20,
  3: 0.20,
  4: 0.30,
  5: 0.30,
  6: 0.30,
  7: 0.35,
  8: 0.40,
  9: 0.45,
  10: 0.46,
  11: 0.50,
  12: 0.55,
  13: 0.60,
  14: 0.65,
  15: 0.70,
  20: 0.95,
  25: 1.15,
  30: 1.37,
  31: 1.35,
  35: 1.45,
  40: 1.70,
  45: 1.90,
  50: 2.10,
  55: 2.35,
  60: 2.55,
  65: 2.75,
  70: 3.00,
  75: 3.25,
  80: 3.35,
  100: 4.45
};

export function calculateInterpolatedUVDTFWeight(qty) {
  let matchedWeight = null;
  let lowerPoint = null;
  let higherPoint = null;
  let interpolatedWeight = null;
  let finalWeight = 0.0;

  if (qty <= 0) {
    finalWeight = 0.0;
  } else if (UV_DTF_HISTORICAL_WEIGHTS[qty] !== undefined) {
    matchedWeight = UV_DTF_HISTORICAL_WEIGHTS[qty];
    finalWeight = matchedWeight;
  } else {
    const keys = Object.keys(UV_DTF_HISTORICAL_WEIGHTS).map(Number).sort((a, b) => a - b);

    // Less than the smallest key (1)
    if (qty < keys[0]) {
      const x2 = keys[0];
      const y2 = UV_DTF_HISTORICAL_WEIGHTS[x2];
      lowerPoint = { qty: 0, weight: 0.0 };
      higherPoint = { qty: x2, weight: y2 };
      interpolatedWeight = (qty / x2) * y2;
      finalWeight = Math.round(interpolatedWeight * 20) / 20;
    }
    // Greater than the largest key (100)
    else if (qty > keys[keys.length - 1]) {
      const x1 = keys[keys.length - 2]; // 80
      const y1 = UV_DTF_HISTORICAL_WEIGHTS[x1]; // 3.35
      const x2 = keys[keys.length - 1]; // 100
      const y2 = UV_DTF_HISTORICAL_WEIGHTS[x2]; // 4.45
      const slope = (y2 - y1) / (x2 - x1);
      lowerPoint = { qty: x1, weight: y1 };
      higherPoint = { qty: x2, weight: y2 };
      interpolatedWeight = y2 + (qty - x2) * slope;
      finalWeight = Math.round(interpolatedWeight * 20) / 20;
    }
    // Between two keys
    else {
      let x1 = keys[0];
      let y1 = UV_DTF_HISTORICAL_WEIGHTS[x1];
      let x2 = keys[0];
      let y2 = UV_DTF_HISTORICAL_WEIGHTS[x2];

      for (let i = 0; i < keys.length - 1; i++) {
        if (qty >= keys[i] && qty <= keys[i + 1]) {
          x1 = keys[i];
          y1 = UV_DTF_HISTORICAL_WEIGHTS[x1];
          x2 = keys[i + 1];
          y2 = UV_DTF_HISTORICAL_WEIGHTS[x2];
          break;
        }
      }

      lowerPoint = { qty: x1, weight: y1 };
      higherPoint = { qty: x2, weight: y2 };
      interpolatedWeight = y1 + ((qty - x1) / (x2 - x1)) * (y2 - y1);
      finalWeight = Math.round(interpolatedWeight * 20) / 20;
    }
  }

  return finalWeight;
}

/**
 * Get shipping weight for UV DTF based on A3 equivalent sheets.
 */
export function getUVDTFWeight(format, quantity, length) {
  const a3Equivalent = calculateUVDTFA3EquivalentSheets(format, quantity, length);
  const qty = Math.ceil(a3Equivalent);
  return calculateInterpolatedUVDTFWeight(qty);
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
 * @param {object} config - Configuration object
 * @returns {{ partnerKey, partnerName, shippingCost, countedWeight, eta, trackUrl, breakdown } | null}
 */
export function calculateShipping(partnerKey, totalMeters, quantity, weightOverride, config) {
  if (!config) {
    throw new Error('calculateShipping: config is required');
  }
  const { couriers } = config;
  const partner = couriers[partnerKey];
  if (!partner) return null;

  let finalWeight = 0;
  if (weightOverride !== undefined && weightOverride !== null) {
    finalWeight = weightOverride;
  } else {
    finalWeight = getFabricWeight(totalMeters);
  }

  let shippingCost = 0;
  let breakdown = '';

  if (partner.slabs && Array.isArray(partner.slabs)) {
    // Exact fixed slab mapping
    const matchedSlab = partner.slabs.find(s => finalWeight <= s.maxWeight + 0.00001);
    if (!matchedSlab) {
      // Exceeds maximum supported weight slab (> 20 kg) - do not invent/extrapolate rate
      return null;
    }
    shippingCost = matchedSlab.rate;
    breakdown = `${partner.name} (Up to ${matchedSlab.maxWeight >= 1 ? matchedSlab.maxWeight + ' kg' : (matchedSlab.maxWeight * 1000) + ' g'})`;
  } else if (partner.slab !== undefined && partner.base !== undefined) {
    const slabCount = Math.ceil(finalWeight / partner.slab);
    shippingCost = partner.base + (Math.max(slabCount - 1, 0) * (partner.add || 0));
    breakdown = `${partner.name} (${slabCount} slabs)`;
  } else {
    return null;
  }

  return {
    partnerKey,
    partnerName: partner.name,
    shippingCost,
    countedWeight: Math.round(finalWeight * 100) / 100,
    eta: partner.eta,
    trackUrl: partner.trackUrl,
    breakdown,
  };
}

/**
 * Calculate all courier options, with optional filter/sort.
 *
 * @param {number} totalMeters
 * @param {number} quantity
 * @param {string} filter - 'all' | 'cheapest' | 'fastest'
 * @param {number} [weightOverride]
 * @param {object} config - Configuration object
 * @returns {Array} sorted partner results
 */
export function calculateAllShipping(totalMeters, quantity, filter, weightOverride, config) {
  if (!config) {
    throw new Error('calculateAllShipping: config is required');
  }
  const { couriers } = config;
  const results = Object.keys(couriers)
    .map(key => calculateShipping(key, totalMeters, quantity, weightOverride, config))
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
 * @param {string} deliveryMethod - 'pickup' | 'courier' | 'transport'
 * @param {object} config - Configuration object
 * @returns {number} 0 or PACKAGING_COST
 */
export function getPackagingCost(deliveryMethod, config) {
  if (!config) {
    throw new Error('getPackagingCost: config is required');
  }
  const { pricing } = config;
  return deliveryMethod === 'courier' ? pricing.PACKAGING_COST : 0;
}

/**
 * Get local transport cost (from config, default ₹50).
 */
export function getTransportCost(config) {
  const cost = config && config.pricing ? config.pricing.TRANSPORT_COST : undefined;
  return cost !== undefined ? cost : 50;
}
