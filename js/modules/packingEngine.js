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
 * Calculate grid packing for a single image type.
 * Tries both orientations, picks the one that fits more copies.
 *
 * Returns { fitPerSheet, colsAcross, rowsDown, cellW, cellH }
 * so we can compute actual consumed length on partial sheets.
 */
function bestGridLayout(imgWidth, imgLength) {
  const w = imgWidth + MARGIN_INCHES;
  const h = imgLength + MARGIN_INCHES;

  // Orientation 1: width along roll, length along sheet
  const cols1 = Math.floor(PRINTABLE_WIDTH / w);
  const rows1 = Math.floor(SHEET_LENGTH / h);
  const fit1 = cols1 * rows1;

  // Orientation 2: rotated
  const cols2 = Math.floor(PRINTABLE_WIDTH / h);
  const rows2 = Math.floor(SHEET_LENGTH / w);
  const fit2 = cols2 * rows2;

  if (fit1 >= fit2) {
    return { fitPerSheet: fit1, colsAcross: cols1, rowsDown: rows1, cellW: w, cellH: h };
  } else {
    return { fitPerSheet: fit2, colsAcross: cols2, rowsDown: rows2, cellW: h, cellH: w };
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
    const grid = bestGridLayout(img.width, img.length);

    // Safety: if nothing fits (image too large), treat as 1 per sheet
    const effectiveFit = grid.fitPerSheet > 0 ? grid.fitPerSheet : 1;
    const fullSheets = Math.floor(qty / effectiveFit);
    const remainder = qty % effectiveFit;

    // Full sheets contribute full 39" each
    let imgLength = fullSheets * SHEET_LENGTH;

    // Last partial sheet: calculate actual rows consumed
    if (remainder > 0 && grid.colsAcross > 0) {
      const rowsUsed = Math.ceil(remainder / grid.colsAcross);
      imgLength += rowsUsed * grid.cellH;
    } else if (remainder > 0) {
      // Fallback: if colsAcross is somehow 0, count each as a full sheet
      imgLength += remainder * SHEET_LENGTH;
    }

    totalLength += imgLength;

    if (img.width > totalWidth) {
      totalWidth = img.width;
    }

    sheetDetails.push({
      name: img.name,
      width: img.width,
      length: img.length,
      quantity: qty,
      fitPerSheet: effectiveFit,
      fullSheets,
      remainder,
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
