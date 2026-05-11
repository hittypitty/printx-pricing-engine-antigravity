/**
 * App Controller — The Orchestrator
 * Connects inputs → modules → state → UI. This is the pipeline.
 * The ONLY module that reads/writes state and calls computation modules.
 */

import { getConfig } from '../state/configStore.js';
import { validateInputs } from '../modules/validationEngine.js';
import { resolveDimensions } from '../modules/formatParser.js';
import { calculatePrintCost, calculateConversionCost } from '../modules/pricingEngine.js';
import { calculateAllShipping, getPackagingCost, getBestCourier } from '../modules/deliveryEngine.js';
import { calculatePackedDimensions } from '../modules/packingEngine.js';
import { generateQuote } from '../modules/quoteGenerator.js';
import { update, getState } from '../state/store.js';

/**
 * Full recalculation pipeline. Called on any input change.
 */
export function recalculate() {
  const s = getState();

  // ========== AUTO-PACKING MODE (Image Upload or Manual Sizes) ==========
  const isImageMode = s.inputMode === 'image' && s.images && s.images.length > 0;
  const isManualSizeMode = s.inputMode === 'manual-size' && s.manualSizes && s.manualSizes.length > 0;
  
  if (isImageMode || isManualSizeMode) {
    if (isManualSizeMode && s.manualSizes.some(sz => Number(sz.width) > 24 || Number(sz.width) <= 0 || Number(sz.height) <= 0)) {
      update({
        isValid: false,
        validationError: 'Invalid size. Width must be ≤ 24". Dimensions must be > 0.',
        printCost: 0, rateApplied: 0, methodLabel: '', printBreakdown: '',
        conversionCost: 0, conversionBreakdown: '', packagingCost: 0,
        shippingCost: 0, partnerName: '', countedWeight: 0, eta: '',
        shippingBreakdown: '', allPartnerResults: [], recommendedPartner: null,
        finalTotal: 0, quoteText: '',
      });
      return;
    }

    const lengthInches = s.computedImageLength;

    if (!lengthInches || lengthInches <= 0) {
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

    // Start with Meters as the baseline
    const totalMeters = lengthInches / 39;
    const packedWidth = s.computedImageWidth || 22.5;
    
    let bestFormat = 'Meters';
    let bestDims = {
      printableWidth: 22.5,
      pricingWidth: 24, // Meters pricing width
      length: lengthInches,
      quantity: 1,
      totalMeters,
      totalSqInches: 24 * lengthInches,
      isSheetFormat: false,
    };

    let bestPricing = calculatePrintCost({ format: 'Meters', ...bestDims });

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

    const pricing = bestPricing;
    const dims = bestDims;
    const conversion = calculateConversionCost(s.conversions);

    // Delivery
    const packagingCost = getPackagingCost(s.deliveryMethod);
    const allPartnerResults = s.deliveryMethod === 'courier'
      ? calculateAllShipping(totalMeters, 1, s.courierFilter)
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
    const countedWeight = selected ? selected.countedWeight : 0;
    const eta = selected ? selected.eta : '';
    const shippingBreakdown = selected ? selected.breakdown : '';
    const finalTotal = Math.ceil(pricing.printCost + conversion.conversionCost + packagingCost + shippingCost);

    update({
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
    });

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
  const dims = resolveDimensions(targetFormat, s.quantity, targetLength);

  // Step 2: Print cost — dims.totalSqInches uses pricingWidth (24" for Meters)
  const pricing = calculatePrintCost({ format: targetFormat, ...dims });

  // Step 3: Conversion cost (modular, separate from print)
  const conversion = calculateConversionCost(s.conversions);

  // Step 4: Delivery
  const packagingCost = getPackagingCost(s.deliveryMethod);
  const allPartnerResults = s.deliveryMethod === 'courier'
    ? calculateAllShipping(dims.totalMeters, dims.quantity, s.courierFilter)
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
  const countedWeight = selected ? selected.countedWeight : 0;
  const eta = selected ? selected.eta : '';
  const shippingBreakdown = selected ? selected.breakdown : '';

  // Step 6: Final total = printCost + conversionCost + packagingCost + shippingCost
  const finalTotal = Math.ceil(pricing.printCost + conversion.conversionCost + packagingCost + shippingCost);

  // Step 7: Write all computed values to state
  update({
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
  });

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
  if (newImages && newImages.length > 0) {
    // Only pack images that are completely valid and have no blocking warnings
    const validToPack = newImages.filter(img => img.isValid && (!img.hasWarning || img.isOverridden));
    
    // If there are images but NONE are validToPack, it means they are all blocked by warnings or errors.
    // We should show them in the UI but NOT calculate any packing/pricing for them yet.
    if (validToPack.length > 0) {
      const packed = calculatePackedDimensions(validToPack);
      update({ 
        images: newImages, 
        inputMode: 'image',
        format: 'Meters',
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
      if (img.width > 24 || img.width < 0 || img.length < 0) hasInvalid = true;
    });

    if (allEmpty) {
      update({ manualSizes: newSizes, inputMode: 'manual', designCount: 0 });
    } else if (hasInvalid) {
      update({ manualSizes: newSizes, inputMode: 'manual-size', computedImageLength: 0 });
    } else {
      // Filter out incomplete sizes for calculation, but keep them in UI state
      const validToPack = pseudoImages.filter(img => img.width > 0 && img.length > 0);
      const packed = calculatePackedDimensions(validToPack);
      
      update({ 
        manualSizes: newSizes, 
        inputMode: 'manual-size',
        format: 'Meters',
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
