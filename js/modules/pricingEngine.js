/**
 * Pricing Engine — Sheet pricing, micro-pricing, slab pricing, conversion cost
 * Pure function module — width-agnostic (uses pre-computed totalSqInches from formatParser).
 * Reads all rates from config parameter (admin-editable).
 */

/**
 * Find the slab that applies to a value.
 * A slab applies from its `min` until the next slab's `min`, so there are no gaps
 * between e.g. max 9.99 and min 10. Values below the first slab use the first slab.
 *
 * @param {Array<{min:number, rate:number}>} slabs
 * @param {number} value
 * @returns {{min:number, max?:number, rate:number} | null}
 */
export function findSlab(slabs, value) {
  if (!Array.isArray(slabs) || slabs.length === 0) return null;
  const sorted = [...slabs].sort((a, b) => a.min - b.min);
  let match = sorted[0];
  for (const s of sorted) {
    if (value >= s.min) match = s;
    else break;
  }
  return match;
}

/**
 * Fabric DTF running-length price (shared by the UI engine and the ERP entry point).
 *
 *   >= 1 meter → meters × slab rate
 *   <  1 meter → sq-inch micro pricing, CAPPED at the price of 1 full meter
 *               (so a shorter print never costs more than a full meter)
 *
 * @param {number} totalMeters
 * @param {object} config
 * @returns {{ printCost:number, rate:number, isMicro:boolean, isCapped:boolean, sqInches:number }}
 */
export function calculateFabricRunningCost(totalMeters, config) {
  const { pricing, formats } = config;
  const meters = Math.max(0, Number(totalMeters) || 0);
  const rollWidth = (formats && formats.ROLL_WIDTH) || 24;
  const sqInches = rollWidth * meters * 39;

  if (meters <= 0) {
    return { printCost: 0, rate: 0, isMicro: false, isCapped: false, sqInches: 0 };
  }

  if (meters < 1) {
    const microRate = pricing.MICRO_RATE_SQ_INCH || 0.5;
    const microCost = Math.ceil(sqInches * microRate);
    const oneMeterCost = Math.ceil(findSlab(pricing.METER_SLABS, 1).rate * 1);
    const isCapped = oneMeterCost < microCost;
    return {
      printCost: isCapped ? oneMeterCost : microCost,
      rate: isCapped ? oneMeterCost : microRate,
      isMicro: true,
      isCapped,
      sqInches,
    };
  }

  const slab = findSlab(pricing.METER_SLABS, meters);
  return {
    printCost: Math.ceil(meters * slab.rate),
    rate: slab.rate,
    isMicro: false,
    isCapped: false,
    sqInches,
  };
}

/**
 * Calculate print cost using V1 rules exactly.
 * Decision tree:
 *   1. Sheet format (A4/A3/A2) → fixed price × quantity
 *   2. Meters + totalMeters < 1 → micro-pricing (sqInches × rate), capped at 1 meter price
 *   3. Meters + totalMeters >= 1 → slab pricing (meters × slab rate)
 *
 * @param {{
 *   format: string,
 *   totalMeters: number,
 *   totalSqInches: number,
 *   quantity: number,
 *   pricingWidth: number,
 *   length: number,
 *   isSheetFormat: boolean
 * }} dims
 * @param {object} config - Configuration object
 * @returns {{ printCost: number, rateApplied: number, methodLabel: string, breakdown: string }}
 */
