/**
 * ConfigStore — Mutable configuration layer with localStorage persistence.
 *
 * Loads defaults from static config files on boot.
 * Overrides with any saved values from localStorage.
 * All modules read from getConfig() instead of static imports.
 * Admin panel writes via updateConfig().
 */

import { FORMATS, ROLL_WIDTH, PRINTABLE_WIDTH } from '../config/formats.js';
import { METER_SLABS, MICRO_RATE_SQ_INCH, CONVERSION_COST, DEFAULT_DESIGN_COUNT, PACKAGING_COST } from '../config/pricing.js';
import { COURIERS } from '../config/couriers.js';
import { WEIGHT_PER_METER_KG } from '../config/weights.js';

const STORAGE_KEY = 'dtf_admin_config';

// --- Deep clone utility ---
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj, replacer), reviver);
}

// JSON can't serialize Infinity — use sentinel string
function replacer(key, value) {
  if (value === Infinity) return '__INFINITY__';
  return value;
}
function reviver(key, value) {
  if (value === '__INFINITY__') return Infinity;
  return value;
}

function deepMerge(target, source) {
  const result = deepClone(target);
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key]) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = deepClone(source[key]);
    }
  }
  return result;
}

// --- Build defaults from static config files ---
function buildDefaults() {
  return {
    pricing: {
      METER_SLABS: deepClone(METER_SLABS),
      MICRO_RATE_SQ_INCH,
      CONVERSION_COST,
      DEFAULT_DESIGN_COUNT,
      PACKAGING_COST,
    },
    formats: {
      FORMATS: deepClone(FORMATS),
      ROLL_WIDTH,
      PRINTABLE_WIDTH,
    },
    couriers: deepClone(COURIERS),
    weights: {
      WEIGHT_PER_METER_KG,
    },
    branding: {
      logoUrl: '',  // No hardcoded logo — set via admin panel
      whatsappLink: 'https://wa.me/919876543210',
    },
  };
}

// --- Load from localStorage ---
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw, reviver) : {};
  } catch (e) {
    console.warn('ConfigStore: Failed to load from localStorage', e);
    return {};
  }
}

// --- Save to localStorage ---
function saveToStorage(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config, replacer));
  } catch (e) {
    console.warn('ConfigStore: Failed to save to localStorage', e);
  }
}

// --- State ---
const defaults = buildDefaults();
let config = deepMerge(defaults, loadFromStorage());
const listeners = [];

// --- Public API ---

/**
 * Get current config (shallow copy of top level).
 * @returns {object} The full config object
 */
export function getConfig() {
  return config;
}

/**
 * Get the original defaults (for reset / comparison).
 * @returns {object}
 */
export function getDefaults() {
  return buildDefaults();
}

/**
 * Update a config section. Merges partial into the section, persists, and notifies.
 * @param {string} section - 'pricing' | 'couriers' | 'weights' | 'formats' | 'branding'
 * @param {object} partial - Partial values to merge into that section
 */
export function updateConfig(section, partial) {
  if (section === 'couriers') {
    // Couriers is keyed by partner, merge each partner individually
    config.couriers = deepMerge(config.couriers, partial);
  } else if (config[section]) {
    config[section] = deepMerge(config[section], partial);
  }
  saveToStorage(config);
  listeners.forEach(fn => fn(config));
}

/**
 * Reset all config to defaults. Clears localStorage.
 */
export function resetConfig() {
  config = buildDefaults();
  localStorage.removeItem(STORAGE_KEY);
  listeners.forEach(fn => fn(config));
}

/**
 * Subscribe to config changes.
 * @param {function} fn - Callback receiving full config
 */
export function subscribeConfig(fn) {
  listeners.push(fn);
}
