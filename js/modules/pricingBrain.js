/**
 * Pricing Brain — Unified Calculation Entry Point
 * Stateless module orchestrating validation, parsing, grid packing, pricing, delivery, and quote generation.
 */

import { validateInputs } from './validationEngine.js';
import { resolveDimensions } from './formatParser.js';
import { calculatePrintCost, calculateConversionCost } from './pricingEngine.js';
import {
  calculateShipping,
  calculateAllShipping,
  getPackagingCost,
  getTransportCost,
  getBestCourier,
  getUVDTFWeight,
  getFabricWeight,
  calculateUVDTFA3EquivalentSheets,
} from './deliveryEngine.js';
import { generateQuote } from './quoteGenerator.js';
import { lineTotal, describeOptions } from './dropshipEngine.js';
import {
  getPrintableWidthFor,
  getImageWidthLimitFor,
  UV_SHEET_WIDTH,
  UV_A3_LENGTH,
  UV_CUSTOM_MAX_LENGTH,
} from '../config/formats.js';

/**
 * Slab lookup — same rule as the original pricing (min <= value <= max,
 * otherwise the last slab). Kept identical so prices do not change.
 */
function pickSlab(slabs, value) {
  const list = slabs || [];
  return list.find(s => value >= s.min && value <= s.max) || list[list.length - 1] || null;
}

// Default rates for static/ERP products that are not part of the standard core DTF slabs
const DEFAULT_ERP_RATES = {
  'Sublimation': {
    'A4': 20,
    'A3': 40,
    'Meter New': 100
  },
  'EP Stickers': {
    'EP Stickers A4': 800
  },
  'Dropship': {
    'Sipper': 200,
    'Sipper with Straw': 300,
    'Engrave': 25,
    'Sashes Plain': 30,
    'VC 100': 500,
    'Sublimation Tape': 140,
    'NT Sticker 12x18': 110,
    'Mug White': 100,
    'Badges Circle': 25,
    'Wall Clock': 350
  }
};

const SIZE_TOLERANCE = 0.1; // inches — allowance when matching a design to a sheet size

/**
 * Helper to calculate required sheets and stickers per sheet for UV DTF.
 * Groups identical sticker sizes (ignoring orientation) to pack them together.
 * Returns totalSheets = Infinity if any design cannot fit on the sheet.
 */
export function calculateUVDTFSheets(items, sheetW, sheetH) {
  const groups = {};
  items.forEach(item => {
    const w = Number(item.width || item.w || 0);
    const h = Number(item.length || item.height || item.h || 0);
    const qty = Number(item.quantity || item.qty || 1);
    if (w <= 0 || h <= 0 || qty <= 0) return;

    // Sort to group rotated items of the same dimensions together
    const minD = Math.min(w, h).toFixed(2);
    const maxD = Math.max(w, h).toFixed(2);
    const key = `${minD}x${maxD}`;

    if (!groups[key]) {
      groups[key] = { w: Math.min(w, h), h: Math.max(w, h), qty: 0 };
    }
    groups[key].qty += qty;
  });

  let totalSheets = 0;
  let firstGroupCapacity = 0;
  let isFirst = true;

  Object.values(groups).forEach(g => {
    const gap = 0.0787; // 2mm in inches

    // Option 1: Original orientation
    const fitX1 = Math.floor((sheetW + gap) / (g.w + gap));
    const fitY1 = Math.floor((sheetH + gap) / (g.h + gap));
    const fit1 = fitX1 * fitY1;

    // Option 2: Rotated 90 degrees orientation
    const fitX2 = Math.floor((sheetW + gap) / (g.h + gap));
    const fitY2 = Math.floor((sheetH + gap) / (g.w + gap));
    const fit2 = fitX2 * fitY2;

    const maxFit = Math.max(fit1, fit2);
    if (maxFit === 0) {
      totalSheets = Infinity;
      return;
    }
    totalSheets += Math.ceil(g.qty / maxFit);

    if (isFirst) {
      firstGroupCapacity = maxFit;
      isFirst = false;
    }
  });

  return {
    totalSheets: Math.max(1, totalSheets),
    stickersPerSheet: firstGroupCapacity,
  };
}

