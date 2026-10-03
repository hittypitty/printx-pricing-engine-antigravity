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
    printTechnology, uvPrintType, cart
  } = state;

  if (cart && cart.length > 0) {
    const lines = [];
    lines.push('Hello! 🌟 Thank you for reaching out to us.');
    lines.push('');
    
    const hasFabric = cart.some(item => item.printTechnology === 'fabric');
    const hasUV = cart.some(item => item.printTechnology === 'uv_dtf');
    const hasSublimation = cart.some(item => item.printTechnology === 'sublimation');
    
    let techHeader = 'print';
    const techCount = (hasFabric ? 1 : 0) + (hasUV ? 1 : 0) + (hasSublimation ? 1 : 0);
    if (techCount === 1) {
      if (hasFabric) techHeader = 'Fabric DTF print';
      else if (hasUV) techHeader = 'UV DTF print';
      else if (hasSublimation) techHeader = 'Sublimation print';
    }
    
    lines.push(`Here is the quote for your ${techHeader} requirement:`);
    lines.push('');
    lines.push('🛒 *Items:*');

    cart.forEach((item, index) => {
      let itemTech = 'Fabric DTF';
      if (item.printTechnology === 'uv_dtf') {
        itemTech = `UV DTF (${item.uvPrintType === '3d' ? '3D' : 'Normal'})`;
      } else if (item.printTechnology === 'sublimation') {
        itemTech = 'Sublimation';
      }

      const formatLabel = (item.format === 'Meters' || item.format === 'Roll') 
        ? `${item.format === 'Roll' ? 'Roll' : 'Meters'} (24" x ${item.length}")` 
        : `${item.format} (${item.pricingWidth}" x ${item.length}")`;
      
      lines.push(`${index + 1}. ${itemTech} — ${formatLabel}`);
      
      if (item.isSheetFormat) {
        lines.push(`   • Quantity: ${item.quantity} piece(s)`);
      } else {
        lines.push(`   • Total Running: ${item.totalMeters.toFixed(2)} meters`);
      }
      
      lines.push(`   • Print Cost: ₹${Math.ceil(item.printCost)}`);
      
      if (item.conversions && item.conversions.length > 0) {
        lines.push(`   • Conversions: ${item.conversionBreakdown}`);
      }
    });

    lines.push('');
    lines.push(`🖨️ Total Print Cost: ₹${Math.ceil(printCost)}`);
    if (conversionCost > 0) {
      lines.push(`✨ Total Conversion Cost: ₹${Math.ceil(conversionCost)}`);
    }

    if (deliveryMethod === 'pickup') {
      lines.push('🏢 Delivery: Office Pickup (Free)');
    } else if (deliveryMethod === 'transport') {
      lines.push(`🚚 Delivery Cost: ₹${Math.ceil(shippingCost)} (Local Transport)`);
    } else {
      lines.push(`🚚 Delivery Cost: ₹${Math.ceil(shippingCost + packagingCost)} (${partnerName}${eta ? ' - ETA: ' + eta : ''})`);
    }

    lines.push('');
    lines.push(`💰 *Final Total: ₹${Math.ceil(finalTotal)}*`);
    
    if (deliveryMethod === 'courier') {
      lines.push('');
      lines.push('📦 _Note:_');
      lines.push('_Delivery charges are estimated based on current weight._');
      lines.push('_Final charges may vary after packaging._');
      lines.push('_Our team will confirm before dispatch._');
    }

    lines.push('');
    lines.push('To proceed with the order, please make the payment via UPI/Bank Transfer and share the receipt.');
    lines.push('');
    lines.push('Let us know if you have any questions! Have a great day. 😊');

    return lines.join('\n');
  }

  const lines = [];

  lines.push('Hello! 🌟 Thank you for reaching out to us.');
  lines.push('');
  
  let techLabel = 'Fabric DTF';
  if (printTechnology === 'uv_dtf') {
    techLabel = `UV DTF (${uvPrintType === '3d' ? '3D' : 'Normal'})`;
  } else if (printTechnology === 'sublimation') {
    techLabel = 'Sublimation';
  }

  lines.push(`Here is the quote for your ${techLabel} print requirement:`);
  lines.push(`📏 Size: ${format} (${pricingWidth}" x ${length}")`);

  if (isSheetFormat) {
    lines.push(`📦 Quantity: ${quantity} piece(s)`);
  } else {
    lines.push(`📏 Total Running: ${state.totalMeters.toFixed(2)} meters`);
  }

  lines.push(`🖨️ Print Cost: ₹${Math.ceil(printCost)}`);
  
  if (state.conversions && state.conversions.length > 0) {
    lines.push(`✨ Conversions: ${state.conversionBreakdown}`);
  }

  if (deliveryMethod === 'pickup') {
    lines.push('🏢 Delivery: Office Pickup (Free)');
  } else if (deliveryMethod === 'transport') {
    lines.push(`🚚 Delivery Cost: ₹${Math.ceil(shippingCost)} (Local Transport)`);
  } else {
    lines.push(`🚚 Delivery Cost: ₹${Math.ceil(shippingCost + packagingCost)} (${partnerName}${eta ? ' - ETA: ' + eta : ''})`);
  }

  lines.push('');
  lines.push(`💰 *Final Total: ₹${Math.ceil(finalTotal)}*`);
  
  if (deliveryMethod === 'courier') {
    lines.push('');
    lines.push('📦 _Note:_');
    lines.push('_Delivery charges are estimated based on current weight._');
    lines.push('_Final charges may vary after packaging._');
    lines.push('_Our team will confirm before dispatch._');
  }

  lines.push('');
  lines.push('To proceed with the order, please make the payment via UPI/Bank Transfer and share the receipt.');
  lines.push('');
  lines.push('Let us know if you have any questions! Have a great day. 😊');

  return lines.join('\n');
}
