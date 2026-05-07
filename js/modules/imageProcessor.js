/**
 * Image Processor
 * Reads PNG files, calculates dimensions in inches (300 DPI), applies orientation rules, and validates constraints.
 */

export const DPI = 300;
export const MAX_PRINTABLE_WIDTH_INCHES = 22.5;

async function getPngDpi(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target.result);
        if (view.getUint32(0) !== 0x89504e47) return resolve(null); // Not a PNG
        
        let offset = 8;
        while (offset < view.byteLength) {
          const length = view.getUint32(offset);
          const type = view.getUint32(offset + 4);
          
          if (type === 0x70485973) { // 'pHYs' chunk
            const ppuX = view.getUint32(offset + 8);
            const unit = view.getUint8(offset + 16);
            if (unit === 1) { // 1 means pixels per meter
              return resolve(Math.round(ppuX * 0.0254));
            } else {
              return resolve(null);
            }
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
 * Process a single image file.
 * @param {File} file 
 * @returns {Promise<Object>} Image metadata and validation status
 */
export async function processImage(file) {
  const detectedDpi = await getPngDpi(file);
  const activeDpi = detectedDpi || 300;
  const dpiConfidence = detectedDpi ? 'high' : 'low';

  return new Promise((resolve) => {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Validate file type natively just in case
    if (file.type !== 'image/png') {
      resolve({
        id,
        name: file.name,
        isValid: false,
        error: 'Only PNG files are supported.'
      });
      return;
    }

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
        const cw = Math.round(originalWidthPx * scale);
        const ch = Math.round(originalHeightPx * scale);
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        const data = ctx.getImageData(0, 0, cw, ch).data;

        // Sample positions: corners, edge midpoints, and a grid of border pixels
        const samplePoints = [
          [0, 0], [cw - 1, 0], [0, ch - 1], [cw - 1, ch - 1],             // corners
          [Math.floor(cw / 2), 0], [Math.floor(cw / 2), ch - 1],           // top/bottom mid
          [0, Math.floor(ch / 2)], [cw - 1, Math.floor(ch / 2)],           // left/right mid
        ];
        // Also sample every 10th pixel along all four edges
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
          const alpha = data[idx + 3];
          if (alpha < 250) {  // Found a transparent/semi-transparent pixel
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

      // Orientation Logic: width = smaller side, length = larger side
      const width = Math.min(widthInchesRaw, heightInchesRaw);
      const length = Math.max(widthInchesRaw, heightInchesRaw);

      // Validation
      let isValid = true;
      let error = null;
      let hasWarning = false;
      let warning = null;
      let requiresOverride = false;

      if (!hasTransparency) {
        isValid = false;
        error = 'Image does not have a transparent background. DTF requires PNG with transparent background.';
      } else if (width > MAX_PRINTABLE_WIDTH_INCHES) {
        if (dpiConfidence === 'high') {
          isValid = false;
          error = `Width exceeds maximum printable size of ${MAX_PRINTABLE_WIDTH_INCHES}".`;
        } else {
          hasWarning = true;
          warning = `⚠️ Size may exceed printable width (${MAX_PRINTABLE_WIDTH_INCHES}"). Please confirm actual size.`;
          requiresOverride = true;
        }
      }

      resolve({
        id,
        name: file.name,
        file,
        dataUrl,
        originalWidthPx,
        originalHeightPx,
        width: Number(width.toFixed(2)),
        length: Number(length.toFixed(2)),
        quantity: 1, // Default quantity
        isValid,
        error,
        dpi: activeDpi,
        dpiConfidence,
        hasWarning,
        warning,
        requiresOverride,
        isOverridden: false,
        hasTransparency
      });
    };

    img.onerror = () => {
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