/**
 * Helper to calculate how many stickers of a given size fit onto a sheet/meter.
 */
export function calculateStickersPerSheet(imgWidth, imgLength, sheetW, sheetH, margin = 0.2) {
  if (imgWidth <= 0 || imgLength <= 0 || sheetW <= 0 || sheetH <= 0) return 0;
  // Option 1: Original orientation
  const fitX1 = Math.floor((sheetW + margin) / (imgWidth + margin));
  const fitY1 = Math.floor((sheetH + margin) / (imgLength + margin));
  const fit1 = fitX1 * fitY1;

  // Option 2: Rotated 90 degrees
  const fitX2 = Math.floor((sheetW + margin) / (imgLength + margin));
  const fitY2 = Math.floor((sheetH + margin) / (imgWidth + margin));
  const fit2 = fitX2 * fitY2;

  return Math.max(fit1, fit2);
}

// ======================================================================
// Shared helpers
// ======================================================================

const ZERO_RESULT = {
  printCost: 0, effectiveRate: '0.00', rateApplied: 0, methodLabel: '', printBreakdown: '',
  conversionCost: 0, conversionBreakdown: '', packagingCost: 0,
  shippingCost: 0, partnerName: '', countedWeight: 0, eta: '',
  shippingBreakdown: '', allPartnerResults: [], recommendedPartner: null,
  finalTotal: 0, quoteText: '',
};

/**
 * Resolve delivery charges for a given weight.
 */
function resolveDelivery({ deliveryMethod, courierFilter, selectedPartner }, totalMeters, quantity, weight, config) {
  const packagingCost = getPackagingCost(deliveryMethod, config);
  const transportCost = getTransportCost(config);
  const allPartnerResults = deliveryMethod === 'courier'
    ? calculateAllShipping(totalMeters, quantity, courierFilter, weight, config)
    : [];

  let selected = null;
  let recommendedPartner = null;
  if (deliveryMethod === 'courier' && allPartnerResults.length > 0) {
    recommendedPartner = getBestCourier(allPartnerResults);
    selected = (selectedPartner && allPartnerResults.find(p => p.partnerKey === selectedPartner))
      || allPartnerResults.find(p => p.partnerKey === recommendedPartner);
  }

  const isTransport = deliveryMethod === 'transport';
  return {
    packagingCost,
    allPartnerResults,
    recommendedPartner,
    selectedPartner: selected ? selected.partnerKey : null,
    shippingCost: isTransport ? transportCost : (selected ? selected.shippingCost : 0),
    partnerName: isTransport ? 'Local Transport' : (selected ? selected.partnerName : (deliveryMethod === 'courier' ? 'No courier available' : 'Office Pickup')),
    countedWeight: selected ? selected.countedWeight : Math.round(weight * 100) / 100,
    eta: isTransport ? '' : (selected ? selected.eta : ''),
    shippingBreakdown: isTransport ? `Local Transport (₹${transportCost})` : (selected ? selected.breakdown : ''),
  };
}

/**
 * Merge cart totals (if any) into a result and attach the WhatsApp quote.
 */
function finalize(result, s, config) {
  if (s.cart && s.cart.length > 0) {
    Object.assign(result, calculateCart(s.cart, s.deliveryMethod, s.courierFilter, s.selectedPartner, config));
  }
  result.quoteText = generateQuote(result);
  return result;
}

/**
 * Invalid current input. If the cart already has items, their totals and quote
 * are still shown — only "Add to Quote" is blocked.
 */
function buildInvalid(error, s, config) {
  const result = {
    ...ZERO_RESULT,
    isValid: false,
    validationError: error,
    printTechnology: s.printTechnology,
    uvPrintType: s.uvPrintType,
    deliveryMethod: s.deliveryMethod,
    courierFilter: s.courierFilter,
    cart: s.cart,
    activePrintCost: 0,
    activeConversionCost: 0,
  };
  if (s.cart && s.cart.length > 0) {
    return finalize(result, s, config);
  }
  return result;
}

function fmtIn(n) {
  return Number(n).toFixed(2).replace(/\.?0+$/, '');
}

