/**
 * Pricing Engine — Sheet pricing, micro-pricing, slab pricing, conversion cost
 * Pure function module — width-agnostic (uses pre-computed totalSqInches from formatParser).
 * Reads all rates from config parameter (admin-editable).
 */

/**
 * Calculate print cost using V1 rules exactly.
 * Decision tree:
 *   1. Sheet format (A4/A3/A2) → fixed price × quantity
 *   2. Meters + totalMeters < 1 → micro-pricing (sqInches × rate)
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
  const { pricing, formats, uvDtfPricing, sublimationPricing = {} } = config;
  const { format, totalMeters, totalSqInches, quantity, isSheetFormat, printTechnology, uvPrintType, length } = dims;

  // Sublimation Logic
  if (printTechnology === 'sublimation') {
    const a4Price = sublimationPricing.A4 || 20;
    const a3Price = sublimationPricing.A3 || 40;
    const rollRate = sublimationPricing.ROLL_RATE_PER_METER || 100;
    const minRollPrice = sublimationPricing.ROLL_MIN_PRICE || 20;

    if (format === 'A4') {
      const printCost = a4Price * quantity;
      const effectiveRate = totalSqInches > 0 ? (printCost / totalSqInches).toFixed(2) : '0.00';
      return {
        printCost,
        effectiveRate,
        rateApplied: a4Price,
        methodLabel: 'Sublimation A4',
        breakdown: `${quantity} pcs × ₹${a4Price} / pc`,
      };
    } else if (format === 'A3') {
      const printCost = a3Price * quantity;
      const effectiveRate = totalSqInches > 0 ? (printCost / totalSqInches).toFixed(2) : '0.00';
      return {
        printCost,
        effectiveRate,
        rateApplied: a3Price,
        methodLabel: 'Sublimation A3',
        breakdown: `${quantity} pcs × ₹${a3Price} / pc`,
      };
    } else {
      // Roll / Custom / Meters
      const len = length || (totalMeters * 39) || 0;
      const calculatedPrice = (len / 39) * rollRate;
      const finalPrice = Math.max(minRollPrice, calculatedPrice);
      // Format printCost: if integer keep whole, otherwise round to 2 decimal places
      const printCost = Number(finalPrice.toFixed(2));
      const effectiveRate = totalSqInches > 0 ? (printCost / totalSqInches).toFixed(2) : '0.00';
      return {
        printCost,
        effectiveRate,
        rateApplied: rollRate,
        methodLabel: 'Sublimation Roll',
        breakdown: `${len}" running @ ₹${rollRate} / m (min ₹${minRollPrice})`,
      };
    }
  }

  // UV DTF Logic
  if (printTechnology === 'uv_dtf') {
    if (format === 'Custom') {
      const slabs = uvDtfPricing.A3_SLABS;
      const slab = slabs.find(s => quantity >= s.min && quantity <= s.max);
      const a3Rate = slab ? slab.rate : slabs[slabs.length - 1].rate;
      const rawPerPiecePrice = a3Rate * (length / 16);
      const rate = Math.round(rawPerPiecePrice);
      const printCost = rate * quantity;
      const effectiveRate = totalSqInches > 0 ? (printCost / totalSqInches).toFixed(2) : '0.00';
      return {
        printCost,
        effectiveRate,
        rateApplied: rate,
        methodLabel: `UV Custom`,
        breakdown: `${quantity} pcs × ₹${rate} / pc`,
      };
    }

    if (format === 'A4') {
      const rate = uvPrintType === '3d' ? uvDtfPricing.A4_3D : uvDtfPricing.A4_NORMAL;
      const printCost = rate * quantity;
      const effectiveRate = totalSqInches > 0 ? (printCost / totalSqInches).toFixed(2) : '0.00';
      return {
        printCost,
        effectiveRate,
        rateApplied: rate,
        methodLabel: `UV A4 ${uvPrintType === '3d' ? '3D' : 'Normal'}`,
        breakdown: `${quantity} pcs × ₹${rate} / pc`,
      };
    } else {
      const slabs = uvDtfPricing.A3_SLABS;
      const slab = slabs.find(s => quantity >= s.min && quantity <= s.max);
      const rate = slab ? slab.rate : slabs[slabs.length - 1].rate;
      const printCost = rate * quantity;
      const effectiveRate = totalSqInches > 0 ? (printCost / totalSqInches).toFixed(2) : '0.00';
      return {
        printCost,
        effectiveRate,
        rateApplied: rate,
        methodLabel: `UV A3`,
        breakdown: `${quantity} pcs × ₹${rate} / pc`,
      };
    }
  }

  // 1. Sheet format → fixed price × quantity
  if (isSheetFormat) {
    const fmt = formats.FORMATS[format];
    const printCost = fmt.fixedPrice * quantity;
    const effectiveRate = totalSqInches > 0 ? (printCost / totalSqInches).toFixed(2) : '0.00';
    return {
      printCost,
      effectiveRate,
      rateApplied: fmt.fixedPrice,
      methodLabel: 'Fixed Sheet Price',
      breakdown: `${quantity} pcs × ₹${fmt.fixedPrice} / pc`,
    };
  }

  // 2. Micro-pricing (< 1 meter)
  if (totalMeters < 1 && totalMeters > 0) {
    const rate = pricing.MICRO_RATE_SQ_INCH || 0.5;
    const printCost = Math.ceil(totalSqInches * rate);
    const effectiveRate = rate.toFixed(2);
    
    return {
      printCost,
      effectiveRate,
      rateApplied: rate,
      methodLabel: 'Micro-Pricing (< 1m)',
      breakdown: `${totalSqInches.toFixed(2)} sq in × ₹${rate} / sq in`,
    };
  }

  // 3. Slab pricing (>= 1 meter)
  const slabs = pricing.METER_SLABS;
  const slab = slabs.find(s => totalMeters >= s.min && totalMeters <= s.max);
  const rate = slab ? slab.rate : slabs[slabs.length - 1].rate;
  const printCost = Math.ceil(totalMeters * rate);
  const effectiveRate = totalSqInches > 0 ? (printCost / totalSqInches).toFixed(2) : '0.00';

  return {
    printCost,
    effectiveRate,
    rateApplied: rate,
    methodLabel: 'Running Meter',
    breakdown: `${totalMeters.toFixed(2)} meters × ₹${rate} / m`,
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

