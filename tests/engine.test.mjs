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

const ds = await import('../js/dropship/dropshipRates.js');
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

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