// ======================================================================
// Cart
// ======================================================================

/**
 * Helper to calculate a complete cart and aggregate costs.
 */
export function calculateCart(cart, deliveryMethod, courierFilter, selectedPartner, config) {
  const totalPrintCost = cart.reduce((sum, item) => sum + item.printCost, 0);
  const totalConversionCost = cart.reduce((sum, item) => sum + item.conversionCost, 0);

  // 1. UV DTF sheets weight
  const totalUVA3Sheets = cart
    .filter(item => item.printTechnology === 'uv_dtf')
    .reduce((sum, item) => sum + calculateUVDTFA3EquivalentSheets(item.format, item.quantity, item.length), 0);
  const uvWeight = totalUVA3Sheets > 0 ? getUVDTFWeight('A3', totalUVA3Sheets, 16) : 0;

  // 2. Fabric DTF & Sublimation meters weight
  const totalRunningMeters = cart
    .filter(item => item.printTechnology === 'fabric' || item.printTechnology === 'sublimation')
    .reduce((sum, item) => sum + (item.totalMeters || 0), 0);
  const fabricWeight = totalRunningMeters > 0 ? getFabricWeight(totalRunningMeters) : 0;

  // 3. Dropship parcels (weight is entered per line)
  const dropshipWeight = cart
    .filter(item => item.printTechnology === 'dropship')
    .reduce((sum, item) => sum + (Number(item.weight) || 0), 0);

  const combinedWeightVal = uvWeight + fabricWeight + dropshipWeight;
  const delivery = resolveDelivery({ deliveryMethod, courierFilter, selectedPartner }, totalRunningMeters, 1, combinedWeightVal, config);

  const finalTotal = Math.ceil(totalPrintCost + totalConversionCost + delivery.packagingCost + delivery.shippingCost);

  // Print breakdown for cart
  const printBreakdown = cart.map(item => {
    if (item.printTechnology === 'dropship') {
      return `${item.variant} × ${item.quantity} (₹${Math.ceil(item.printCost)})`;
    }
    const tech = item.printTechnology === 'uv_dtf' ? 'UV ' : (item.printTechnology === 'sublimation' ? 'Sublimation ' : '');
    if (!item.isSheetFormat) {
      const label = item.printTechnology === 'sublimation' ? 'Sublimation' : 'Fabric';
      return `${item.totalMeters.toFixed(2)}m ${label} (₹${Math.ceil(item.printCost)})`;
    }
    return `${tech}${item.format} × ${item.quantity} (₹${Math.ceil(item.printCost)})`;
  }).join(' + ');

  // Conversion breakdown for cart
  const conversionBreakdown = cart
    .filter(item => item.conversionCost > 0)
    .map(item => `${item.format}: ${item.conversionBreakdown}`)
    .join(' | ') || 'None';

  const totalSqInches = cart.reduce((sum, item) => sum + (item.totalSqInches || 0), 0);
  const effectiveRate = totalSqInches > 0 ? (totalPrintCost / totalSqInches).toFixed(2) : '0.00';

  return {
    printCost: totalPrintCost,
    printBreakdown,
    conversionCost: totalConversionCost,
    conversionBreakdown,
    ...delivery,
    finalTotal,
    effectiveRate
  };
}

// ======================================================================
// ERP
// ======================================================================

/**
 * Calculates rate and total for standard ERP categories.
 * (Pricing logic unchanged from the original engine.)
 */
