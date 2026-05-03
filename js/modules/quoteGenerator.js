/**
 * Quote Generator — Builds the WhatsApp-ready client quote message
 * Pure function module — takes state, returns formatted string.
 */

/**
 * Generate the client-facing quote message.
 * Matches the defined format: emoji prefixes, conditional lines, UPI footer.
 *
 * @param {object} state - Full computed state object
 * @returns {string} The formatted quote text
 */
export function generateQuote(state) {
  const {
    format, pricingWidth, length, quantity,
    isSheetFormat, rateApplied, methodLabel,
    deliveryMethod, partnerName, shippingCost, countedWeight, eta,
    packagingCost, printCost, conversionCost, designCount, finalTotal,
  } = state;

  const lines = [];

  lines.push('Hello! 🌟 Thank you for reaching out to us.');
  lines.push('');
  lines.push('Here is the quote for your DTF print requirement:');
  lines.push(`📏 Size: ${format} (${pricingWidth}" x ${length}")`);

  if (isSheetFormat) {
    lines.push(`📦 Quantity: ${quantity} piece(s)`);
  } else {
    lines.push(`📏 Total Running: ${state.totalMeters.toFixed(2)} meters`);
  }

  lines.push(`🖨️ Print Cost: ₹${printCost + conversionCost}`);

  if (deliveryMethod === 'pickup') {
    lines.push('🏢 Delivery: Office Pickup (Free)');
  } else {
    lines.push(`🚚 Delivery Cost: ₹${shippingCost + packagingCost} (${partnerName} - ETA: ${eta})`);
  }

  lines.push('');
  lines.push(`💰 Final Total: ₹${finalTotal}`);
  
  if (deliveryMethod !== 'pickup') {
    lines.push('');
    lines.push('📦 Note:');
    lines.push('Delivery charges are estimated based on current weight.');
    lines.push('Final charges may vary after packaging.');
    lines.push('Our team will confirm before dispatch.');
  }

  lines.push('');
  lines.push('To proceed with the order, please make the payment via UPI/Bank Transfer and share the receipt.');
  lines.push('');
  lines.push('Let us know if you have any questions! Have a great day. 😊');

  return lines.join('\n');
}
