/**
 * Format Parser — Expression eval, unit conversion, dimension resolution
 * Pure function module — reads format definitions from config parameter.
 */

/**
 * Parse a length expression string for Meters format.
 * @param {string} rawLength
 * @returns {number} lengthInInches (ceiled integer), or 0 if invalid
 */
export function parseLength(rawLength) {
  if (!rawLength || typeof rawLength !== 'string') return 0;

  let expr = rawLength.trim().toLowerCase();
  expr = expr.replace(/x/g, '*');
  expr = expr.replace(/meters/gi, '*39');
  expr = expr.replace(/m/gi, '*39');

  try {
    const result = Function('"use strict"; return (' + expr + ')')();
    if (typeof result !== 'number' || isNaN(result) || result <= 0) return 0;
    return Number(result.toFixed(2));
  } catch (e) {
    return 0;
  }
}

/**
 * Resolve full dimensions for any format.
 * Returns BOTH widths — downstream modules pick the one they need.
 *
 * @param {string} format
 * @param {number} quantity
 * @param {string} [rawLength]
 * @param {object} config - Configuration object
 * @returns {object|null}
 */
export function resolveDimensions(format, quantity, rawLength, config) {
  if (!config) {
    throw new Error('resolveDimensions: config is required');
  }
  const { formats } = config;
  const fmt = formats.FORMATS[format];
  if (!fmt) return null;

  const isSheetFormat = format !== 'Meters' && format !== 'Roll';
  const length = (format === 'Meters' || format === 'Custom' || format === 'Roll') ? parseLength(rawLength) : fmt.length;
  const qty = isSheetFormat ? quantity : 1;

  return {
    format,
    printableWidth: fmt.printableWidth,
    pricingWidth: fmt.pricingWidth,
    length,
    quantity: qty,
    totalMeters: (length * qty) / 39,
    totalSqInches: fmt.pricingWidth * length * qty,
    isSheetFormat,
  };
}