export function calculateERPProduct(category, variant, quantity, config) {
  let rate = 0;
  let total = 0;

  // 1. Fabric Heat DTF
  if (category === 'Fabric Heat DTF') {
    if (variant === 'H-DTF-A4') {
      rate = config.formats?.FORMATS?.A4?.fixedPrice || 70;
    } else if (variant === 'H-DTF-A3') {
      rate = config.formats?.FORMATS?.A3?.fixedPrice || 120;
    } else if (variant === 'H-DTF-A2') {
      rate = config.formats?.FORMATS?.A2?.fixedPrice || 250;
    } else if (variant === 'Custom Inches') {
      rate = 12; // 24" width * 0.5 per sq inch
    } else if (variant === 'Meter') {
      if (quantity < 1) {
        // ERP `< 1m` switch to MICRO PRICING (24" width * 39" * 0.5 = 468 per meter)
        rate = 468;
      } else {
        const slab = pickSlab(config.pricing?.METER_SLABS, quantity);
        rate = slab ? slab.rate : 177;
      }
    }
    total = rate * quantity;
  }
  // 2. UV DTF
  else if (category === 'UV DTF') {
    const uvDtfPricing = config.uvDtfPricing || {};
    if (variant === 'A4') {
      rate = uvDtfPricing.A4_NORMAL || 177;
    } else if (variant === '3D UV DTF A4') {
      rate = uvDtfPricing.A4_3D || 236;
    } else if (variant === 'A3') {
      const slab = pickSlab(uvDtfPricing.A3_SLABS, quantity);
      rate = slab ? slab.rate : 236;
    }
    total = rate * quantity;
  }
  // 3. Sublimation / EP Stickers / Dropship
  else {
    const rates = DEFAULT_ERP_RATES[category] || {};
    rate = rates[variant] || 0;
    total = rate * quantity;
  }

  return { rate, total };
}

function calculateERPQuote(inputs, config) {
  const lineItems = inputs.products.map(p => {
    const { rate, total } = calculateERPProduct(p.category, p.variant || '', p.quantity || 0, config);
    return { ...p, rate, total };
  });

  const productTotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const manualAdjustment = Number(inputs.manualAdjustment || 0);
  const orderAmount = productTotal > 0 ? (productTotal + manualAdjustment) : Number(inputs.orderAmount || 0);

  // Shipping calculations for ERP
  const deliveryMethod = (inputs.deliveryType === 'Courier' || inputs.shippingCost > 0) ? 'courier' : 'pickup';
  const packagingCost = getPackagingCost(deliveryMethod, config);
  let shippingCost = Number(inputs.shippingCost || 0);

  // Re-estimate weight and shipping if no shipping cost manually entered yet
  if (inputs.deliveryType === 'Courier' && !shippingCost) {
    const totalFabricMeters = lineItems
      .filter(item => item.category === 'Fabric Heat DTF' && (item.variant === 'Meter' || item.variant === 'Custom Inches'))
      .reduce((sum, item) => sum + (item.variant === 'Custom Inches' ? item.quantity / 39 : (item.quantity || 0)), 0);
    const fabricWeight = totalFabricMeters > 0 ? getFabricWeight(totalFabricMeters) : 0;

    const totalUVA3Sheets = lineItems
      .filter(item => item.category === 'UV DTF')
      .reduce((sum, item) => sum + calculateUVDTFA3EquivalentSheets(item.variant, item.quantity, 16), 0);
    const uvWeight = totalUVA3Sheets > 0 ? getUVDTFWeight('A3', totalUVA3Sheets, 16) : 0;

    const totalWeight = fabricWeight + uvWeight;

    // Select courier key based on name lookup (e.g. "Bluedart (Fastest)" -> "bluedart")
    let courierKey = 'delhivery'; // default fallback
    if (inputs.preferredCourier) {
      const name = inputs.preferredCourier.toLowerCase();
      if (name.includes('bluedart')) courierKey = 'bluedart';
      else if (name.includes('dtdc')) courierKey = 'dtdc';
      else if (name.includes('xpressbees')) courierKey = 'xpressbees';
      else if (name.includes('delhivery')) courierKey = 'delhivery';
    }

    const shipResult = calculateShipping(courierKey, totalFabricMeters, 1, totalWeight, config);
    shippingCost = shipResult ? shipResult.shippingCost : 0;
  }

  const finalTotal = Math.ceil(orderAmount + shippingCost + Number(inputs.extraCharges || 0));

  return {
    printCost: productTotal,
    shippingCost,
    packagingCost,
    conversionCost: 0,
    finalTotal,
    lineItems
  };
}

// ======================================================================
// Auto mode (images / manual sizes)
// ======================================================================

