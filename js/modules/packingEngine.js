/**
 * Packing Engine — 2D Grid Packing
 * Uses sheet-based bin packing with rotation to maximize utilization.
 * Roll width: 22.5", sheet length: 39".
 * Reports ACTUAL consumed length, not full-sheet allocation.
 */

export const MARGIN_INCHES = 0.2;
export const PRINTABLE_WIDTH = 22.5;
export const SHEET_LENGTH = 39;

/**
 * Calculate grid packing for a single image type on a CONTINUOUS roll.
 * Tries both orientations, picks the one that consumes the LEAST running length.
 *
 * Returns { colsAcross, rowsNeeded, lengthConsumed, cellW, cellH }
 */
function bestContinuousLayout(imgWidth, imgLength, qty) {
  // Single copy: no margins needed — use exact image dimensions
  if (qty === 1) {
    return { colsAcross: 1, rowsNeeded: 1, lengthConsumed: imgLength, cellW: imgWidth, cellH: imgLength };
  }

  // Multiple copies: add margins for spacing between items
  const w = imgWidth + MARGIN_INCHES;
  const h = imgLength + MARGIN_INCHES;

  // Orientation 1: width along roll
  const cols1 = Math.floor(PRINTABLE_WIDTH / w);
  let length1 = Infinity;
  if (cols1 > 0) {
    const rows1 = Math.ceil(qty / cols1);
    length1 = rows1 * h;
  }

  // Orientation 2: rotated
  const cols2 = Math.floor(PRINTABLE_WIDTH / h);
  let length2 = Infinity;
  if (cols2 > 0) {
    const rows2 = Math.ceil(qty / cols2);
    length2 = rows2 * w;
  }

  if (length1 === Infinity && length2 === Infinity) {
    // Image is too large for the roll width in either orientation!
    return { colsAcross: 1, rowsNeeded: qty, lengthConsumed: qty * Math.max(w, h), cellW: Math.min(w, h), cellH: Math.max(w, h) };
  }

  if (length1 <= length2) {
    return { colsAcross: cols1, rowsNeeded: Math.ceil(qty / cols1), lengthConsumed: length1, cellW: w, cellH: h };
  } else {
    return { colsAcross: cols2, rowsNeeded: Math.ceil(qty / cols2), lengthConsumed: length2, cellW: h, cellH: w };
  }
}

/**
 * Calculates total print length using 2D grid packing.
 * Each image type is independently packed onto sheets.
 * Reports the ACTUAL consumed length (not full-sheet rounding).
 *
 * @param {Array<Object>} images - Array of image objects from imageProcessor
 * @returns {Object} { totalWidth, totalLength, imageCount, sheetDetails }
 */
export function calculatePackedDimensions(images) {
  if (!images || images.length === 0) {
    return { totalWidth: 0, totalLength: 0, imageCount: 0, sheetDetails: [] };
  }

  const validImages = images.filter(img => img.isValid);

  if (validImages.length === 0) {
    return { totalWidth: 0, totalLength: 0, imageCount: 0, sheetDetails: [] };
  }

  let totalLength = 0;
  let totalWidth = 0;
  const sheetDetails = [];

  validImages.forEach(img => {
    const qty = img.quantity || 1;
    const layout = bestContinuousLayout(img.width, img.length, qty);

    let imgLength = layout.lengthConsumed;
    totalLength += imgLength;

    if (img.width > totalWidth) {
      totalWidth = img.width;
    }

    sheetDetails.push({
      name: img.name,
      width: img.width,
      length: img.length,
      quantity: qty,
      colsAcross: layout.colsAcross,
      rowsNeeded: layout.rowsNeeded,
      totalLengthInches: Number(imgLength.toFixed(2)),
    });
  });

  return {
    totalWidth: Number(totalWidth.toFixed(2)),
    totalLength: Number(totalLength.toFixed(2)),
    imageCount: validImages.length,
    sheetDetails,
  };
}
