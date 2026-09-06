/**
 * App Controller — The Orchestrator
 * Connects inputs → modules → state → UI. This is the pipeline.
 * The ONLY module that reads/writes state and calls computation modules.
 */

import { getConfig } from '../state/configStore.js';
import { getUVDTFWeight, getFabricWeight } from '../modules/deliveryEngine.js';
import { calculatePackedDimensions } from '../modules/packingEngine.js';
import { calculateQuote } from '../modules/pricingBrain.js';
import { update, getState } from '../state/store.js';

/**
 * Full recalculation pipeline. Called on any input change.
 * Delegates all calculation and decision logic to stateless pricingBrain.js.
 */
export function recalculate() {
  const s = getState();
  const config = getConfig();
  const result = calculateQuote(s, config);
  update(result);
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
  const isSublimation = state.printTechnology === 'sublimation';
  const printableWidth = isUV ? 11 : (isSublimation ? 24 : 22.8);

  if (newImages && newImages.length > 0) {
    // Only pack images that are completely valid and have no blocking warnings
    const validToPack = newImages.filter(img => img.isValid && (!img.hasWarning || img.isOverridden));
    
    // If there are images but NONE are validToPack, it means they are all blocked by warnings or errors.
    // We should show them in the UI but NOT calculate any packing/pricing for them yet.
    if (validToPack.length > 0) {
      const packed = calculatePackedDimensions(validToPack, printableWidth, isUV ? 0.0787 : 0.2);
      let defaultFormat = 'Meters';
      if (isUV) {
        defaultFormat = packed.totalLength <= 8 ? 'A4' : 'A3';
      } else if (isSublimation) {
        defaultFormat = 'Roll';
      }

      update({ 
        images: newImages, 
        inputMode: 'image',
        format: defaultFormat,
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
      if (!newWidthInches || newWidthInches <= 0 || newWidthInches > 22.8) {
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
    if (s.images && s.images.length > 0) {
      onImagesUpdated(s.images);
    } else {
      update({ inputMode: 'image', format: 'Meters' });
      recalculate();
    }
  } else if (tab === 'manual-size') {
    if (s.manualSizes && s.manualSizes.length > 0) {
      onManualSizesUpdated(s.manualSizes);
    } else {
      update({ inputMode: 'manual-size', format: 'Meters' });
      recalculate();
    }
  }
}

export function addManualSize() {
  const s = getState();
  const manualSizes = [...s.manualSizes, { id: Date.now().toString(), width: '', height: '', qty: 1 }];
  onManualSizesUpdated(manualSizes);
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
  const isSublimation = state.printTechnology === 'sublimation';
  const maxW = isUV ? 11 : (isSublimation ? 24 : 22.8);
  const printableWidth = isUV ? 11 : (isSublimation ? 24 : 22.8);

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
      
      let defaultFormat = 'Meters';
      if (isUV) {
        defaultFormat = packed.totalLength <= 8 ? 'A4' : 'A3';
      } else if (isSublimation) {
        defaultFormat = 'Roll';
      }

      update({ 
        manualSizes: newSizes, 
        inputMode: 'manual-size',
        format: defaultFormat,
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
    if (s.format === 'Meters' || s.format === 'A2' || s.format === 'Roll') {
      updateObj.format = 'Custom';
    } else if (s.format !== 'A4' && s.format !== 'A3' && s.format !== 'Custom') {
      updateObj.format = 'A4';
    }
    updateObj.conversions = []; // Clear conversions for UV DTF
  } else if (tech === 'sublimation') {
    if (s.format === 'Meters' || s.format === 'Custom' || s.format === 'A2') {
      updateObj.format = 'Roll';
    } else if (s.format !== 'A4' && s.format !== 'A3' && s.format !== 'Roll') {
      updateObj.format = 'A4';
    }
    updateObj.conversions = []; // Clear conversions for Sublimation
  } else {
    // Fabric DTF
    if (s.format === 'Custom' || s.format === 'Roll') {
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