function getAutoItems(s) {
  if (s.inputMode === 'image') {
    return (s.images || [])
      .filter(img => img.isValid && (!img.hasWarning || img.isOverridden))
      .map(img => ({ ...img, quantity: img.quantity || 1 }));
  }
  return (s.manualSizes || [])
    .map((sz, i) => ({
      isValid: true,
      name: `Size ${i + 1}`,
      width: Number(sz.width) || 0,
      length: Number(sz.height) || 0,
      quantity: Number(sz.qty) || 1,
    }))
    .filter(item => item.width > 0 && item.length > 0);
}

/**
 * Validate auto-mode inputs. Returns an error string or null.
 */
function validateAutoInputs(s, items, maxW) {
  if (s.inputMode === 'manual-size') {
    for (let i = 0; i < s.manualSizes.length; i++) {
      const sz = s.manualSizes[i];
      const hasW = sz.width !== '' && sz.width !== null && sz.width !== undefined;
      const hasH = sz.height !== '' && sz.height !== null && sz.height !== undefined;
      if (!hasW && !hasH) continue; // untouched empty row — ignore
      const w = Number(sz.width);
      const h = Number(sz.height);
      if (!hasW || !hasH || !(w > 0) || !(h > 0)) {
        return `Size ${i + 1}: enter both width and height (greater than 0).`;
      }
      if (w > maxW) {
        return `Size ${i + 1}: width ${fmtIn(w)}" is too big — width must be ≤ ${maxW}".`;
      }
    }
  } else {
    const images = s.images || [];
    const pending = images.filter(img => img.isValid && img.hasWarning && !img.isOverridden);
    if (items.length === 0) {
      if (pending.length > 0) return 'Confirm the actual width of the highlighted image(s) to calculate the price.';
      return 'No valid designs to price. Please upload transparent PNG files.';
    }
    const imgLimit = getImageWidthLimitFor(s.printTechnology);
    const tooBig = items.find(img => img.width > imgLimit);
    if (tooBig) {
      return `${tooBig.name || 'Design'} (${fmtIn(tooBig.width)}" × ${fmtIn(tooBig.length)}") is too big — width must be ≤ ${imgLimit}".`;
    }
  }

  if (items.length === 0) {
    return 'Enter at least one design size.';
  }
  return null;
}

