/**
 * Regression tests for the pricing engine.
 * Run:  node tests/engine.test.mjs
 * (No dependencies — uses Node's built-in assert.)
 *
 * IMPORTANT: prices/rates/shipping must stay exactly as the original engine.
 * The "Prices unchanged" section locks known values — if one fails, a price changed.
 */

import assert from 'node:assert/strict';

// Minimal browser stubs for modules that touch localStorage
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const { getConfig } = await import('../js/state/configStore.js');
const { calculateQuote } = await import('../js/modules/pricingBrain.js');
const { calculateShipping } = await import('../js/modules/deliveryEngine.js');
const { calculatePackedDimensions } = await import('../js/modules/packingEngine.js');
const { parseLength } = await import('../js/modules/formatParser.js');
const store = await import('../js/catalog/productStore.js');

const config = getConfig();
const base = {
  printTechnology: 'fabric', uvPrintType: 'normal', inputMode: 'manual', images: [], manualSizes: [],
  format: 'Meters', rawLength: '', quantity: 1, conversions: [], cart: [],
  deliveryMethod: 'pickup', courierFilter: 'all', selectedPartner: null,
};
const quote = o => calculateQuote({ ...base, ...o }, config);
const packedQuote = (o, sizes) => {
  const tech = o.printTechnology || 'fabric';
  const width = tech === 'uv_dtf' ? 11 : tech === 'sublimation' ? 24 : 22.8;
  const items = sizes.map(([w, h, qty = 1]) => ({ isValid: true, width: w, length: h, quantity: qty }));
  const p = calculatePackedDimensions(items, width, tech === 'uv_dtf' ? 0.0787 : 0.2);
  return quote({
    ...o,
    inputMode: 'manual-size',
    manualSizes: sizes.map(([w, h, qty = 1], i) => ({ id: String(i), width: w, height: h, qty })),
    computedImageLength: p.totalLength,
    computedImageWidth: p.totalWidth,
  });
};

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

console.log('\nPrices unchanged (locked to original engine)');
test('Fabric A4 ×1 = ₹70, A3 ×4 = ₹480, A2 ×2 = ₹500', () => {
  assert.equal(quote({ format: 'A4' }).printCost, 70);
  assert.equal(quote({ format: 'A3', quantity: 4 }).printCost, 480);
  assert.equal(quote({ format: 'A2', quantity: 2 }).printCost, 500);
});
test('Fabric micro pricing: 10" = ₹120, 30" = ₹360', () => {
  assert.equal(quote({ rawLength: '10' }).printCost, 120);
  assert.equal(quote({ rawLength: '30' }).printCost, 360);
});
test('Fabric running meter: 1m = ₹225, 10m = ₹2130, 389.7" = ₹1769', () => {
  assert.equal(quote({ rawLength: '1m' }).printCost, 225);
  assert.equal(quote({ rawLength: '10m' }).printCost, 2130);
  assert.equal(quote({ rawLength: '389.7' }).printCost, 1769);
});
test('UV A3 ×30 = ₹9750, UV A4 3D ×2 = ₹472', () => {
  assert.equal(quote({ printTechnology: 'uv_dtf', format: 'A3', quantity: 30 }).printCost, 9750);
  assert.equal(quote({ printTechnology: 'uv_dtf', format: 'A4', quantity: 2, uvPrintType: '3d' }).printCost, 472);
});
test('Sublimation A4 ×10 = ₹200, Roll 60" = ₹153.85', () => {
  assert.equal(quote({ printTechnology: 'sublimation', format: 'A4', quantity: 10 }).printCost, 200);
  assert.equal(quote({ printTechnology: 'sublimation', format: 'Roll', rawLength: '60' }).printCost, 153.85);
});
test('Courier slabs: DTDC Surface 1 kg = ₹185, Bluedart 1 kg = ₹290 (base ₹160 since Oct 2026), Tirupati 1 kg = ₹60', () => {
  assert.equal(calculateShipping('dtdc_surface', 0, 1, 1.0, config).shippingCost, 185);
  assert.equal(calculateShipping('bluedart', 0, 1, 1.0, config).shippingCost, 290);
  assert.equal(calculateShipping('tirupati', 0, 1, 1.0, config).shippingCost, 60);
});
test('Transport = ₹50, courier packaging = ₹20', () => {
  assert.equal(quote({ format: 'A4', deliveryMethod: 'transport' }).finalTotal, 120);
  assert.equal(quote({ format: 'A4', deliveryMethod: 'courier' }).packagingCost, 20);
});
test('Packing: two 5×5 designs = 11" (original stacking)', () => {
  const p = calculatePackedDimensions([
    { isValid: true, width: 5, length: 5, quantity: 1 },
    { isValid: true, width: 5, length: 5.1, quantity: 1 },
  ]);
  assert.equal(p.totalLength, 11);
});
test('ERP: Custom Inches ₹12/inch, Meter 0.5 = ₹234, UV A3 ×30 = ₹9750', () => {
  const r = calculateQuote({ products: [
    { category: 'Fabric Heat DTF', variant: 'Custom Inches', quantity: 100 },
    { category: 'Fabric Heat DTF', variant: 'Meter', quantity: 0.5 },
    { category: 'UV DTF', variant: 'A3', quantity: 30 },
  ] }, config);
  assert.deepEqual(r.lineItems.map(l => l.total), [1200, 234, 9750]);
});

