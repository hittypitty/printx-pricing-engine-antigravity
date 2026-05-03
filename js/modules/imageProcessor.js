/**
 * Image Processor
 * Reads PNG files, calculates dimensions in inches (300 DPI), applies orientation rules, and validates constraints.
 */

export const DPI = 72;
export const MAX_PRINTABLE_WIDTH_INCHES = 22.5;

/**
 * Process a single image file.
 * @param {File} file 
 * @returns {Promise<Object>} Image metadata and validation status
 */
export function processImage(file) {
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

      // Convert to inches
      const widthInchesRaw = originalWidthPx / DPI;
      const heightInchesRaw = originalHeightPx / DPI;

      // Orientation Logic: width = smaller side, length = larger side
      const width = Math.min(widthInchesRaw, heightInchesRaw);
      const length = Math.max(widthInchesRaw, heightInchesRaw);

      // Validation
      let isValid = true;
      let error = null;

      if (width > MAX_PRINTABLE_WIDTH_INCHES) {
        isValid = false;
        error = `Width exceeds maximum printable size of ${MAX_PRINTABLE_WIDTH_INCHES}".`;
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
        error
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
