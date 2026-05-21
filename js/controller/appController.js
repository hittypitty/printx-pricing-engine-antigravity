/**
 * App Controller — The Orchestrator
 * Connects inputs → modules → state → UI. This is the pipeline.
 * The ONLY module that reads/writes state and calls computation modules.
 */

import { getConfig } from '../state/configStore.js';
import { validateInputs } from '../modules/validationEngine.js';
import { resolveDimensions } from '../modules/formatParser.js';
import { calculatePrintCost, calculateConversionCost } from '../modules/pricingEngine.js';
import { calculateAllShipping, getPackagingCost, getBestCourier, getUVDTFWeight, getFabricWeight, calculateUVDTFA3EquivalentSheets } from '../modules/deliveryEngine.js';
import { calculatePackedDimensions } from '../modules/packingEngine.js';
import { generateQuote } from '../modules/quoteGenerator.js';
import { update, getState } from '../state/store.js';
function calculateCart(cart, deliveryMethod, courierFilter, selectedPartner) {
  const totalPrintCost = cart.reduce((sum, item) => sum + item.printCost, 0);
  const totalConversionCost = cart.reduce((sum, item) => sum + item.conversionCost, 0);

  // 1. UV DTF sheets weight
  const totalUVA3Sheets = cart
    .filter(item => item.printTechnology === 'uv_dtf')
    .reduce((sum, item) => sum + calculateUVDTFA3EquivalentSheets(item.format, item.quantity, item.length), 0);
  const uvWeight = totalUVA3Sheets > 0 ? getUVDTFWeight('A3', totalUVA3Sheets, 16) : 0;

  // 2. Fabric DTF meters weight
  const totalFabricMeters = cart
    .filter(item => item.printTechnology === 'fabric')
    .reduce((sum, item) => sum + (item.totalMeters || 0), 0);
  const fabricWeight = totalFabricMeters > 0 ? getFabricWeight(totalFabricMeters) : 0;

  const combinedWeightVal = uvWeight + fabricWeight;

  // Delivery details:
  const packagingCost = getPackagingCost(deliveryMethod);
  const allPartnerResults = deliveryMethod === 'courier'
    ? calculateAllShipping(totalFabricMeters, 1, courierFilter, combinedWeightVal)
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
 * Helper to calculate required sheets and stickers per sheet for UV DTF.
 * Groups identical sticker sizes (ignoring orientation) to pack them together,
 * and tests both original and rotated (90 deg) orientations to maximize sheet fit.
 */
function calculateUVDTFSheets(items, sheetW, sheetH) {
  const groups = {};
  items.forEach(item => {
    const w = Number(item.width || 0);
    const h = Number(item.length || item.height || 0);
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
    const effW1 = g.w + gap;
    const effH1 = g.h + gap;
    const fitX1 = Math.floor(sheetW / effW1);
    const fitY1 = Math.floor(sheetH / effH1);
    const fit1 = fitX1 * fitY1;

    // Option 2: Rotated 90 degrees orientation
    const effW2 = g.h + gap;
    const effH2 = g.w + gap;
    const fitX2 = Math.floor(sheetW / effW2);
    const fitY2 = Math.floor(sheetH / effH2);
    const fit2 = fitX2 * fitY2;

    const stickersPerSheet = Math.max(1, Math.max(fit1, fit2));
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
 * Full recalculation pipeline. Called on any input change.
 */
export function recalculate() {
  const s = getState();

  // ========== AUTO-PACKING MODE (Image Upload or Manual Sizes) ==========
  const isImageMode = s.inputMode === 'image' && s.images && s.images.length > 0;
  const isManualSizeMode = s.inputMode === 'manual-size' && s.manualSizes && s.manualSizes.length > 0;
  
  if (isImageMode || isManualSizeMode) {
    const isUV = s.printTechnology === 'uv_dtf';
    const maxW = isUV ? 11 : 24;

    if (isManualSizeMode && s.manualSizes.some(sz => Number(sz.width) > maxW || Number(sz.width) <= 0 || Number(sz.height) <= 0)) {
      update({
        isValid: false,
        validationError: `Invalid size. Width must be ≤ ${maxW}". Dimensions must be > 0.`,
        printCost: 0, rateApplied: 0, methodLabel: '', printBreakdown: '',
        conversionCost: 0, conversionBreakdown: '', packagingCost: 0,
        shippingCost: 0, partnerName: '', countedWeight: 0, eta: '',
        shippingBreakdown: '', allPartnerResults: [], recommendedPartner: null,
        finalTotal: 0, quoteText: '',
      });
      return;
    }

    const lengthInches = s.computedImageLength;

    if (!isUV && (!lengthInches || lengthInches <= 0)) {
      update({
        isValid: false,
        validationError: 'Could not calculate length. Please check your inputs.',
        printCost: 0, rateApplied: 0, methodLabel: '', printBreakdown: '',
        conversionCost: 0, conversionBreakdown: '', packagingCost: 0,
        shippingCost: 0, partnerName: '', countedWeight: 0, eta: '',
        shippingBreakdown: '', allPartnerResults: [], recommendedPartner: null,
        finalTotal: 0, quoteText: '',
      });
      return;
    }

    let bestFormat, bestDims, bestPricing;

    if (isUV) {
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
      
      const { uvDtfPricing } = getConfig();
      const a4Rate = s.uvPrintType === '3d' ? uvDtfPricing.A4_3D : uvDtfPricing.A4_NORMAL;
      
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
      
      let bestQuantity, bestStickersPerSheet, bestPrice, bestRateApplied, bestMethodLabel;
      
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

      bestPricing = calculatePrintCost({ format: 'Meters', ...bestDims });

      // Auto-detect if the packed dimensions fit into standard sheet formats (A4, A3, A2)
      // and use them if they are cheaper than the Meter rate.
      const minDim = Math.min(packedWidth, lengthInches);
      const maxDim = Math.max(packedWidth, lengthInches);
      const { formats } = getConfig();
      const FMT = formats.FORMATS;

      Object.keys(FMT).forEach(fmtName => {
        if (fmtName === 'Meters') return;
        const f = FMT[fmtName];
        const fMin = Math.min(f.printableWidth, f.length);
        const fMax = Math.max(f.printableWidth, f.length);
        
        // Check if packed dimensions fit within this sheet format (with 0.1" tolerance)
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
          const testPricing = calculatePrintCost({ format: fmtName, ...testDims });
          
          // Use this format if it's cheaper or equal
          if (testPricing.printCost <= bestPricing.printCost) {
            bestFormat = fmtName;
            bestDims = testDims;
            bestPricing = testPricing;
          }
        }
      });
    }

    const pricing = bestPricing;
    const dims = bestDims;
    const conversion = s.printTechnology === 'uv_dtf'
      ? { conversionCost: 0, breakdown: '', breakdownList: [] }
      : calculateConversionCost(s.conversions);

    // Calculate weight beforehand
    const computedWeightVal = s.printTechnology === 'uv_dtf'
      ? getUVDTFWeight(dims.format || bestFormat, dims.quantity, dims.length)
      : getFabricWeight(dims.totalMeters);

    // Delivery
    const packagingCost = getPackagingCost(s.deliveryMethod);
    const allPartnerResults = s.deliveryMethod === 'courier'
      ? calculateAllShipping(dims.totalMeters, dims.quantity, s.courierFilter, computedWeightVal)
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
      activeConversionCost: conversion.conversionCost
    };

    if (s.cart && s.cart.length > 0) {
      const cartResults = calculateCart(s.cart, s.deliveryMethod, s.courierFilter, s.selectedPartner);
      Object.assign(updateObj, cartResults);
    }

    update(updateObj);

    const quoteText = generateQuote(getState());
    update({ quoteText });
    return; // EARLY EXIT — manual path never runs
  }
  // ========== END IMAGE MODE ==========

  // Apply Manual Mode
  let targetFormat = s.format;
  let targetLength = s.rawLength;

  // Step 0: VALIDATE — uses printableWidth (22.5" for Meters)
  const { formats } = getConfig();
  const fmt = formats.FORMATS[targetFormat];
  const validation = validateInputs({
    format: targetFormat,
    quantity: s.quantity,
    rawLength: targetLength,
    printableWidth: fmt ? fmt.printableWidth : 0,
  });

  if (!validation.isValid) {
    update({
      isValid: false,
      validationError: validation.error,
      // Reset all computed outputs to zero — never show stale calculations
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
    });
    return; // Pipeline stops. UI shows zeroed outputs + error.
  }
  update({ isValid: true, validationError: null });

  // Step 1: Resolve dimensions (returns both widths)
  let dims = resolveDimensions(targetFormat, s.quantity, targetLength);

  // Step 2: Print cost
  const pricing = calculatePrintCost({
    format: targetFormat,
    printTechnology: s.printTechnology,
    uvPrintType: s.uvPrintType,
    ...dims
  });

  // Step 3: Conversion cost (modular, separate from print)
  const conversion = s.printTechnology === 'uv_dtf'
    ? { conversionCost: 0, breakdown: '', breakdownList: [] }
    : calculateConversionCost(s.conversions);

  // Calculate weight beforehand
  const computedWeightVal = s.printTechnology === 'uv_dtf'
    ? getUVDTFWeight(targetFormat, dims.quantity, dims.length)
    : getFabricWeight(dims.totalMeters);

  // Step 4: Delivery
  const packagingCost = getPackagingCost(s.deliveryMethod);
  const allPartnerResults = s.deliveryMethod === 'courier'
    ? calculateAllShipping(dims.totalMeters, dims.quantity, s.courierFilter, computedWeightVal)
    : [];

  // Step 5: Resolve selected partner
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

  // Step 6: Final total = printCost + conversionCost + packagingCost + shippingCost
  const finalTotal = Math.ceil(pricing.printCost + conversion.conversionCost + packagingCost + shippingCost);

  const updateObj = {
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
    activeConversionCost: conversion.conversionCost
  };

  if (s.cart && s.cart.length > 0) {
    const cartResults = calculateCart(s.cart, s.deliveryMethod, s.courierFilter, s.selectedPartner);
    Object.assign(updateObj, cartResults);
  }

  // Step 7: Write all computed values to state
  update(updateObj);

  // Step 8: Generate quote (needs the full state just written)
  const quoteText = generateQuote(getState());
  update({ quoteText });
}

/**
 * Handle a user input change. Writes the raw input to state, then recalculates.
 * @param {string} field - state key to update
 * @param {*} value - new value
 */
export function onInputChange(field, value) {
  update({ [field]: value });
  recalculate();
}

export function addConversion() {
  const s = getState();
  const conversions = [...s.conversions, { id: Date.now().toString(), type: 'Puff', qty: 1 }];
  update({ conversions });
  recalculate();
}

export function updateConversion(id, field, value) {
  const s = getState();
  const conversions = s.conversions.map(c => c.id === id ? { ...c, [field]: value } : c);
  update({ conversions });
  recalculate();
}

export function removeConversion(id) {
  const s = getState();
  const conversions = s.conversions.filter(c => c.id !== id);
  update({ conversions });
  recalculate();
}

export function onImagesUpdated(newImages) {
  const state = getState();
  const isUV = state.printTechnology === 'uv_dtf';
  const printableWidth = isUV ? 11 : 22.5;

  if (newImages && newImages.length > 0) {
    // Only pack images that are completely valid and have no blocking warnings
    const validToPack = newImages.filter(img => img.isValid && (!img.hasWarning || img.isOverridden));
    
    // If there are images but NONE are validToPack, it means they are all blocked by warnings or errors.
    // We should show them in the UI but NOT calculate any packing/pricing for them yet.
    if (validToPack.length > 0) {
      const packed = calculatePackedDimensions(validToPack, printableWidth, isUV ? 0.0787 : 0.2);
      update({ 
        images: newImages, 
        inputMode: 'image',
        format: isUV ? (packed.totalLength <= 8 ? 'A4' : 'A3') : 'Meters',
        computedImageLength: packed.totalLength,
        computedImageWidth: packed.totalWidth,
        designCount: validToPack.reduce((sum, img) => sum + img.quantity, 0)
      });
    } else {
      update({ 
        images: newImages, 
        inputMode: 'image',
        computedImageLength: 0,
        designCount: 0
      });
    }
  } else {
    update({ 
      images: [], 
      inputMode: 'manual',
      designCount: 0
    });
  }
  recalculate();
}

export function overrideImageWidth(id, newWidthInches) {
  const s = getState();
  const newImages = s.images.map(img => {
    if (img.id === id) {
      // If width is cleared or invalid, revert to warning state
      if (!newWidthInches || newWidthInches <= 0 || newWidthInches > 22.5) {
        return {
          ...img,
          width: Number((img.originalWidthPx / img.dpi).toFixed(2)),
          length: Number((img.originalHeightPx / img.dpi).toFixed(2)),
          hasWarning: true,
          isOverridden: false
        };
      }
      
      // Calculate proportional length
      const ratio = img.originalHeightPx / img.originalWidthPx;
      let newLengthInches = newWidthInches * ratio;
      
      // Account for orientation: if they swapped width/length by accident
      // The packing engine handles rotation, but we should just scale whatever was considered "width" before.
      // Actually, imageProcessor ensures width is the smaller side.
      // So if they enter a new width, we just scale both sides.
      const originalSmallerSide = Math.min(img.originalWidthPx, img.originalHeightPx);
      const originalLargerSide = Math.max(img.originalWidthPx, img.originalHeightPx);
      const trueRatio = originalLargerSide / originalSmallerSide;
      
      newLengthInches = newWidthInches * trueRatio;
      
      return {
        ...img,
        width: Number(newWidthInches.toFixed(2)),
        length: Number(newLengthInches.toFixed(2)),
        hasWarning: false, // warning resolved
        isOverridden: true
      };
    }
    return img;
  });
  
  onImagesUpdated(newImages);
}

export function setDesignTab(tab) {
  update({ designTab: tab });
  // If switching tabs, we should apply the correct input mode if there's data
  const s = getState();
  if (tab === 'image') {
    onImagesUpdated(s.images);
  } else if (tab === 'manual-size') {
    onManualSizesUpdated(s.manualSizes);
  }
}

export function addManualSize() {
  const s = getState();
  const manualSizes = [...s.manualSizes, { id: Date.now().toString(), width: '', height: '', qty: 1 }];
  update({ manualSizes });
  // Don't auto-recalculate if empty, just wait for user to type
}

export function updateManualSize(id, field, value) {
  const s = getState();
  const manualSizes = s.manualSizes.map(m => m.id === id ? { ...m, [field]: value } : m);
  onManualSizesUpdated(manualSizes);
}

export function removeManualSize(id) {
  const s = getState();
  let manualSizes = s.manualSizes.filter(m => m.id !== id);
  if (manualSizes.length === 0) {
    manualSizes = [{ id: Date.now().toString(), width: '', height: '', qty: 1 }];
  }
  onManualSizesUpdated(manualSizes);
}

function onManualSizesUpdated(newSizes) {
  const state = getState();
  const isUV = state.printTechnology === 'uv_dtf';
  const maxW = isUV ? 11 : 24;
  const printableWidth = isUV ? 11 : 22.5;

  if (newSizes && newSizes.length > 0) {
    const pseudoImages = newSizes.map((s, i) => ({
      isValid: true,
      width: Number(s.width) || 0,
      length: Number(s.height) || 0,
      quantity: Number(s.qty) || 1,
      name: `Size ${i + 1}`
    }));
    
    // Check if any size is completely invalid, but only block packing if they entered something
    let hasInvalid = false;
    let allEmpty = true;
    pseudoImages.forEach(img => {
      if (img.width > 0 || img.length > 0) allEmpty = false;
      if (img.width > maxW || img.width < 0 || img.length < 0) hasInvalid = true;
    });

    if (allEmpty) {
      update({ manualSizes: newSizes, inputMode: 'manual', designCount: 0 });
    } else if (hasInvalid) {
      update({ manualSizes: newSizes, inputMode: 'manual-size', computedImageLength: 0 });
    } else {
      // Filter out incomplete sizes for calculation, but keep them in UI state
      const validToPack = pseudoImages.filter(img => img.width > 0 && img.length > 0);
      const packed = calculatePackedDimensions(validToPack, printableWidth, isUV ? 0.0787 : 0.2);
      
      update({ 
        manualSizes: newSizes, 
        inputMode: 'manual-size',
        format: isUV ? (packed.totalLength <= 8 ? 'A4' : 'A3') : 'Meters',
        computedImageLength: packed.totalLength,
        computedImageWidth: packed.totalWidth,
        designCount: validToPack.reduce((sum, img) => sum + img.quantity, 0)
      });
    }
  } else {
    update({ 
      manualSizes: [], 
      inputMode: 'manual',
      designCount: 0
    });
  }
  recalculate();
}

export function setPrintTechnology(tech) {
  const s = getState();
  const updateObj = { printTechnology: tech };
  
  if (tech === 'uv_dtf') {
    if (s.format === 'Meters' || s.format === 'A2') {
      updateObj.format = 'Custom';
    } else if (s.format !== 'A4' && s.format !== 'A3' && s.format !== 'Custom') {
      updateObj.format = 'A4';
    }
    updateObj.conversions = []; // Clear conversions for UV DTF
  } else {
    // Switch from UV DTF to Fabric DTF
    if (s.format === 'Custom') {
      updateObj.format = 'Meters';
    }
  }
  
  update(updateObj);
  
  if (s.designTab === 'image') {
    onImagesUpdated(s.images);
  } else if (s.designTab === 'manual-size') {
    onManualSizesUpdated(s.manualSizes);
  } else {
    recalculate();
  }
}

export function setUvPrintType(type) {
  update({ uvPrintType: type });
  recalculate();
}

export function addToCart() {
  const s = getState();
  if (!s.isValid) return;

  const itemId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

  const printCost = s.activePrintCost !== undefined ? s.activePrintCost : s.printCost;
  const conversionCost = s.activeConversionCost !== undefined ? s.activeConversionCost : s.conversionCost;

  const itemWeight = s.printTechnology === 'uv_dtf'
    ? getUVDTFWeight(s.format, s.quantity, s.length)
    : getFabricWeight(s.totalMeters);

  const cartItem = {
    id: itemId,
    printTechnology: s.printTechnology,
    uvPrintType: s.uvPrintType,
    format: s.format,
    printableWidth: s.printableWidth,
    pricingWidth: s.pricingWidth,
    length: s.length,
    totalMeters: s.totalMeters,
    totalSqInches: s.totalSqInches,
    isSheetFormat: s.isSheetFormat,
    quantity: s.quantity,
    printCost,
    rateApplied: s.rateApplied,
    methodLabel: s.methodLabel,
    printBreakdown: s.printBreakdown,
    conversionCost,
    conversionBreakdown: s.conversionBreakdown,
    conversions: JSON.parse(JSON.stringify(s.conversions || [])),
    designCount: s.designCount,
    weight: itemWeight
  };

  const newCart = [...(s.cart || []), cartItem];

  update({
    cart: newCart,
    // Reset active config inputs
    format: 'A4',
    rawLength: '',
    quantity: 1,
    conversions: [],
    images: [],
    manualSizes: [{ id: 'default-ms-1', width: '', height: '', qty: 1 }],
    inputMode: 'manual',
    computedImageLength: 0,
    computedImageWidth: 0,
    designCount: 0
  });

  recalculate();
}

export function removeFromCart(id) {
  const s = getState();
  const newCart = (s.cart || []).filter(item => item.id !== id);
  update({ cart: newCart });
  recalculate();
}

export function clearCart() {
  update({ cart: [] });
  recalculate();
}
