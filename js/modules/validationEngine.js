/**
 * Validation Engine — Input validation, width guard
 * Pure function module — uses printable widths from config / formats.
 */

import { parseLength } from './formatParser.js';
import { getPrintableWidthFor, UV_CUSTOM_MAX_LENGTH } from '../config/formats.js';

/**
 * Validate all user inputs before the pipeline runs.
 *
 * @param {{
 *   format: string,
 *   quantity: number,
 *   rawLength: string,
 *   printableWidth: number,
 *   printTechnology: string
 * }} input
 * @param {object} config - Configuration object
 * @returns {{ isValid: boolean, error: string | null }}
 */
export function validateInputs({ format, quantity, rawLength, printableWidth, printTechnology }, config) {
  if (!config) {
    throw new Error('validateInputs: config is required');
  }
  const { formats } = config;

  if (!formats.FORMATS[format]) {
    return { isValid: false, error: 'Please select a valid format.' };
  }

  const maxWidth = printTechnology === 'sublimation'
    ? getPrintableWidthFor('sublimation')
    : formats.PRINTABLE_WIDTH;

  if (printableWidth > maxWidth) {
    return {
      isValid: false,
      error: `Width cannot exceed ${maxWidth} inches (printable area).`,
    };
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return {
      isValid: false,
      error: 'Quantity must be a positive whole number.',
    };
  }

  if (format === 'Meters' || format === 'Custom' || format === 'Roll') {
    const raw = rawLength === null || rawLength === undefined ? '' : String(rawLength);
    if (raw.trim() === '') {
      return {
        isValid: false,
        error: `Length is required for ${format} format.`,
      };
    }
    // Allow digits, operators, x, spaces and the meter unit words
    const stripped = raw.toLowerCase().replace(/meters?|mtrs?/g, '');
    if (/[^0-9+\-*x.m()\s]/i.test(stripped)) {
      return {
        isValid: false,
        error: 'Length contains invalid characters.',
      };
    }
    const parsedLen = parseLength(raw);
    if (parsedLen <= 0) {
      return {
        isValid: false,
        error: 'Enter a valid length greater than 0 (e.g. 20, 1m, 20+19 or 39x3).',
      };
    }
    if (format === 'Custom' && printTechnology !== 'sublimation') {
      if (parsedLen < 8 || parsedLen > UV_CUSTOM_MAX_LENGTH) {
        return {
          isValid: false,
          error: `Length must be between 8 and ${UV_CUSTOM_MAX_LENGTH} inches for Custom format.`,
        };
      }
    }
  }

  return { isValid: true, error: null };
}