function priceUVAuto(s, items, config) {
  // UV DTF Sheet Size Auto-Detection with tolerance
  let detectedFormat = null;
  let detectedLength = null;

  if (items.length === 1) {
    const item = items[0];
    const w = Math.min(item.width, item.length);
    const l = Math.max(item.width, item.length);

    if (w >= 10.8 && w <= 11.2) {
      if (l >= 7.8 && l <= 8.2) {
        detectedFormat = 'A4';
        detectedLength = 8;
      } else if (l >= 15.8 && l <= 16.2) {
        detectedFormat = 'A3';
        detectedLength = 16;
      } else if (l > 16.2 && l <= UV_CUSTOM_MAX_LENGTH + 0.2) {
        detectedFormat = 'Custom';
        detectedLength = Math.ceil(l);
      }
    }
  }

  const uvDtfPricing = config.uvDtfPricing;

  if (detectedFormat) {
    const qty = items[0].quantity;
    const dims = {
      printableWidth: UV_SHEET_WIDTH,
      pricingWidth: UV_SHEET_WIDTH,
      length: detectedLength,
      quantity: qty,
      totalMeters: (detectedLength * qty) / 39,
      totalSqInches: UV_SHEET_WIDTH * detectedLength * qty,
      isSheetFormat: true,
      stickersPerSheet: 1,
      computedImageLength: qty * detectedLength,
      format: detectedFormat,
    };
    const pricing = calculatePrintCost({ format: detectedFormat, printTechnology: 'uv_dtf', uvPrintType: s.uvPrintType, ...dims }, config);
    return { format: detectedFormat, dims, pricing };
  }

  // Every design must fit on an A3 sheet (11" × 16") in some orientation
  const tooBig = items.find(it => Math.min(it.width, it.length) > UV_SHEET_WIDTH + 1e-9 || Math.max(it.width, it.length) > UV_A3_LENGTH + 1e-9);
  if (tooBig) {
    return {
      error: `${tooBig.name || 'Design'} (${fmtIn(tooBig.width)}" × ${fmtIn(tooBig.length)}") doesn't fit on a UV sheet. Max ${UV_SHEET_WIDTH}" × ${UV_A3_LENGTH}" (or a single ${UV_SHEET_WIDTH}" × up to ${UV_CUSTOM_MAX_LENGTH}" custom sheet).`,
    };
  }

  const a4Rate = s.uvPrintType === '3d' ? uvDtfPricing.A4_3D : uvDtfPricing.A4_NORMAL;
  const a4 = calculateUVDTFSheets(items, UV_SHEET_WIDTH, 8);
  const priceA4 = a4.totalSheets * a4Rate; // Infinity if a design doesn't fit A4

  const a3 = calculateUVDTFSheets(items, UV_SHEET_WIDTH, UV_A3_LENGTH);
  const a3Rate = pickSlab(uvDtfPricing.A3_SLABS, a3.totalSheets).rate;
  const priceA3 = a3.totalSheets * a3Rate;

  // Choose A3 if it is cheaper, or if prices are equal but it uses fewer physical sheets
  const useA3 = priceA3 < priceA4 || (priceA3 === priceA4 && a3.totalSheets < a4.totalSheets);
  const format = useA3 ? 'A3' : 'A4';
  const sheets = useA3 ? a3.totalSheets : a4.totalSheets;
  const rate = useA3 ? a3Rate : a4Rate;
  const price = useA3 ? priceA3 : priceA4;
  const len = useA3 ? UV_A3_LENGTH : 8;

  const dims = {
    printableWidth: UV_SHEET_WIDTH,
    pricingWidth: UV_SHEET_WIDTH,
    length: len,
    quantity: sheets,
    totalMeters: (len * sheets) / 39,
    totalSqInches: UV_SHEET_WIDTH * len * sheets,
    isSheetFormat: true,
    stickersPerSheet: useA3 ? a3.stickersPerSheet : a4.stickersPerSheet,
    computedImageLength: len * sheets,
    format,
  };
  const pricing = {
    printCost: price,
    effectiveRate: dims.totalSqInches > 0 ? (price / dims.totalSqInches).toFixed(2) : '0.00',
    rateApplied: rate,
    methodLabel: useA3 ? 'UV A3' : `UV A4 ${s.uvPrintType === '3d' ? '3D' : 'Normal'}`,
    breakdown: `${sheets} pcs × ₹${rate} / pc`,
  };
  return { format, dims, pricing };
}

/**
 * Roll-based pricing (Fabric DTF / Sublimation) with automatic switch to a fixed
 * sheet format when the packed designs fit on it and it is cheaper.
 */