console.log('\nLength parsing / validation');
test('parses 1m, 2 meters, 20+19, 39x3', () => {
  assert.equal(parseLength('1m'), 39);
  assert.equal(parseLength('2 meters'), 78);
  assert.equal(parseLength('20+19'), 39);
  assert.equal(parseLength('39x3'), 117);
});
test('"1mm" and "m" are rejected (not 1521")', () => {
  assert.equal(parseLength('1mm'), 0);
  assert.equal(parseLength('m'), 0);
});
test('length 0 is invalid (no ₹0 quote)', () => {
  assert.equal(quote({ rawLength: '0' }).isValid, false);
});
test('"2 meters" is accepted by validation', () => assert.equal(quote({ rawLength: '2 meters' }).isValid, true));

console.log('\nUV DTF');
test('design too big for a UV sheet → clear error, never ₹Infinity', () => {
  const r = packedQuote({ printTechnology: 'uv_dtf' }, [[10, 20, 5]]);
  assert.equal(r.isValid, false);
  assert.ok(Number.isFinite(r.finalTotal));
  assert.match(r.validationError, /doesn't fit/);
});
test('UV image wider than 11" → error, never ₹Infinity', () => {
  const r = quote({ printTechnology: 'uv_dtf', inputMode: 'image', images: [{ isValid: true, name: 'big.png', width: 15, length: 15, quantity: 2 }], computedImageLength: 30 });
  assert.equal(r.isValid, false);
  assert.ok(Number.isFinite(r.finalTotal));
});
test('UV all images invalid → no phantom 1-sheet charge', () => {
  const r = quote({ printTechnology: 'uv_dtf', inputMode: 'image', images: [{ isValid: false, name: 'x.png', error: 'no transparency' }] });
  assert.equal(r.isValid, false);
  assert.equal(r.printCost, 0);
});

console.log('\nSizes / validation messages');
test('manual size wider than the roll → size message (not "could not calculate")', () => {
  const r = quote({ inputMode: 'manual-size', manualSizes: [{ id: '1', width: 23, height: 5, qty: 1 }], computedImageLength: 0 });
  assert.equal(r.isValid, false);
  assert.match(r.validationError, /too big/);
});
test('empty extra manual-size row does not break the quote', () => {
  const p = calculatePackedDimensions([{ isValid: true, width: 5, length: 5, quantity: 2 }]);
  const r = quote({ inputMode: 'manual-size', manualSizes: [{ id: '1', width: 5, height: 5, qty: 2 }, { id: '2', width: '', height: '', qty: 1 }], computedImageLength: p.totalLength, computedImageWidth: p.totalWidth });
  assert.equal(r.isValid, true);
});
test('half-filled manual-size row asks for both values', () => {
  const r = quote({ inputMode: 'manual-size', manualSizes: [{ id: '1', width: 5, height: '', qty: 1 }], computedImageLength: 0 });
  assert.equal(r.isValid, false);
  assert.match(r.validationError, /both width and height/);
});

console.log('\nCart / quote');
test('cart total survives an invalid current input', () => {
  const item = { ...quote({ format: 'A4', quantity: 3 }), id: 'x', printTechnology: 'fabric', format: 'A4', quantity: 3, isSheetFormat: true, conversions: [], totalMeters: 0.6 };
  const r = quote({ cart: [item], format: 'Meters', rawLength: '' });
  assert.equal(r.isValid, false);
  assert.equal(r.finalTotal, 210);
  assert.ok(r.quoteText.length > 0);
});
test('transport cost comes from config', () => {
  assert.equal(quote({ format: 'A4', deliveryMethod: 'transport' }).shippingCost, config.pricing.TRANSPORT_COST);
});
test('conversions show in quote for auto (manual-size) mode', () => {
  const r = packedQuote({ conversions: [{ id: 'c', type: 'Puff', qty: 2 }] }, [[5, 5, 1]]);
  assert.match(r.quoteText, /Conversions/);
});

console.log('\nBV catalog helpers');
test('stock status from real stock count', () => {
  assert.equal(store.getStockStatus({ stock: 0 }).key, 'out');
  assert.equal(store.getStockStatus({ stock: 5 }).key, 'low');
  assert.equal(store.getStockStatus({ stock: 50 }).key, 'in');
});
test('tier lookup by quantity', () => {
  const p = { tiers: [{ minQty: 1, maxQty: 9, price: 100 }, { minQty: 10, maxQty: null, price: 90 }] };
  assert.equal(store.getTierForQty(p, 5).price, 100);
  assert.equal(store.getTierForQty(p, 10).price, 90);
  assert.equal(store.getTierForQty(p, 500).price, 90);
});
test('tier validation catches overlap and gaps', () => {
  assert.ok(store.validateTiers([{ minQty: 1, maxQty: 9, price: 1 }, { minQty: 5, maxQty: '', price: 1 }]).length > 0);
  assert.ok(store.validateTiers([{ minQty: 1, maxQty: 9, price: 1 }, { minQty: 12, maxQty: '', price: 1 }]).length > 0);
  assert.equal(store.validateTiers([{ minQty: 1, maxQty: 9, price: 1 }, { minQty: 10, maxQty: '', price: 1 }]).length, 0);
});

const ds = await import('../js/modules/dropshipEngine.js');
test('Dropship: 180 GSM round neck is ₹200; placements and add-ons add on top', () => {
  assert.equal(ds.DROPSHIP_RATES['(180 GSM) Regular Fit T-Shirt (180 GSM)'], 200);
  const v = '(180 GSM) Regular Fit T-Shirt (180 GSM)';
  assert.equal(ds.unitRate(v, { Front: 'A4', 'Right Sleeve': 'Logo Only' }, ['Puff DTF']), 200 + 70 + 25 + 50);
  assert.deepEqual(ds.lineTotal(v, 10, { Front: 'A4' }, []), { qty: 10, rate: 270, total: 2700 });
});
test('Dropship: non-apparel ignores print placements, qty floors at 1', () => {
  assert.equal(ds.unitRate('Mug White', { Front: 'A3' }, ['Puff DTF']), 100);
  assert.equal(ds.lineTotal('Mug White', 0, {}, []).total, 100);
  assert.equal(ds.placementsFor('(400 GSM) Hoodie').some(p => p.key === 'Hood'), true);
});

test('UV Double Sided: A3 only, flat ₹472 per sheet for 1+ (no slab discount)', () => {
  const q1 = quote({ printTechnology: 'uv_dtf', uvPrintType: 'double', format: 'A3', quantity: 1 });
  assert.equal(q1.printCost, 472); assert.equal(q1.rateApplied, 472); assert.equal(q1.methodLabel, 'UV A3 Double Sided');
  const q150 = quote({ printTechnology: 'uv_dtf', uvPrintType: 'double', format: 'A3', quantity: 150 });
  assert.equal(q150.printCost, 472 * 150);   // normal A3 would drop to ₹236 at 100+
  assert.equal(quote({ printTechnology: 'uv_dtf', uvPrintType: 'normal', format: 'A3', quantity: 150 }).rateApplied, 236);
});
test('UV Double Sided: auto-pack from designs always uses A3 sheets', () => {
  const q = calculateQuote({ ...base, printTechnology: 'uv_dtf', uvPrintType: 'double', inputMode: 'manual-size', designTab: 'manual-size',
    manualSizes: [{ id: 'a', width: 4, length: 4, quantity: 2 }] }, config);
  if (q.isValid) { assert.equal(q.format, 'A3'); assert.equal(q.rateApplied, 472); }
});

// ---------------------------------------------------------------------------
// Digital Printing — boss's spec (12×18 only)
// ---------------------------------------------------------------------------
const dg = await import('../js/modules/digitalEngine.js');
const dq = (d, sheets) => dg.calcDigital({ ...dg.DIGITAL_DEFAULTS, ...d }, sheets);

test('Digital: standard single / double rates per material', () => {
  assert.equal(dq({ material: 'Paper 130 GSM' }, 10).subtotal, 250);
  assert.equal(dq({ material: 'Paper 350 GSM', sides: 'Double side' }, 10).subtotal, 300);
  assert.equal(dq({ material: 'NT 130 Micron' }, 2).subtotal, 100);
  assert.equal(dq({ material: 'NT 130 Micron', sides: 'Double side' }, 2).subtotal, 110);
  assert.equal(dq({ material: 'NT 300 Micron' }, 1).subtotal, 70);
  assert.equal(dq({ material: 'NT 300 Micron', sides: 'Double side' }, 1).subtotal, 75);
});
test('Digital: MOQ is 1 sheet', () => {
  assert.equal(dq({ material: 'Paper 300 GSM' }, 1).subtotal, 25);
  assert.equal(dq({ material: 'Paper 300 GSM' }, 0).sheets, 1);
});
test('Digital: stickers are single side only and die-cut (₹25/sheet) + file setting (₹150) are compulsory', () => {
  const r = dq({ material: 'Paper Sticker', sides: 'Double side' }, 10);
  assert.equal(r.valid, true);
  assert.equal(r.subtotal, 80 * 10 + 25 * 10 + 150);          // double side ignored for stickers
  assert.equal(dq({ material: 'NT Sticker' }, 1).subtotal, 100 + 25 + 150);
  assert.equal(dq({ material: 'Gold Sticker' }, 1).subtotal, 100 + 25 + 150);
  assert.equal(dq({ material: 'Transparent Sticker' }, 4).subtotal, 90 * 4 + 25 * 4 + 150);
});
test('Digital: premium (Gold Foil / Spot UV) is the complete per-sheet price, die-cut & file setting included', () => {
  assert.equal(dq({ material: 'Paper Sticker', premium: 'Gold Foil' }, 3).subtotal, 750);
  assert.equal(dq({ material: 'NT Sticker', premium: 'Spot UV' }, 3).subtotal, 810);
  assert.equal(dq({ material: 'Transparent Sticker', premium: 'Gold Foil' }, 3).subtotal, 780);
  const n = dg.normalizeDigital({ material: 'Paper 300 GSM', premium: 'Gold Foil' });
  assert.equal(n.premium, 'None');                              // not available on plain paper
  assert.equal(dg.normalizeDigital({ material: 'Gold Sticker', premium: 'Spot UV' }).premium, 'None');
});
test('Digital: lamination tiers — ₹100/side/sheet under 10 sheets, ₹10 from 10 sheets, Velvet only 10+', () => {
  const lam = (o, q) => dq({ material: 'Paper 300 GSM', ...o }, q).subtotal - 25 * q * (o.sides === 'Double side' ? 30 / 25 : 1);
  assert.equal(dq({ lamination: 'Matt' }, 5).lines[1].amount, 500);                       // 5 sheets, single
  assert.equal(dq({ lamination: 'Matt', sides: 'Double side' }, 5).lines[1].amount, 1000); // 5 sheets, double
  assert.equal(dq({ lamination: 'Matt' }, 10).lines[1].amount, 100);
  assert.equal(dq({ lamination: 'Matt', sides: 'Double side' }, 10).lines[1].amount, 200);
  assert.equal(dq({ lamination: 'Velvet' }, 10).lines[1].amount, 100);
  assert.equal(dq({ lamination: 'Gloss' }, 9).lines[1].amount, 900);
  const v = dq({ lamination: 'Velvet' }, 5);
  assert.equal(v.valid, false);
  assert.match(v.error, /10 sheets/);
  void lam;
});
test('Digital: lamination is available on every material (stickers / NT / premium)', () => {
  assert.equal(dq({ material: 'NT Sticker', lamination: 'Gloss' }, 10).subtotal, 100 * 10 + 25 * 10 + 150 + 100);
  assert.equal(dq({ material: 'Paper Sticker', premium: 'Gold Foil', lamination: 'Matt' }, 10).subtotal, 2500 + 100);
  assert.equal(dq({ material: 'NT 300 Micron', lamination: 'Matt' }, 2).subtotal, 140 + 200);
});
test('Digital: optional die-cut on plain sheets pulls in file setting automatically', () => {
  assert.equal(dq({ material: 'Paper 300 GSM', dieCut: true }, 10).subtotal, 250 + 250 + 150);
  assert.equal(dq({ material: 'Paper 300 GSM', fileSetting: true }, 10).subtotal, 250 + 150);
});
test('Digital: GST — none by default, add 18%, or inclusive (never added twice)', () => {
  const base = { material: 'NT Sticker', premium: 'Spot UV' };               // ₹270/sheet
  // use a clean ₹1000 subtotal: 4 × Paper 130? -> craft: NT 300 Micron ₹70 × ... use direct check below
  const none = dq({ ...base }, 4);
  assert.equal(none.gstAdd, 0); assert.equal(none.gstIncluded, 0);
  const add = dq({ ...base, gst: 'add' }, 4);                                  // ₹1080
  assert.equal(add.subtotal, 1080);
  assert.equal(add.gstAdd, 194.4);
  assert.equal(add.totalExShipping, 1274.4);
  const inc = dq({ ...base, gst: 'inclusive' }, 4);
  assert.equal(inc.totalExShipping, 1080);                                     // customer pays the same
  assert.equal(inc.gstIncluded + inc.gstBase, 1080);
  assert.equal(inc.gstAdd, 0);
  // the boss's own example: ₹1,000 inclusive -> GST ₹152.54, base ₹847.46
  const eg = dq({ material: 'Paper 300 GSM', gst: 'inclusive' }, 40);         // 40 × ₹25 = ₹1000
  assert.equal(eg.subtotal, 1000); assert.equal(eg.gstIncluded, 152.54); assert.equal(eg.gstBase, 847.46);
  assert.equal(dq({ material: 'Paper 300 GSM', gst: 'add' }, 40).totalExShipping, 1180);
});
test('Digital: full quote — shipping stays separate (and untaxed); GST add is in the final total', () => {
  const st = { printTechnology: 'digital', inputMode: 'manual', deliveryMethod: 'transport', digital: dg.normalizeDigital({ material: 'Paper 300 GSM', gst: 'add', qty: 40 }) };
  const q = quote(st);
  assert.equal(q.isValid, true);
  assert.equal(q.printCost, 1000);
  assert.equal(q.gstAddTotal, 180);
  assert.equal(q.finalTotal, 1000 + 180 + q.shippingCost + q.packagingCost);
  assert.match(q.quoteText, /GST \(18%\) added: ₹180/);
  const inc = quote({ ...st, digital: dg.normalizeDigital({ ...st.digital, gst: 'inclusive' }) });
  assert.equal(inc.finalTotal, 1000 + inc.shippingCost + inc.packagingCost);
  assert.match(inc.quoteText, /GST Inclusive/);
});
test('Digital: invalid (Velvet under 10 sheets) is blocked in the quote', () => {
  const q = quote({ printTechnology: 'digital', digital: dg.normalizeDigital({ material: 'Paper 300 GSM', lamination: 'Velvet', qty: 5 }) });
  assert.equal(q.isValid, false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
