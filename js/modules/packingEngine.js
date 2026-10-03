/**
 * Packing Engine — 2D packing on a continuous roll
 *
 * Two strategies are computed and the one that uses the LEAST running length wins:
 *   1. Grid per design  — each design packed in its own grid (best for large qty of one design)
 *   2. Shelf packing    — all pieces of all designs placed row by row, so different
 *                         designs can sit side by side (best for mixed small designs)
 *
 * Reports ACTUAL consumed length (ceiled to whole inches), not full-sheet allocation.
 */

export const MARGIN_INCHES = 0.2;
export const PRINTABLE_WIDTH = 22.8;

// Above this many total pieces, skip shelf packing (grid is already near-optimal for bulk)
const SHELF_PIECE_LIMIT = 5000;
const EPS = 1e-9;

/**
 * Grid layout for a single design on a continuous roll.
 * Tries both orientations, picks the one that consumes the least running length.
 *
 * Returns { colsAcross, rowsNeeded, lengthConsumed, cellW, cellH, fits }
 */
function bestContinuousLayout(imgWidth, imgLength, qty, printableWidth = PRINTABLE_WIDTH, margin = MARGIN_INCHES) {
  // Single copy: no margins needed — choose the orientation that fits and uses least length
  if (qty === 1) {
    const options = [];
    if (imgWidth <= printableWidth + EPS) options.push({ across: imgWidth, along: imgLength });
    if (imgLength <= printableWidth + EPS) options.push({ across: imgLength, along: imgWidth });
    if (options.length === 0) {
      return { colsAcross: 1, rowsNeeded: 1, lengthConsumed: Math.max(imgWidth, imgLength), cellW: Math.min(imgWidth, imgLength), cellH: Math.max(imgWidth, imgLength), fits: false };
    }
    options.sort((a, b) => a.along - b.along);
    const o = options[0];
    return { colsAcross: 1, rowsNeeded: 1, lengthConsumed: o.along, cellW: o.across, cellH: o.along, fits: true };
  }

  // Multiple copies: add margins for spacing between items
  const w = imgWidth + margin;
  const h = imgLength + margin;

  // Orientation 1: width across the roll
  const cols1 = Math.floor((printableWidth + EPS) / w);
  const length1 = cols1 > 0 ? Math.ceil(qty / cols1) * h : Infinity;

  // Orientation 2: rotated
  const cols2 = Math.floor((printableWidth + EPS) / h);
  const length2 = cols2 > 0 ? Math.ceil(qty / cols2) * w : Infinity;

  if (length1 === Infinity && length2 === Infinity) {
    // Too large for the roll width in either orientation
    return { colsAcross: 1, rowsNeeded: qty, lengthConsumed: qty * Math.max(w, h), cellW: Math.min(w, h), cellH: Math.max(w, h), fits: false };
  }

  if (length1 <= length2) {
    return { colsAcross: cols1, rowsNeeded: Math.ceil(qty / cols1), lengthConsumed: length1, cellW: w, cellH: h, fits: true };
  }
  return { colsAcross: cols2, rowsNeeded: Math.ceil(qty / cols2), lengthConsumed: length2, cellW: h, cellH: w, fits: true };
}

/**
 * First-Fit Decreasing shelf packing of individual pieces.
 * @param {Array<{w:number,h:number}>} pieces - already-oriented cell sizes (incl. margin)
 * @returns {{ length:number, width:number }}
 */
function shelfPack(pieces, printableWidth) {
  const sorted = [...pieces].sort((a, b) => b.h - a.h || b.w - a.w);
  const shelves = []; // { height, used }
  for (const p of sorted) {
    let placed = false;
    for (const s of shelves) {
      if (p.h <= s.height + EPS && s.used + p.w <= printableWidth + EPS) {
        s.used += p.w;
        placed = true;
        break;
      }
    }
    if (!placed) shelves.push({ height: p.h, used: p.w });
  }
  return {
    length: shelves.reduce((sum, s) => sum + s.height, 0),
    width: shelves.reduce((max, s) => Math.max(max, s.used), 0),
  };
}

/**
 * Orient a piece for shelf packing.
 * mode 'flat' → shorter side along the roll; 'tall' → longer side along the roll.
 * Falls back to whichever orientation fits the width.
 */
function orientPiece(w, h, printableWidth, mode) {
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  const flat = { w: long, h: short };
  const tall = { w: short, h: long };
  const preferred = mode === 'flat' ? flat : tall;
  const other = mode === 'flat' ? tall : flat;
  if (preferred.w <= printableWidth + EPS) return preferred;
  if (other.w <= printableWidth + EPS) return other;
  return null;
}

/**
 * Calculates total print length using the better of grid packing and shelf packing.
 *
 * @param {Array<Object>} images - Array of image objects (width, length, quantity, isValid)
 * @returns {Object} { totalWidth, totalLength, imageCount, sheetDetails, strategy }
 */
export function calculatePackedDimensions(images, printableWidth = PRINTABLE_WIDTH, margin = MARGIN_INCHES) {
  if (!images || images.length === 0) {
    return { totalWidth: 0, totalLength: 0, imageCount: 0, sheetDetails: [], strategy: 'none' };
  }

  const validImages = images.filter(img => img.isValid && img.width > 0 && img.length > 0);

  if (validImages.length === 0) {
    return { totalWidth: 0, totalLength: 0, imageCount: 0, sheetDetails: [], strategy: 'none' };
  }

  // ---- Strategy 1: grid per design (stacked) ----
  let gridLength = 0;
  let gridWidth = 0;
  let allFit = true;
  const sheetDetails = [];

  validImages.forEach(img => {
    const qty = img.quantity || 1;
    const layout = bestContinuousLayout(img.width, img.length, qty, printableWidth, margin);
    if (!layout.fits) allFit = false;

    gridLength += layout.lengthConsumed;
    gridWidth = Math.max(gridWidth, layout.cellW * layout.colsAcross);

    sheetDetails.push({
      name: img.name,
      width: img.width,
      length: img.length,
      quantity: qty,
      colsAcross: layout.colsAcross,
      rowsNeeded: layout.rowsNeeded,
      totalLengthInches: Number(layout.lengthConsumed.toFixed(2)),
    });
  });

  let bestLength = gridLength;
  let bestWidth = gridWidth;
  let strategy = 'grid';

  // ---- Strategy 2: shelf packing across designs ----
  const totalPieces = validImages.reduce((sum, img) => sum + (img.quantity || 1), 0);
  const isSinglePiece = totalPieces === 1;

  if (allFit && !isSinglePiece && validImages.length > 1 && totalPieces <= SHELF_PIECE_LIMIT) {
    for (const mode of ['flat', 'tall']) {
      const pieces = [];
      let ok = true;
      for (const img of validImages) {
        const o = orientPiece(img.width + margin, img.length + margin, printableWidth, mode);
        if (!o) { ok = false; break; }
        for (let i = 0; i < (img.quantity || 1); i++) pieces.push(o);
      }
      if (!ok) continue;
      const res = shelfPack(pieces, printableWidth);
      if (res.length < bestLength - EPS) {
        bestLength = res.length;
        bestWidth = res.width;
        strategy = 'shelf';
      }
    }
  }

  return {
    totalWidth: Number(bestWidth.toFixed(2)),
    totalLength: Math.ceil(bestLength - 1e-6),
    imageCount: validImages.length,
    sheetDetails,
    strategy,
  };
}
