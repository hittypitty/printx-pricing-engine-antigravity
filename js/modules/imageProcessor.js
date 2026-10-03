/**
 * Image Processor
 * Reads PNG files, calculates dimensions in inches (embedded DPI or 300 DPI fallback),
 * applies orientation rules, and validates constraints.
 */

export const DPI = 300;
export const MAX_PRINTABLE_WIDTH_INCHES = 22.8;

async function getPngDpi(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target.result);
        if (view.getUint32(0) !== 0x89504e47) return resolve(null); // Not a PNG

        let offset = 8;
        while (offset + 8 <= view.byteLength) {
          const length = view.getUint32(offset);
          const type = view.getUint32(offset + 4);

          if (type === 0x70485973) { // 'pHYs' chunk
            if (offset + 17 > view.byteLength) return resolve(null);
            const ppuX = view.getUint32(offset + 8);
            const unit = view.getUint8(offset + 16);
            if (unit === 1 && ppuX > 0) { // 1 means pixels per meter
              return resolve(Math.round(ppuX * 0.0254));
            }
            return resolve(null);
          }
          if (type === 0x49444154) break; // 'IDAT' chunk, pHYs should be before this

          offset += length + 12;
        }
        resolve(null);
      } catch (err) {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 65536)); // Only need first 64KB for headers
  });
}

/**
 * (Re)apply size validation for a processed image against a printable width.
 * Width rule is the same as the original engine (the "width" side must fit).
 * Transparency / read errors are kept as-is.
 *
 * @param {object} img - processed image object
 * @param {number} maxWidth - printable width for the current print technology
 * @returns {object} new image object
 */
export function validateImageSize(img, maxWidth = MAX_PRINTABLE_WIDTH_INCHES) {
  // Unreadable images (no pixel data) — nothing to re-check
  if (!img || !img.originalWidthPx) return img;

  if (img.hasTransparency === false) {
    return {
      ...img,
      isValid: false,
      error: 'Image does not have a transparent background. DTF requires PNG with transparent background.',
      hasWarning: false,
      warning: null,
      requiresOverride: false,
    };
  }

  const widthSide = img.width;

  if (img.isOverridden) {
    if (widthSide > maxWidth) {
      return {
        ...img,
        isValid: false,
        error: `Size ${img.width}" × ${img.length}" exceeds the printable width of ${maxWidth}".`,
        hasWarning: false,
        warning: null,
      };
    }
    return { ...img, isValid: true, error: null, hasWarning: false, warning: null };
  }

  if (widthSide > maxWidth) {
    if (img.dpiConfidence === 'high') {
      return {
        ...img,
        isValid: false,
        error: `Width exceeds maximum printable size of ${maxWidth}".`,
        hasWarning: false,
        warning: null,
        requiresOverride: false,
      };
    }
    return {
      ...img,
      isValid: true,
      error: null,
      hasWarning: true,
      warning: `⚠️ Size may exceed printable width (${maxWidth}"). Please confirm actual size.`,
      requiresOverride: true,
    };
  }

  return { ...img, isValid: true, error: null, hasWarning: false, warning: null, requiresOverride: false };
}

/**
 * Process a single image file.
 * @param {File} file
 * @param {number} [maxWidth] - printable width for the current print technology
 * @returns {Promise<Object>} Image metadata and validation status
 */
export async function processImage(file, maxWidth = MAX_PRINTABLE_WIDTH_INCHES) {
  const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

  // Validate file type natively just in case
  if (file.type !== 'image/png') {
    return {
      id,
      name: file.name,
      isValid: false,
      error: 'Only PNG files are supported.'
    };
  }

  const detectedDpi = await getPngDpi(file);
  const activeDpi = detectedDpi || DPI;
  const dpiConfidence = detectedDpi ? 'high' : 'low';

  return new Promise((resolve) => {
    const dataUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const originalWidthPx = img.naturalWidth;
      const originalHeightPx = img.naturalHeight;

      // --- Transparency check ---
      // Draw to offscreen canvas and sample corners + edges for alpha
      let hasTransparency = false;
      try {
        const canvas = document.createElement('canvas');
        // Use a scaled-down version if image is very large to save memory
        const maxDim = 512;
        const scale = Math.min(1, maxDim / Math.max(originalWidthPx, originalHeightPx));
        const cw = Math.max(1, Math.round(originalWidthPx * scale));
        const ch = Math.max(1, Math.round(originalHeightPx * scale));
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        const data = ctx.getImageData(0, 0, cw, ch).data;

        // Sample positions: corners, edge midpoints, and a grid of border pixels
        const samplePoints = [
          [0, 0], [cw - 1, 0], [0, ch - 1], [cw - 1, ch - 1],
          [Math.floor(cw / 2), 0], [Math.floor(cw / 2), ch - 1],
          [0, Math.floor(ch / 2)], [cw - 1, Math.floor(ch / 2)],
        ];
        for (let x = 0; x < cw; x += 10) {
          samplePoints.push([x, 0]);
          samplePoints.push([x, ch - 1]);
        }
        for (let y = 0; y < ch; y += 10) {
          samplePoints.push([0, y]);
          samplePoints.push([cw - 1, y]);
        }

        for (const [x, y] of samplePoints) {
          const idx = (y * cw + x) * 4;
          if (data[idx + 3] < 250) {  // Found a transparent/semi-transparent pixel
            hasTransparency = true;
            break;
          }
        }
      } catch (e) {
        // Canvas security error or other issue — skip check
        hasTransparency = true; // Don't block on failure
      }

      // Convert to inches using the detected or assumed DPI
      const widthInchesRaw = originalWidthPx / activeDpi;
      const heightInchesRaw = originalHeightPx / activeDpi;

      // Orientation: the side closest to the roll width becomes "width".
      // Packing still tries both orientations.
      let width, length;
      const diffW = Math.abs(widthInchesRaw - MAX_PRINTABLE_WIDTH_INCHES);
      const diffH = Math.abs(heightInchesRaw - MAX_PRINTABLE_WIDTH_INCHES);
      if (diffW <= diffH) {
        width = widthInchesRaw;
        length = heightInchesRaw;
      } else {
        width = heightInchesRaw;
        length = widthInchesRaw;
      }

      const base = {
        id,
        name: file.name,
        file,
        dataUrl,
        originalWidthPx,
        originalHeightPx,
        width: Number(width.toFixed(2)),
        length: Number(length.toFixed(2)),
        quantity: 1,
        isValid: true,
        error: null,
        dpi: activeDpi,
        dpiConfidence,
        hasWarning: false,
        warning: null,
        requiresOverride: false,
        isOverridden: false,
        hasTransparency,
      };

      resolve(validateImageSize(base, maxWidth));
    };

    img.onerror = () => {
      URL.revokeObjectURL(dataUrl);
      resolve({
        id,
        name: file.name,
        isValid: false,
        error: 'Failed to read image file.'
      });
    };

    img.src = dataUrl;
  });
}