function priceRollAuto(s, items, lengthInches, config) {
  const isSublimation = s.printTechnology === 'sublimation';
  const formats = config.formats.FORMATS;
  const rollFormat = isSublimation ? 'Roll' : 'Meters';
  const printableWidth = getPrintableWidthFor(s.printTechnology);
  const packedWidth = s.computedImageWidth || printableWidth;
  const totalMeters = lengthInches / 39;
  const pricingWidth = isSublimation ? 24 : formats.Meters.pricingWidth;

  let bestFormat = rollFormat;
  let bestDims = {
    printableWidth,
    pricingWidth,
    length: lengthInches,
    quantity: 1,
    totalMeters,
    totalSqInches: pricingWidth * lengthInches,
    isSheetFormat: false,
  };
  let bestPricing = calculatePrintCost({ format: rollFormat, printTechnology: s.printTechnology, ...bestDims }, config);

  // Candidate sheet formats — same rules as the original engine (prices unchanged)
  const minDim = Math.min(packedWidth, lengthInches);
  const maxDim = Math.max(packedWidth, lengthInches);
  let candidates;
  if (isSublimation) {
    if (minDim <= 11.1 && maxDim <= 8.1) candidates = ['A4'];
    else if (minDim <= 11.1 && maxDim <= 16.1) candidates = ['A3'];
    else candidates = [];
  } else {
    candidates = Object.keys(formats).filter(f => f !== 'Meters' && f !== 'Roll');
  }

  candidates.forEach(fmtName => {
    const f = formats[fmtName];
    if (!f || !f.length) return;
    const fMin = Math.min(f.printableWidth, f.length);
    const fMax = Math.max(f.printableWidth, f.length);
    if (minDim > fMin + SIZE_TOLERANCE || maxDim > fMax + SIZE_TOLERANCE) return;

    const testDims = {
      printableWidth: f.printableWidth,
      pricingWidth: f.pricingWidth,
      length: f.length,
      quantity: 1,
      totalMeters: f.length / 39,
      totalSqInches: f.pricingWidth * f.length,
      isSheetFormat: true,
    };
    const testPricing = calculatePrintCost({ format: fmtName, printTechnology: s.printTechnology, ...testDims }, config);
    if (testPricing.printCost <= bestPricing.printCost) {
      bestFormat = fmtName;
      bestDims = testDims;
      bestPricing = testPricing;
    }
  });

  // Pieces per sheet / per meter (first design)
  if (items.length > 0) {
    const first = items[0];
    let sheetW = printableWidth;
    let sheetH = 39;
    if (bestFormat !== rollFormat && formats[bestFormat]) {
      sheetW = formats[bestFormat].printableWidth;
      sheetH = formats[bestFormat].length;
    }
    bestDims.stickersPerSheet = calculateStickersPerSheet(first.width, first.length, sheetW, sheetH, 0.2);
  }

  return { format: bestFormat, dims: bestDims, pricing: bestPricing };
}

function calculateAutoQuote(s, config) {
  const isUV = s.printTechnology === 'uv_dtf';
  const maxW = getPrintableWidthFor(s.printTechnology);
  const items = getAutoItems(s);

  const inputError = validateAutoInputs(s, items, maxW);
  if (inputError) return buildInvalid(inputError, s, config);

  let priced;
  if (isUV) {
    priced = priceUVAuto(s, items, config);
    if (priced.error) return buildInvalid(priced.error, s, config);
  } else {
    const lengthInches = s.computedImageLength;
    if (!lengthInches || lengthInches <= 0) {
      return buildInvalid('Could not calculate length. Please check your inputs.', s, config);
    }
    priced = priceRollAuto(s, items, lengthInches, config);
  }

  const { format, dims, pricing } = priced;
  const conversion = s.printTechnology === 'fabric'
    ? calculateConversionCost(s.conversions, config)
    : { conversionCost: 0, breakdown: '', breakdownList: [] };

  const weight = isUV
    ? getUVDTFWeight(dims.format || format, dims.quantity, dims.length)
    : getFabricWeight(dims.totalMeters);

  const delivery = resolveDelivery(s, dims.totalMeters, dims.quantity, weight, config);
  const finalTotal = Math.ceil(pricing.printCost + conversion.conversionCost + delivery.packagingCost + delivery.shippingCost);

  const result = {
    isValid: true,
    validationError: null,
    format,
    ...dims,
    printCost: pricing.printCost,
    effectiveRate: pricing.effectiveRate,
    rateApplied: pricing.rateApplied,
    methodLabel: pricing.methodLabel,
    printBreakdown: pricing.breakdown,
    conversionCost: conversion.conversionCost,
    conversionBreakdown: conversion.breakdown,
    ...delivery,
    finalTotal,
    activePrintCost: pricing.printCost,
    activeConversionCost: conversion.conversionCost,
    printTechnology: s.printTechnology,
    uvPrintType: s.uvPrintType,
    deliveryMethod: s.deliveryMethod,
    courierFilter: s.courierFilter,
    conversions: s.conversions,
    cart: s.cart,
  };

  return finalize(result, s, config);
}

// ======================================================================
// Dropship (ready products — rate per piece + print placements / add-ons)
// ======================================================================

