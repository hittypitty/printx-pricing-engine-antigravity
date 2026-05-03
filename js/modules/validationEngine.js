/**
 * Validation Engine — Input validation, width guard
 * Pure function module — uses PRINTABLE_WIDTH from configStore.
 */

import { getConfig } from '../state/configStore.js';

/**
 * Validate all user inputs before the pipeline runs.
 *
 * @param {{
 *   format: string,
 *   quantity: number,
 *   rawLength: string,
 *   printableWidth: number
 * }} input
 * @returns {{ isValid: boolean, error: string | null }}
 */
export function validateInputs({ format, quantity, rawLength, printableWidth }) {
  const { formats } = getConfig();
  const maxWidth = formats.PRINTABLE_WIDTH;

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

  if (format === 'Meters') {
    if (!rawLength || rawLength.trim() === '') {
      return {
        isValid: false,
        error: 'Length is required for Meters format.',
      };
    }
    if (/[^0-9+\-*x.m\s]/i.test(rawLength)) {
      return {
        isValid: false,
        error: 'Length contains invalid characters.',
      };
    }
  }

  return { isValid: true, error: null };
}
