/**
 * Pricing Brain — Unified Calculation Entry Point
 * Stateless module orchestrating validation, parsing, grid packing, pricing, delivery, and quote generation.
 */

import { validateInputs } from './validationEngine.js';
import { resolveDimensions, parseLength } from './formatParser.js';
import { calculatePrintCost, calculateConversionCost } from './pricingEngine.js';
import { calculateShipping, calculateAllShipping, getPackagingCost, getBestCourier, getUVDTFWeight, getFabricWeight, calculateUVDTFA3EquivalentSheets } from './deliveryEngine.js';
import { calculatePackedDimensions } from './packingEngine.js';
import { generateQuote } from './quoteGenerator.js';

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

/**
 * Helper to calculate required sheets and stickers per sheet for UV DTF.
 * Groups identical sticker sizes (ignoring orientation) to pack them together.
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
    const stickersPerSheet = maxFit;
    const sheetsNeeded = Math.ceil(g.qty / stickersPerSheet);

    totalSheets += sheetsNeeded;

    if (isFirst) {
      firstGroupCapacity = stickersPerSheet;
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

  const combinedWeightVal = uvWeight + fabricWeight;

  // Delivery details:
  const packagingCost = getPackagingCost(deliveryMethod, config);
  const allPartnerResults = deliveryMethod === 'courier'
    ? calculateAllShipping(totalFabricMeters, 1, courierFilter, combinedWeightVal, config)
    : [];

  let selected = null;
  let recommendedPartner = null;
  if (deliveryMethod === 'courier' && allPartnerResults.length > 0) {
    recommendedPartner = getBestCourier(allPartnerResults);
    selected = selectedPartner
      ? allPartnerResults.find(p => p.partnerKey === selectedPartner) || allPartnerResults.find(p => p.partnerKey === recommendedPartner)
      : allPartnerResults.find(p => p.partnerKey === recommendedPartner);
  }

  const shippingCost = selected ? selected.shippingCost : 0;
  const partnerName = selected ? selected.partnerName : 'Office Pickup';
  const countedWeight = selected ? selected.countedWeight : Math.round(combinedWeightVal * 100) / 100;
  const eta = selected ? selected.eta : '';
  const shippingBreakdown = selected ? selected.breakdown : '';
  const finalTotal = Math.ceil(totalPrintCost + totalConversionCost + packagingCost + shippingCost);

  // Print breakdown for cart
  const printBreakdown = cart.map(item => {
    if (item.format === 'Meters') {
      return `${item.totalMeters.toFixed(2)}m Fabric (₹${item.printCost})`;
    }
    const tech = item.printTechnology === 'uv_dtf' ? 'UV ' : '';
    return `${tech}${item.format} × ${item.quantity} (₹${item.printCost})`;
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
    packagingCost,
    shippingCost,
    partnerName,
    countedWeight,
    eta,
    shippingBreakdown,
    allPartnerResults,
    recommendedPartner,
    selectedPartner: selected ? selected.partnerKey : null,
    finalTotal,
    effectiveRate
  };
}

/**
 * Calculates rate and total for standard ERP categories.
 */
