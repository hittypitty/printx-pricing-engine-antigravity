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

  // ========== IMAGE MODE — DIRECT PATH (bypasses all format/validation logic) ==========
  if (s.inputMode === 'image' && s.images && s.images.length > 0) {
    const lengthInches = s.computedImageLength;

    if (!lengthInches || lengthInches <= 0) {
      update({
        isValid: false,
        validationError: 'No valid images to calculate. Please upload valid PNG files.',
        printCost: 0, rateApplied: 0, methodLabel: '', printBreakdown: '',
        conversionCost: 0, conversionBreakdown: '', packagingCost: 0,
        shippingCost: 0, partnerName: '', countedWeight: 0, eta: '',
        shippingBreakdown: '', allPartnerResults: [], recommendedPartner: null,
        finalTotal: 0, quoteText: '',
      });
      return;
    }

    // Build dims directly — NO resolveDimensions, NO parseLength, NO format lookup
    const totalMeters = lengthInches / 39;
    const pricingWidth = 24; // Meters pricing width
    const dims = {
      printableWidth: 22.5,
      pricingWidth,
      length: lengthInches,
      quantity: 1,
      totalMeters,
      totalSqInches: pricingWidth * lengthInches,
      isSheetFormat: false,
    };

    const pricing = calculatePrintCost({ format: 'Meters', ...dims });
    const conversion = calculateConversionCost(s.designCount);

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
      ...dims,
      printCost: pricing.printCost,
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
  const conversion = calculateConversionCost(s.designCount);

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

/**
 * Handle image uploads for V2. Computes packed length and toggles modes.
 * @param {Array} newImages - Array of validated image objects
 */
export function onImagesUpdated(newImages) {
  if (newImages && newImages.length > 0) {
    const packed = calculatePackedDimensions(newImages);
    update({ 
      images: newImages, 
      inputMode: 'image',
      format: 'Meters',
      computedImageLength: packed.totalLength,
      designCount: newImages.length
    });
  } else {
    update({ 
      images: [], 
      inputMode: 'manual',
      designCount: 0
    });
  }
  recalculate();
}