export function calculatePrintCost(dims, config) {
  if (!config) {
    throw new Error('calculatePrintCost: config is required');
  }
  const { formats, uvDtfPricing, sublimationPricing = {} } = config;
  const { format, totalMeters, totalSqInches, quantity, isSheetFormat, printTechnology, uvPrintType, length } = dims;

  const effectiveRateOf = cost => (totalSqInches > 0 ? (cost / totalSqInches).toFixed(2) : '0.00');

  // Sublimation Logic
  if (printTechnology === 'sublimation') {
    const a4Price = sublimationPricing.A4 || 20;
    const a3Price = sublimationPricing.A3 || 40;
    const rollRate = sublimationPricing.ROLL_RATE_PER_METER || 100;
    const minRollPrice = sublimationPricing.ROLL_MIN_PRICE || 20;

    if (format === 'A4' || format === 'A3') {
      const unit = format === 'A4' ? a4Price : a3Price;
      const printCost = unit * quantity;
      return {
        printCost,
        effectiveRate: effectiveRateOf(printCost),
        rateApplied: unit,
        methodLabel: `Sublimation ${format}`,
        breakdown: `${quantity} pcs × ₹${unit} / pc`,
      };
    }

    // Roll / Custom / Meters
    const len = length || (totalMeters * 39) || 0;
    const calculatedPrice = (len / 39) * rollRate;
    const finalPrice = Math.max(minRollPrice, calculatedPrice);
    const printCost = Number(finalPrice.toFixed(2));
    return {
      printCost,
      effectiveRate: effectiveRateOf(printCost),
      rateApplied: rollRate,
      methodLabel: 'Sublimation Roll',
      breakdown: `${len}" running @ ₹${rollRate} / m (min ₹${minRollPrice})`,
    };
  }

  // UV DTF Logic
  if (printTechnology === 'uv_dtf') {
    if (format === 'Custom') {
      const a3Rate = findSlab(uvDtfPricing.A3_SLABS, quantity).rate;
      const rate = Math.round(a3Rate * (length / 16));
      const printCost = rate * quantity;
      return {
        printCost,
        effectiveRate: effectiveRateOf(printCost),
        rateApplied: rate,
        methodLabel: 'UV Custom',
        breakdown: `${quantity} pcs × ₹${rate} / pc`,
      };
    }

    if (format === 'A4') {
      const rate = uvPrintType === '3d' ? uvDtfPricing.A4_3D : uvDtfPricing.A4_NORMAL;
      const printCost = rate * quantity;
      return {
        printCost,
        effectiveRate: effectiveRateOf(printCost),
        rateApplied: rate,
        methodLabel: `UV A4 ${uvPrintType === '3d' ? '3D' : 'Normal'}`,
        breakdown: `${quantity} pcs × ₹${rate} / pc`,
      };
    }

    const rate = findSlab(uvDtfPricing.A3_SLABS, quantity).rate;
    const printCost = rate * quantity;
    return {
      printCost,
      effectiveRate: effectiveRateOf(printCost),
      rateApplied: rate,
      methodLabel: 'UV A3',
      breakdown: `${quantity} pcs × ₹${rate} / pc`,
    };
  }

  // 1. Sheet format → fixed price × quantity
  if (isSheetFormat) {
    const fmt = formats.FORMATS[format];
    const printCost = fmt.fixedPrice * quantity;
    return {
      printCost,
      effectiveRate: effectiveRateOf(printCost),
      rateApplied: fmt.fixedPrice,
      methodLabel: 'Fixed Sheet Price',
      breakdown: `${quantity} pcs × ₹${fmt.fixedPrice} / pc`,
    };
  }

  // 2 + 3. Running length (micro < 1m, capped; slab ≥ 1m)
  const run = calculateFabricRunningCost(totalMeters, config);

  if (run.isMicro) {
    if (run.isCapped) {
      return {
        printCost: run.printCost,
        effectiveRate: effectiveRateOf(run.printCost),
        rateApplied: run.rate,
        methodLabel: 'Micro-Pricing (capped at 1m)',
        breakdown: `${totalMeters.toFixed(2)} m → charged as 1 meter @ ₹${run.rate}`,
      };
    }
    return {
      printCost: run.printCost,
      effectiveRate: Number(run.rate).toFixed(2),
      rateApplied: run.rate,
      methodLabel: 'Micro-Pricing (< 1m)',
      breakdown: `${totalSqInches.toFixed(2)} sq in × ₹${run.rate} / sq in`,
    };
  }

  return {
    printCost: run.printCost,
    effectiveRate: effectiveRateOf(run.printCost),
    rateApplied: run.rate,
    methodLabel: 'Running Meter',
    breakdown: `${totalMeters.toFixed(2)} meters × ₹${run.rate} / m`,
  };
}

/**
 * Calculate conversion cost based on array of selected conversions.
 *
 * @param {Array<{id: string, type: string, qty: number}>} conversions
 * @param {object} config - Configuration object
 * @returns {{ conversionCost: number, breakdown: string, breakdownList: string[] }}
 */
export function calculateConversionCost(conversions, config) {
  if (!config) {
    throw new Error('calculateConversionCost: config is required');
  }
  const { pricing } = config;
  if (!conversions || conversions.length === 0) {
    return { conversionCost: 0, breakdown: '', breakdownList: [] };
  }

  const costPerUnit = pricing.CONVERSION_COST; // default 50
  let conversionCost = 0;
  const breakdownList = [];

  conversions.forEach(c => {
    const cost = c.qty * costPerUnit;
    conversionCost += cost;
    breakdownList.push(`${c.qty} × ${c.type} (₹${cost})`);
  });

  return {
    conversionCost,
    breakdown: breakdownList.join(' + ') + ` = ₹${conversionCost}`,
    breakdownList
  };
}