export function calculateERPProduct(category, variant, quantity, config) {
  let rate = 0;
  let total = 0;

  // 1. Fabric Heat DTF
  if (category === 'Fabric Heat DTF') {
    if (variant === 'H-DTF-A4') {
      const a4Price = config.formats?.FORMATS?.A4?.fixedPrice || 70;
      rate = a4Price;
    } else if (variant === 'H-DTF-A3') {
      const a3Price = config.formats?.FORMATS?.A3?.fixedPrice || 120;
      rate = a3Price;
    } else if (variant === 'H-DTF-A2') {
      const a2Price = config.formats?.FORMATS?.A2?.fixedPrice || 250;
      rate = a2Price;
    } else if (variant === 'Custom Inches') {
      rate = 12; // 24" width * 0.5 per sq inch
    } else if (variant === 'Meter') {
      if (quantity < 1) {
        // ERP `< 1m` switch to MICRO PRICING (24" width * 39" * 0.5 = 468 per meter)
        rate = 468;
      } else {
        const slabs = config.pricing?.METER_SLABS || [];
        const slab = slabs.find(s => quantity >= s.min && quantity <= s.max);
        rate = slab ? slab.rate : (slabs[slabs.length - 1]?.rate || 177);
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
      const slabs = uvDtfPricing.A3_SLABS || [];
      const slab = slabs.find(s => quantity >= s.min && quantity <= s.max);
      rate = slab ? slab.rate : (slabs[slabs.length - 1]?.rate || 236);
    }
    total = rate * quantity;
  }
  // 3. Sublimation / EP Stickers / Dropship (reused from DEFAULT_ERP_RATES or config overrides)
  else {
    const rates = DEFAULT_ERP_RATES[category] || {};
    rate = rates[variant] || 0;
    total = rate * quantity;
  }

  return { rate, total };
}

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
    const lineItems = inputs.products.map(p => {
      const category = p.category;
      const variant = p.variant || '';
      const quantity = p.quantity || 0;
      const { rate, total } = calculateERPProduct(category, variant, quantity, config);
      return {
        ...p,
        rate,
        total
      };
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
      // Find meters/sheets in lineItems to estimate weight
      const totalFabricMeters = lineItems
        .filter(item => item.category === 'Fabric Heat DTF' && (item.variant === 'Meter' || item.variant === 'Custom Inches'))
        .reduce((sum, item) => {
          if (item.variant === 'Custom Inches') {
            return sum + (item.quantity / 39);
          }
          return sum + (item.quantity || 0);
        }, 0);
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

  // --- Standard Pricing Engine Entry Point ---
  const s = inputs;

  // ========== AUTO-PACKING MODE (Image Upload or Manual Sizes) ==========
  const isImageMode = s.inputMode === 'image' && s.images && s.images.length > 0;
  const isManualSizeMode = s.inputMode === 'manual-size' && s.manualSizes && s.manualSizes.length > 0;

  if (isImageMode || isManualSizeMode) {
    const isUV = s.printTechnology === 'uv_dtf';
    const maxW = isUV ? 11 : 24;

    if (isManualSizeMode && s.manualSizes.some(sz => Number(sz.width) > maxW || Number(sz.width) <= 0 || Number(sz.height) <= 0)) {
      return {
        isValid: false,
        validationError: `Invalid size. Width must be ≤ ${maxW}". Dimensions must be > 0.`,
        printCost: 0, rateApplied: 0, methodLabel: '', printBreakdown: '',
        conversionCost: 0, conversionBreakdown: '', packagingCost: 0,
        shippingCost: 0, partnerName: '', countedWeight: 0, eta: '',
        shippingBreakdown: '', allPartnerResults: [], recommendedPartner: null,
        finalTotal: 0, quoteText: '',
      };
    }

    const lengthInches = s.computedImageLength;

    if (!isUV && (!lengthInches || lengthInches <= 0)) {
      return {
        isValid: false,
        validationError: 'Could not calculate length. Please check your inputs.',
        printCost: 0, rateApplied: 0, methodLabel: '', printBreakdown: '',
        conversionCost: 0, conversionBreakdown: '', packagingCost: 0,
        shippingCost: 0, partnerName: '', countedWeight: 0, eta: '',
        shippingBreakdown: '', allPartnerResults: [], recommendedPartner: null,
        finalTotal: 0, quoteText: '',
      };
    }

    let bestFormat, bestDims, bestPricing;

    let validItems = [];
    if (s.inputMode === 'image') {
      validItems = (s.images || []).filter(img => img.isValid && (!img.hasWarning || img.isOverridden));
    } else {
      validItems = (s.manualSizes || []).map((sz, i) => ({
        isValid: true,
        width: Number(sz.width) || 0,
        length: Number(sz.height) || 0,
        quantity: Number(sz.qty) || 1,
      })).filter(img => img.width > 0 && img.length > 0);
    }

    if (isUV) {
      // UV DTF Sheet Size Auto-Detection with tolerance
      let detectedFormat = null;
      let detectedLength = null;

      if (validItems.length === 1) {
        const item = validItems[0];
        const w = Math.min(item.width, item.length);
        const l = Math.max(item.width, item.length);

        const isWidth11 = w >= 10.8 && w <= 11.2;
        if (isWidth11) {
          if (l >= 7.8 && l <= 8.2) {
            detectedFormat = 'A4';
            detectedLength = 8;
          } else if (l >= 15.8 && l <= 16.2) {
            detectedFormat = 'A3';
            detectedLength = 16;
          } else if (l > 16.2 && l <= 20.2) {
            detectedFormat = 'Custom';
            detectedLength = Math.ceil(l);
          }
        }
      }

      const uvDtfPricing = config.uvDtfPricing;
      const a4Rate = s.uvPrintType === '3d' ? uvDtfPricing.A4_3D : uvDtfPricing.A4_NORMAL;
      
      let bestQuantity, bestStickersPerSheet, bestPrice, bestRateApplied, bestMethodLabel;

      if (detectedFormat) {
        bestFormat = detectedFormat;
        const item = validItems[0];
        bestQuantity = item.quantity;
        bestStickersPerSheet = 1;
        
        bestDims = {
          printableWidth: 11,
          pricingWidth: 11,
          length: detectedLength,
          quantity: bestQuantity,
          totalMeters: (detectedLength * bestQuantity) / 39,
          totalSqInches: 11 * detectedLength * bestQuantity,
          isSheetFormat: true,
          stickersPerSheet: bestStickersPerSheet,
          computedImageLength: bestQuantity * detectedLength,
          format: detectedFormat
        };
        
        bestPricing = calculatePrintCost({
          format: detectedFormat,
          printTechnology: s.printTechnology,
          uvPrintType: s.uvPrintType,
          ...bestDims
        }, config);
        
        bestPrice = bestPricing.printCost;
        bestRateApplied = bestPricing.rateApplied;
        bestMethodLabel = bestPricing.methodLabel;
      } else {
        // Calculate sheets for A4 (11x8)
        const a4SheetsResult = calculateUVDTFSheets(validItems, 11, 8);
        const required_sheets_A4 = a4SheetsResult.totalSheets;
        const stickersPerSheet_A4 = a4SheetsResult.stickersPerSheet;
        const price_A4 = required_sheets_A4 * a4Rate;
        
        // Calculate sheets for A3 (11x16)
        const a3SheetsResult = calculateUVDTFSheets(validItems, 11, 16);
        const required_sheets_A3 = a3SheetsResult.totalSheets;
        const stickersPerSheet_A3 = a3SheetsResult.stickersPerSheet;
        
        const slabs = uvDtfPricing.A3_SLABS;
        const slab = slabs.find(sl => required_sheets_A3 >= sl.min && required_sheets_A3 <= sl.max);
        const a3Rate = slab ? slab.rate : slabs[slabs.length - 1].rate;
        const price_A3 = required_sheets_A3 * a3Rate;
        
        // Choose A3 if it is cheaper, or if prices are equal but it uses fewer physical sheets
        if (price_A3 < price_A4 || (price_A3 === price_A4 && required_sheets_A3 < required_sheets_A4)) {
          bestFormat = 'A3';
          bestQuantity = required_sheets_A3;
          bestStickersPerSheet = stickersPerSheet_A3;
          bestPrice = price_A3;
          bestRateApplied = a3Rate;
          bestMethodLabel = 'UV A3';
        } else {
          bestFormat = 'A4';
          bestQuantity = required_sheets_A4;
          bestStickersPerSheet = stickersPerSheet_A4;
          bestPrice = price_A4;
          bestRateApplied = a4Rate;
          bestMethodLabel = `UV A4 ${s.uvPrintType === '3d' ? '3D' : 'Normal'}`;
        }
        
        bestDims = {
          printableWidth: 11,
          pricingWidth: 11,
          length: bestFormat === 'A4' ? 8 : 16,
          quantity: bestQuantity,
          totalMeters: ( (bestFormat === 'A4' ? 8 : 16) * bestQuantity ) / 39,
          totalSqInches: 11 * (bestFormat === 'A4' ? 8 : 16) * bestQuantity,
          isSheetFormat: true,
          stickersPerSheet: bestStickersPerSheet,
          computedImageLength: bestFormat === 'A4' ? bestQuantity * 8 : bestQuantity * 16,
        };
        
        bestPricing = {
          printCost: bestPrice,
          effectiveRate: bestDims.totalSqInches > 0 ? (bestPrice / bestDims.totalSqInches).toFixed(2) : '0.00',
          rateApplied: bestRateApplied,
          methodLabel: bestMethodLabel,
          breakdown: `${bestQuantity} pcs × ₹${bestRateApplied} / pc`,
        };
      }
    } else if (s.printTechnology === 'sublimation') {
      // Sublimation
      const totalMeters = lengthInches / 39;
      const packedWidth = s.computedImageWidth || 24;
      
      bestFormat = 'Roll';
      bestDims = {
        printableWidth: 24,
        pricingWidth: 24,
        length: lengthInches,
        quantity: 1,
        totalMeters,
        totalSqInches: 24 * lengthInches,
        isSheetFormat: false,
      };

      bestPricing = calculatePrintCost({ format: 'Roll', printTechnology: 'sublimation', ...bestDims }, config);

      // Detect if packed items fit into A4 (11x8) or A3 (11x16) sheet formats if cheaper
      const minDim = Math.min(packedWidth, lengthInches);
      const maxDim = Math.max(packedWidth, lengthInches);

      if (minDim <= 11.1 && maxDim <= 8.1) {
        const testDims = {
          printableWidth: 11,
          pricingWidth: 11,
          length: 8,
          quantity: 1,
          totalMeters: 8 / 39,
          totalSqInches: 11 * 8,
          isSheetFormat: true,
        };
        const testPricing = calculatePrintCost({ format: 'A4', printTechnology: 'sublimation', ...testDims }, config);
        if (testPricing.printCost <= bestPricing.printCost) {
          bestFormat = 'A4';
          bestDims = testDims;
          bestPricing = testPricing;
        }
      } else if (minDim <= 11.1 && maxDim <= 16.1) {
        const testDims = {
          printableWidth: 11,
          pricingWidth: 11,
          length: 16,
          quantity: 1,
          totalMeters: 16 / 39,
          totalSqInches: 11 * 16,
          isSheetFormat: true,
        };
        const testPricing = calculatePrintCost({ format: 'A3', printTechnology: 'sublimation', ...testDims }, config);
        if (testPricing.printCost <= bestPricing.printCost) {
          bestFormat = 'A3';
          bestDims = testDims;
          bestPricing = testPricing;
        }
      }

      if (validItems.length > 0) {
        const firstItem = validItems[0];
        let sheetW = 24, sheetH = 39;
        if (bestFormat === 'A4') {
          sheetW = 11;
          sheetH = 8;
        } else if (bestFormat === 'A3') {
          sheetW = 11;
          sheetH = 16;
        }
        bestDims.stickersPerSheet = calculateStickersPerSheet(firstItem.width, firstItem.length, sheetW, sheetH, 0.2);
      }
    } else {
      // Fabric DTF
      const totalMeters = lengthInches / 39;
      const packedWidth = s.computedImageWidth || 22.5;
      
      bestFormat = 'Meters';
      bestDims = {
        printableWidth: 22.5,
        pricingWidth: 24, // Meters pricing width
        length: lengthInches,
        quantity: 1,
        totalMeters,
        totalSqInches: 24 * lengthInches,
        isSheetFormat: false,
      };

      bestPricing = calculatePrintCost({ format: 'Meters', ...bestDims }, config);

      // Auto-detect if the packed dimensions fit into standard sheet formats (A4, A3, A2)
      // and use them if they are cheaper than the Meter rate.
      const minDim = Math.min(packedWidth, lengthInches);
      const maxDim = Math.max(packedWidth, lengthInches);
      const formats = config.formats.FORMATS;

      Object.keys(formats).forEach(fmtName => {
        if (fmtName === 'Meters' || fmtName === 'Roll') return;
        const f = formats[fmtName];
        const fMin = Math.min(f.printableWidth, f.length);
        const fMax = Math.max(f.printableWidth, f.length);
        
        if (minDim <= fMin + 0.1 && maxDim <= fMax + 0.1) {
          const testDims = {
            printableWidth: f.printableWidth,
            pricingWidth: f.pricingWidth,
            length: f.length,
            quantity: 1,
            totalMeters: f.length / 39,
            totalSqInches: f.pricingWidth * f.length,
            isSheetFormat: true,
          };
          const testPricing = calculatePrintCost({ format: fmtName, ...testDims }, config);
          
          if (testPricing.printCost <= bestPricing.printCost) {
            bestFormat = fmtName;
            bestDims = testDims;
            bestPricing = testPricing;
          }
        }
      });

      // Calculate stickersPerSheet for Fabric DTF
      if (validItems.length > 0) {
        const firstItem = validItems[0];
        let sheetW, sheetH;
        if (bestFormat === 'Meters') {
          sheetW = 22.5;
          sheetH = 39;
        } else {
          const f = formats[bestFormat];
          if (f) {
            sheetW = f.printableWidth;
            sheetH = f.length;
          } else {
            sheetW = 22.5;
            sheetH = 39;
          }
        }
        bestDims.stickersPerSheet = calculateStickersPerSheet(firstItem.width, firstItem.length, sheetW, sheetH, 0.2);
      }
    }

    const pricing = bestPricing;
    const dims = bestDims;
    const conversion = (s.printTechnology === 'uv_dtf' || s.printTechnology === 'sublimation')
      ? { conversionCost: 0, breakdown: '', breakdownList: [] }
      : calculateConversionCost(s.conversions, config);

    // Calculate weight beforehand
    const computedWeightVal = s.printTechnology === 'uv_dtf'
      ? getUVDTFWeight(dims.format || bestFormat, dims.quantity, dims.length)
      : getFabricWeight(dims.totalMeters);

    // Delivery
    const packagingCost = getPackagingCost(s.deliveryMethod, config);
    const allPartnerResults = s.deliveryMethod === 'courier'
      ? calculateAllShipping(dims.totalMeters, dims.quantity, s.courierFilter, computedWeightVal, config)
      : [];

    let selected = null;
    let recommendedPartner = null;
    if (s.deliveryMethod === 'courier' && allPartnerResults.length > 0) {
      recommendedPartner = getBestCourier(allPartnerResults);
      selected = s.selectedPartner
        ? allPartnerResults.find(p => p.partnerKey === s.selectedPartner) || allPartnerResults.find(p => p.partnerKey === recommendedPartner)
        : allPartnerResults.find(p => p.partnerKey === recommendedPartner);
    }

    const shippingCost = selected ? selected.shippingCost : 0;
    const partnerName = selected ? selected.partnerName : 'Office Pickup';
    const countedWeight = selected ? selected.countedWeight : Math.round(computedWeightVal * 100) / 100;
    const eta = selected ? selected.eta : '';
    const shippingBreakdown = selected ? selected.breakdown : '';
    const finalTotal = Math.ceil(pricing.printCost + conversion.conversionCost + packagingCost + shippingCost);

    const updateObj = {
      isValid: true, validationError: null,
      format: bestFormat,
      ...dims,
      printCost: pricing.printCost,
      effectiveRate: pricing.effectiveRate,
      rateApplied: pricing.rateApplied,
      methodLabel: pricing.methodLabel,
      printBreakdown: pricing.breakdown,
      conversionCost: conversion.conversionCost,
      conversionBreakdown: conversion.breakdown,
      packagingCost, shippingCost, partnerName, countedWeight, eta, shippingBreakdown,
      allPartnerResults, recommendedPartner,
      selectedPartner: selected ? selected.partnerKey : null,
      finalTotal,
      activePrintCost: pricing.printCost,
      activeConversionCost: conversion.conversionCost,
      printTechnology: s.printTechnology,
      uvPrintType: s.uvPrintType
    };

    if (s.cart && s.cart.length > 0) {
      const cartResults = calculateCart(s.cart, s.deliveryMethod, s.courierFilter, s.selectedPartner, config);
      Object.assign(updateObj, cartResults);
    }

    const quoteText = generateQuote(updateObj);
    return {
      ...updateObj,
      quoteText
    };
  }

  // ========== MANUAL MODE Recalculation ==========
  let targetFormat = s.format;
  let targetLength = s.rawLength;

  const formats = config.formats.FORMATS;
  const fmt = formats[targetFormat];
  const validation = validateInputs({
    format: targetFormat,
    quantity: s.quantity,
    rawLength: targetLength,
    printableWidth: fmt ? fmt.printableWidth : 0,
    printTechnology: s.printTechnology,
  }, config);

  if (!validation.isValid) {
    return {
      isValid: false,
      validationError: validation.error,
      printCost: 0,
      effectiveRate: '0.00',
      rateApplied: 0,
      methodLabel: '',
      printBreakdown: '',
      conversionCost: 0,
      conversionBreakdown: '',
      packagingCost: 0,
      shippingCost: 0,
      partnerName: '',
      countedWeight: 0,
      eta: '',
      shippingBreakdown: '',
      allPartnerResults: [],
      recommendedPartner: null,
      finalTotal: 0,
      quoteText: '',
    };
  }

  // 1: Resolve dimensions
  let dims = resolveDimensions(targetFormat, s.quantity, targetLength, config);

  // 2: Print cost
  const pricing = calculatePrintCost({
    format: targetFormat,
    printTechnology: s.printTechnology,
    uvPrintType: s.uvPrintType,
    ...dims
  }, config);

  // 3: Conversion cost
  const conversion = (s.printTechnology === 'uv_dtf' || s.printTechnology === 'sublimation')
    ? { conversionCost: 0, breakdown: '', breakdownList: [] }
    : calculateConversionCost(s.conversions, config);

  // Weight
  const computedWeightVal = s.printTechnology === 'uv_dtf'
    ? getUVDTFWeight(targetFormat, dims.quantity, dims.length)
    : getFabricWeight(dims.totalMeters);

  // 4: Delivery
  const packagingCost = getPackagingCost(s.deliveryMethod, config);
  const allPartnerResults = s.deliveryMethod === 'courier'
    ? calculateAllShipping(dims.totalMeters, dims.quantity, s.courierFilter, computedWeightVal, config)
    : [];

  // 5: Resolve selected partner
  let selected = null;
  let recommendedPartner = null;
  
  if (s.deliveryMethod === 'courier' && allPartnerResults.length > 0) {
    recommendedPartner = getBestCourier(allPartnerResults);
    selected = s.selectedPartner
      ? allPartnerResults.find(p => p.partnerKey === s.selectedPartner) || allPartnerResults.find(p => p.partnerKey === recommendedPartner)
      : allPartnerResults.find(p => p.partnerKey === recommendedPartner);
  }

  const shippingCost = selected ? selected.shippingCost : 0;
  const partnerName = selected ? selected.partnerName : 'Office Pickup';
  const countedWeight = selected ? selected.countedWeight : Math.round(computedWeightVal * 100) / 100;
  const eta = selected ? selected.eta : '';
  const shippingBreakdown = selected ? selected.breakdown : '';

  const finalTotal = Math.ceil(pricing.printCost + conversion.conversionCost + packagingCost + shippingCost);

  const updateObj = {
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
    packagingCost,
    shippingCost,
    partnerName,
    countedWeight,
    eta,
    shippingBreakdown,
    allPartnerResults,
    recommendedPartner,
    selectedPartner: selected ? selected.partnerKey : null,
    finalTotal,
    activePrintCost: pricing.printCost,
    activeConversionCost: conversion.conversionCost,
    printTechnology: s.printTechnology,
    uvPrintType: s.uvPrintType
  };

  if (s.cart && s.cart.length > 0) {
    const cartResults = calculateCart(s.cart, s.deliveryMethod, s.courierFilter, s.selectedPartner, config);
    Object.assign(updateObj, cartResults);
  }

  const quoteText = generateQuote(updateObj);

  return {
    ...updateObj,
    quoteText
  };
}
