/**
 * Delivery Engine — Weight calculation, shipping cost, packaging
 * Pure function module — reads courier rates and weight config from config parameter.
 */

import { WEIGHT_CONFIG } from '../config/weightConfig.js';
import { WEIGHT_PER_METER_KG } from '../config/weights.js';

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
 * Historical shipping weights (kg) for UV DTF by A3-equivalent sheet count.
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

/**
 * Interpolate UV DTF shipping weight from historical data (rounded to nearest 50g).
 * @param {number} qty - A3 equivalent sheet count
 * @returns {number} kg
 */
export function calculateInterpolatedUVDTFWeight(qty) {
  if (qty <= 0) return 0;
  if (UV_DTF_HISTORICAL_WEIGHTS[qty] !== undefined) return UV_DTF_HISTORICAL_WEIGHTS[qty];

  const keys = Object.keys(UV_DTF_HISTORICAL_WEIGHTS).map(Number).sort((a, b) => a - b);
  let interpolated;

  if (qty < keys[0]) {
    // Between 0 and the smallest key
    interpolated = (qty / keys[0]) * UV_DTF_HISTORICAL_WEIGHTS[keys[0]];
  } else if (qty > keys[keys.length - 1]) {
    // Extrapolate using the slope of the last two points
    const x1 = keys[keys.length - 2];
    const x2 = keys[keys.length - 1];
    const y1 = UV_DTF_HISTORICAL_WEIGHTS[x1];
    const y2 = UV_DTF_HISTORICAL_WEIGHTS[x2];
    interpolated = y2 + (qty - x2) * ((y2 - y1) / (x2 - x1));
  } else {
    let x1 = keys[0];
    let x2 = keys[0];
    for (let i = 0; i < keys.length - 1; i++) {
      if (qty >= keys[i] && qty <= keys[i + 1]) {
        x1 = keys[i];
        x2 = keys[i + 1];
        break;
      }
    }
    const y1 = UV_DTF_HISTORICAL_WEIGHTS[x1];
    const y2 = UV_DTF_HISTORICAL_WEIGHTS[x2];
    interpolated = y1 + ((qty - x1) / (x2 - x1)) * (y2 - y1);
  }

  return Math.round(interpolated * 20) / 20;
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
 *
 * Partial meters round UP to the next row (1.9m uses the 2m row, not 1m), so the
 * weight is never under-estimated. Beyond the last row, weight is extrapolated
 * at WEIGHT_PER_METER_KG per extra meter.
 */
export function getFabricWeight(totalMeters) {
  const meters = Math.max(0, Number(totalMeters) || 0);
  const last = WEIGHT_CONFIG[WEIGHT_CONFIG.length - 1];

  let actualWeight;
  let dims = null;

  if (meters > last.meter) {
    actualWeight = last.actualWeight + (meters - last.meter) * WEIGHT_PER_METER_KG;
  } else {
    const row = WEIGHT_CONFIG.find(r => r.meter >= meters) || last;
    actualWeight = row.actualWeight;
    if (row.overrideWeight !== undefined) return Math.max(row.overrideWeight, 0.01);
    if (row.l && row.b && row.h) dims = row;
  }

  const volumetricWeight = dims ? (dims.l * dims.b * dims.h) / 5000 : 0;
  const finalWeight = Math.max(actualWeight, volumetricWeight);
  return Math.max(Math.round(finalWeight * 100) / 100, 0.01);
}

/**
 * Calculate shipping cost for a single courier partner.
 *
 * Slab-rate couriers: `base` covers the first `baseWeight` kg; every started
 * `slab` kg above that adds `add`.
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

  const finalWeight = (weightOverride !== undefined && weightOverride !== null)
    ? weightOverride
    : getFabricWeight(totalMeters);

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
    const baseWeight = partner.baseWeight !== undefined ? partner.baseWeight : partner.slab;
    const extraWeight = Math.max(0, finalWeight - baseWeight);
    // Small epsilon so floating-point noise (e.g. 1.5000000001) doesn't add a slab
    const extraSlabs = extraWeight > 0.00001 ? Math.ceil(extraWeight / partner.slab - 0.00001) : 0;
    shippingCost = partner.base + extraSlabs * (partner.add || 0);
    breakdown = extraSlabs > 0
      ? `${partner.name} (${baseWeight} kg base + ${extraSlabs} × ${partner.slab} kg)`
      : `${partner.name} (up to ${baseWeight} kg)`;
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
      results.sort((a, b) => parseInt(a.eta) - parseInt(b.eta) || a.shippingCost - b.shippingCost);
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
 * Map a free-text courier name (e.g. from the ERP: "Bluedart (Fastest)", "DTDC Express")
 * to a courier key in config. Returns null if it can't be matched.
 */
export function resolveCourierKey(name, config) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  const couriers = (config && config.couriers) || {};
  const pick = key => (couriers[key] ? key : null);

  if (n.includes('blue')) return pick('bluedart');
  if (n.includes('dtdc')) return n.includes('express') ? pick('dtdc_express') : pick('dtdc_surface');
  if (n.includes('tirupati')) return pick('tirupati');
  if (n.includes('speed')) return pick('speed_post');
  if (n.includes('india post') || n.includes('indiapost')) return pick('india_post');

  // Exact key or exact display name
  if (couriers[n]) return n;
  const byName = Object.keys(couriers).find(k => couriers[k].name.toLowerCase() === n);
  return byName || null;
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
 * Get local transport cost.
 */
export function getTransportCost(config) {
  const cost = config && config.pricing ? config.pricing.TRANSPORT_COST : undefined;
  return cost !== undefined ? cost : 50;
}
