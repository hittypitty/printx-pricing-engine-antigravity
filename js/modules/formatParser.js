/**
 * Format Parser — Expression eval, unit conversion, dimension resolution
 * Pure function module — reads format definitions from config parameter.
 */

/**
 * Parse a length expression string (inches by default).
 *
 * Supported: plain inches ("20"), meters ("1m", "1.5 m", "2 meters"),
 * arithmetic with + - * and x ("20+19", "39x3", "1m+10").
 *
 * @param {string} rawLength
 * @returns {number} length in inches (2 decimals), or 0 if invalid
 */
export function parseLength(rawLength) {
  if (rawLength === null || rawLength === undefined) return 0;
  let expr = String(rawLength).trim().toLowerCase();
  if (!expr) return 0;

  // Number followed by a meter unit → (number*39). Units must directly follow a number.
  expr = expr.replace(/(\d*\.?\d+)\s*(meters?|mtrs?|m)(?![a-z])/g, '($1*39)');
  expr = expr.replace(/x/g, '*');

  // After conversion only digits, operators, dots, brackets and spaces may remain
  if (!/^[0-9+\-*.()\s]+$/.test(expr)) return 0;

  try {
    const result = Function('"use strict"; return (' + expr + ')')();
    if (typeof result !== 'number' || !Number.isFinite(result) || result <= 0) return 0;
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
