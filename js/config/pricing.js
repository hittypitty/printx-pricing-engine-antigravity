/**
 * Pricing Constants
 */

export const MICRO_RATE_SQ_INCH = 0.5; // ₹ per sq inch for lengths < 1 meter
export const CONVERSION_COST = 50;     // ₹ per design
export const DEFAULT_DESIGN_COUNT = 0; // Default 0 — no auto-add; V2 will derive from image count

/**
 * Running-meter slabs. A slab applies from its `min` up to the next slab's `min`
 * (`max` is kept for display/reference only — lookups use `min`, so there are no gaps
 * like 9.995m falling between 9.99 and 10).
 */
export const METER_SLABS = [
  { min: 0,     max: 9.99,     rate: 225 },
  { min: 10,    max: 24.99,    rate: 213 },
  { min: 25,    max: 49.99,    rate: 201 },
  { min: 50,    max: 99.99,    rate: 189 },
  { min: 100,   max: Infinity, rate: 177 },
];

export const PACKAGING_COST = 20;  // ₹, applied only for courier delivery
export const TRANSPORT_COST = 50;  // ₹, local transport delivery

export const UV_DTF_PRICING = {
  A4_NORMAL: 177,
  A4_3D: 236,
  A3_SLABS: [
    { min: 1,   max: 20,       rate: 354 },
    { min: 21,  max: 49,       rate: 325 },
    { min: 50,  max: 99,       rate: 295 },
    { min: 100, max: Infinity, rate: 236 }
  ]
};

export const SUBLIMATION_PRICING = {
  A4: 20,
  A3: 40,
  ROLL_RATE_PER_METER: 100,
  ROLL_MIN_PRICE: 20,
  ROLL_WIDTH: 24,
  ROLL_METER_INCHES: 39,
};