function calculateDropshipQuote(s, config) {
  const d = s.dropship || {};
  const { qty, rate, total } = lineTotal(d.variant, d.qty, d.placements, d.addons);
  const weight = Math.max(0, Number(d.weight) || 0);
  const delivery = resolveDelivery(s, 0, qty, weight, config);
  const finalTotal = Math.ceil(total + delivery.packagingCost + delivery.shippingCost);
  const options = describeOptions(d.placements, d.addons);

  const result = {
    isValid: true,
    validationError: null,
    printCost: total,
    effectiveRate: '0.00',
    rateApplied: rate,
    methodLabel: 'Dropship',
    printBreakdown: `${d.variant} × ${qty} @ ₹${rate} / pc`,
    conversionCost: 0,
    conversionBreakdown: '',
    ...delivery,
    finalTotal,
    activePrintCost: total,
    activeConversionCost: 0,
    printTechnology: s.printTechnology,
    deliveryMethod: s.deliveryMethod,
    courierFilter: s.courierFilter,
    cart: s.cart,
    dropshipQty: qty,
    dropshipRate: rate,
    dropshipItem: { variant: d.variant, qty, rate, total, options },
  };

  return finalize(result, s, config);
}

// ======================================================================
// Manual mode (format + length/quantity)
// ======================================================================

function calculateManualQuote(s, config) {
  const formats = config.formats.FORMATS;
  const fmt = formats[s.format];
  const validation = validateInputs({
    format: s.format,
    quantity: s.quantity,
    rawLength: s.rawLength,
    printableWidth: fmt ? fmt.printableWidth : 0,
    printTechnology: s.printTechnology,
  }, config);

  if (!validation.isValid) {
    return buildInvalid(validation.error, s, config);
  }

  const dims = resolveDimensions(s.format, s.quantity, s.rawLength, config);

  const pricing = calculatePrintCost({
    format: s.format,
    printTechnology: s.printTechnology,
    uvPrintType: s.uvPrintType,
    ...dims
  }, config);

  const conversion = s.printTechnology === 'fabric'
    ? calculateConversionCost(s.conversions, config)
    : { conversionCost: 0, breakdown: '', breakdownList: [] };

  const weight = s.printTechnology === 'uv_dtf'
    ? getUVDTFWeight(s.format, dims.quantity, dims.length)
    : getFabricWeight(dims.totalMeters);

  const delivery = resolveDelivery(s, dims.totalMeters, dims.quantity, weight, config);
  const finalTotal = Math.ceil(pricing.printCost + conversion.conversionCost + delivery.packagingCost + delivery.shippingCost);

  const result = {
    isValid: true,
    validationError: null,
    ...dims,
    printCost: pricing.printCost,
    effectiveRate: pricing.effectiveRate,
    rateApplied: pricing.rateApplied,
    methodLabel: pricing.methodLabel,
    printBreakdown: pricing.breakdown,
    conversionCost: conversion.conversionCost,
    conversionBreakdown: conversion.breakdown,
    ...delivery,
    finalTotal,
    activePrintCost: pricing.printCost,
    activeConversionCost: conversion.conversionCost,
    printTechnology: s.printTechnology,
    uvPrintType: s.uvPrintType,
    deliveryMethod: s.deliveryMethod,
    courierFilter: s.courierFilter,
    conversions: s.conversions,
    cart: s.cart,
  };

  return finalize(result, s, config);
}

// ======================================================================
// Entry point
// ======================================================================

/**
 * Unified calculation engine entry point. Pure and stateless.
 *
 * @param {object} inputs - Interactive fields, image uploads, cart, or ERP orders
 * @param {object} config - Master configuration values
 * @returns {object} Calculated print/shipping costs, line items breakdown, WhatsApp quote
 */
export function calculateQuote(inputs, config) {
  if (!config) {
    throw new Error('calculateQuote: config is required');
  }

  // --- ERP Connection Entry Point ---
  if (inputs.products && Array.isArray(inputs.products)) {
    return calculateERPQuote(inputs, config);
  }

  const s = inputs;
  if (s.printTechnology === 'dropship') {
    return calculateDropshipQuote(s, config);
  }
  const isImageMode = s.inputMode === 'image' && s.images && s.images.length > 0;
  const isManualSizeMode = s.inputMode === 'manual-size' && s.manualSizes && s.manualSizes.length > 0;

  if (isImageMode || isManualSizeMode) {
    return calculateAutoQuote(s, config);
  }
  return calculateManualQuote(s, config);
}
