/**
 * Pricing Constants
 */

export const CONVERSION_COST = 50;     // ₹ per design
export const DEFAULT_DESIGN_COUNT = 0; // Default 0 — no auto-add; V2 will derive from image count

export const METER_SLABS = [
  { min: 0,     max: 9.99,     rate: 225 },
  { min: 10,    max: 24.99,    rate: 213 },
  { min: 25,    max: 49.99,    rate: 201 },
  { min: 50,    max: 99.99,    rate: 189 },
  { min: 100,   max: Infinity, rate: 177 },
];

export const PACKAGING_COST = 20; // ₹, applied only for courier delivery
