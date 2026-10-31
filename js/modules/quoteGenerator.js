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
const fmtMoney = n => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function generateQuote(state) {
  const {
    format, pricingWidth, length, quantity,
    isSheetFormat, rateApplied, methodLabel,
    deliveryMethod, partnerName, shippingCost, countedWeight, eta,
    packagingCost, printCost, conversionCost, designCount, finalTotal,
    printTechnology, uvPrintType, cart, dropshipItem,
    gstAddTotal, gstIncludedTotal, gstBaseTotal
  } = state;

  // GST / Tax section (Digital Printing only; "Add" is charged on top, "Inclusive" is already inside the amount)
  const gstLines = () => {
    const out = [];
    if (gstAddTotal > 0) out.push(`🧾 GST (18%) added: ₹${fmtMoney(gstAddTotal)}`);
    if (gstIncludedTotal > 0) out.push(`🧾 GST Inclusive (18%): ₹${fmtMoney(gstIncludedTotal)} included in the amount (base ₹${fmtMoney(gstBaseTotal)})`);
    return out;
  };

  if (cart && cart.length > 0) {
    const lines = [];
    lines.push('Hello! 🌟 Thank you for reaching out to us.');
    lines.push('');
    
    const hasFabric = cart.some(item => item.printTechnology === 'fabric');
    const hasUV = cart.some(item => item.printTechnology === 'uv_dtf');
    const hasSublimation = cart.some(item => item.printTechnology === 'sublimation');
    const hasDropship = cart.some(item => item.printTechnology === 'dropship');
    const hasDigital = cart.some(item => item.printTechnology === 'digital');
    
    let techHeader = 'print';
    const techCount = (hasFabric ? 1 : 0) + (hasUV ? 1 : 0) + (hasSublimation ? 1 : 0) + (hasDropship ? 1 : 0) + (hasDigital ? 1 : 0);
    if (techCount === 1) {
      if (hasFabric) techHeader = 'Fabric DTF print';
      else if (hasUV) techHeader = 'UV DTF print';
      else if (hasSublimation) techHeader = 'Sublimation print';
      else if (hasDropship) techHeader = 'dropship';
      else if (hasDigital) techHeader = 'digital printing';
    }
    
    lines.push(`Here is the quote for your ${techHeader} requirement:`);
    lines.push('');
    lines.push('🛒 *Items:*');

    cart.forEach((item, index) => {
      if (item.printTechnology === 'digital' && item.digitalLines) {
        lines.push(`${index + 1}. Digital Printing — ${item.variant} (12" × 18")`);
        lines.push(`   • Sheets: ${item.quantity}`);
        item.digitalLines.forEach(l => lines.push(`   • ${l.label}: ${l.amount ? '₹' + fmtMoney(l.amount) : (l.note || 'Included')}`));
        lines.push(`   • Cost: ₹${Math.ceil(item.printCost)}`);
        return;
      }
      if (item.printTechnology === 'dropship' || item.printTechnology === 'digital') {
        lines.push(`${index + 1}. ${item.variant}`);
        if (item.options) lines.push(`   • Print: ${item.options}`);
        lines.push(`   • Quantity: ${item.quantity} piece(s) × ₹${item.rate}`);
        lines.push(`   • Cost: ₹${Math.ceil(item.printCost)}`);
        return;
      }
      let itemTech = 'Fabric DTF';
      if (item.printTechnology === 'uv_dtf') {
        itemTech = `UV DTF (${item.uvPrintType === '3d' ? '3D' : item.uvPrintType === 'double' ? 'Double Sided' : 'Normal'})`;
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
    lines.push(`${cart.every(i => i.printTechnology === 'dropship' || i.printTechnology === 'digital') ? '🛍️ Total Product Cost' : '🖨️ Total Print Cost'}: ₹${Math.ceil(printCost)}`);
    if (conversionCost > 0) {
      lines.push(`✨ Total Conversion Cost: ₹${Math.ceil(conversionCost)}`);
    }
    gstLines().forEach(l => lines.push(l));

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

  if ((printTechnology === 'dropship' || printTechnology === 'digital') && dropshipItem) {
    lines.push(`Here is the quote for your ${printTechnology === 'digital' ? 'digital printing' : 'dropship'} requirement:`);
    lines.push(`🛍️ Product: ${dropshipItem.variant}`);
    if (dropshipItem.options) lines.push(`🖨️ Print: ${dropshipItem.options}`);
    if (dropshipItem.digital) {
      lines.push('📐 Sheet size: 12" × 18"');
      if (dropshipItem.autoSheets) lines.push(`📐 Designs: ${dropshipItem.autoPieces} piece(s) packed on ${dropshipItem.autoSheets} sheet(s)`);
      lines.push(`📦 Sheets: ${dropshipItem.qty}`);
      dropshipItem.digital.lines.forEach(l => lines.push(`   • ${l.label}: ${l.amount ? '₹' + fmtMoney(l.amount) : (l.note || 'Included')}`));
      lines.push(`💵 Subtotal: ₹${Math.ceil(printCost)}`);
      gstLines().forEach(l => lines.push(l));
    } else {
      if (dropshipItem.autoSheets) {
        lines.push(`📐 Designs: ${dropshipItem.autoPieces} piece(s) packed on ${dropshipItem.autoSheets} sheet(s)`);
        lines.push(`📦 Sheets: ${dropshipItem.autoSheets} × ₹${dropshipItem.rate}`);
      } else {
        lines.push(`📦 Quantity: ${dropshipItem.qty} piece(s) × ₹${dropshipItem.rate}`);
      }
      lines.push(`💵 Product Cost: ₹${Math.ceil(printCost)}`);
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
  
  let techLabel = 'Fabric DTF';
  if (printTechnology === 'uv_dtf') {
    techLabel = `UV DTF (${uvPrintType === '3d' ? '3D' : uvPrintType === 'double' ? 'Double Sided' : 'Normal'})`;
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
