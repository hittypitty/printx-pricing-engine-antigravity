/**
 * Regression tests for the pricing engine.
 * Run:  node tests/engine.test.mjs
 * (No dependencies — uses Node's built-in assert.)
 */

import assert from 'node:assert/strict';

// Minimal browser stubs for modules that touch localStorage
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const { getConfig } = await import('../js/state/configStore.js');
const { calculateQuote } = await import('../js/modules/pricingBrain.js');
const { calculateShipping, getFabricWeight, resolveCourierKey } = await import('../js/modules/deliveryEngine.js');
const { calculatePackedDimensions } = await import('../js/modules/packingEngine.js');
const { parseLength } = await import('../js/modules/formatParser.js');
const { findSlab } = await import('../js/modules/pricingEngine.js');
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

console.log('\nFabric running-meter pricing');
test('small print still uses sq-inch micro pricing (10" = ₹120)', () => {
  assert.equal(quote({ rawLength: '10' }).printCost, 120);
});
test('< 1m uses sq-inch micro pricing, no cap (30" = ₹360)', () => {
  const r = quote({ rawLength: '30' });
  assert.equal(r.printCost, 360);
  assert.match(r.methodLabel, /Micro/);
});
test('1m = ₹225', () => assert.equal(quote({ rawLength: '1m' }).printCost, 225));
test('no slab gap: 9.992m uses ₹225, not ₹177', () => assert.equal(quote({ rawLength: '389.7' }).rateApplied, 225));
test('10m uses ₹213', () => assert.equal(quote({ rawLength: '10m' }).rateApplied, 213));
test('findSlab picks last slab with min <= value', () => {
  assert.equal(findSlab(config.pricing.METER_SLABS, 24.995).rate, 213);
  assert.equal(findSlab(config.pricing.METER_SLABS, 150).rate, 177);
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
  const r = quote({ rawLength: '0' });
  assert.equal(r.isValid, false);
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
test('UV 11×20.1 single design bills as 20" custom (not 21")', () => {
  const r = packedQuote({ printTechnology: 'uv_dtf' }, [[11, 20.1, 1]]);
  assert.equal(r.isValid, true);
  assert.equal(r.length, 20);
});
test('UV 3×3 stickers ×40 pick cheapest sheets', () => {
  const r = packedQuote({ printTechnology: 'uv_dtf' }, [[3, 3, 40]]);
  assert.equal(r.isValid, true);
  assert.ok(Number.isFinite(r.printCost) && r.printCost > 0);
});

console.log('\nSublimation');
test('10×7 design detected as A4 sheet', () => {
  const r = packedQuote({ printTechnology: 'sublimation' }, [[10, 7, 1]]);
  assert.equal(r.format, 'A4');
});
test('10×15 design detected as A3 when cheaper or equal', () => {
  const r = packedQuote({ printTechnology: 'sublimation' }, [[10, 15, 1]]);
  assert.ok(['A3', 'Roll'].includes(r.format));
  assert.ok(r.printCost <= 40);
});

console.log('\nFabric sizes / packing');
test('two different 5×5 designs pack side by side (≈6", not 11")', () => {
  const p = calculatePackedDimensions([
    { isValid: true, width: 5, length: 5, quantity: 1 },
    { isValid: true, width: 5, length: 5.1, quantity: 1 },
  ]);
  assert.ok(p.totalLength <= 6, `got ${p.totalLength}"`);
});
test('single 30×10 design rotates to fit (10" across, 30" along)', () => {
  const p = calculatePackedDimensions([{ isValid: true, width: 30, length: 10, quantity: 1 }]);
  assert.equal(p.totalLength, 30);
  assert.ok(p.totalWidth <= 22.8);
});
test('manual size 30×10 accepted for fabric (rotation)', () => {
  const r = packedQuote({}, [[30, 10, 1]]);
  assert.equal(r.isValid, true);
});
test('manual size 23×23 rejected with a size message (not "could not calculate")', () => {
  const r = quote({ inputMode: 'manual-size', manualSizes: [{ id: '1', width: 23, height: 23, qty: 1 }], computedImageLength: 0 });
  assert.equal(r.isValid, false);
  assert.match(r.validationError, /too big/);
});
test('empty extra manual-size row does not break the quote', () => {
  const p = calculatePackedDimensions([{ isValid: true, width: 5, length: 5, quantity: 2 }]);
  const r = quote({ inputMode: 'manual-size', manualSizes: [{ id: '1', width: 5, height: 5, qty: 2 }, { id: '2', width: '', height: '', qty: 1 }], computedImageLength: p.totalLength, computedImageWidth: p.totalWidth });
  assert.equal(r.isValid, true);
});
test('large qty of one design still uses grid packing', () => {
  const p = calculatePackedDimensions([{ isValid: true, width: 3, length: 3, quantity: 100 }]);
  assert.ok(p.totalLength > 0 && p.totalLength < 100);
});

console.log('\nCourier / weight');
test('DTDC/Bluedart slab rates (original): 1 kg = 2 slabs', () => {
  assert.equal(calculateShipping('dtdc_surface', 0, 1, 1.0, config).shippingCost, 185);
  assert.equal(calculateShipping('dtdc_express', 0, 1, 1.0, config).shippingCost, 270);
  assert.equal(calculateShipping('bluedart', 0, 1, 1.0, config).shippingCost, 260);
  assert.equal(calculateShipping('dtdc_surface', 0, 1, 0.4, config).shippingCost, 100);
});
test('Tirupati unchanged (1 kg ₹60, 1.5 kg ₹120)', () => {
  assert.equal(calculateShipping('tirupati', 0, 1, 1.0, config).shippingCost, 60);
  assert.equal(calculateShipping('tirupati', 0, 1, 1.5, config).shippingCost, 120);
});
test('fabric weight rounds partial meters UP (1.9m uses 2m row)', () => {
  assert.ok(getFabricWeight(1.9) >= getFabricWeight(2) - 1e-9);
});
test('fabric weight beyond table keeps growing', () => {
  assert.ok(getFabricWeight(150) > getFabricWeight(102));
});
test('courier name mapping', () => {
  assert.equal(resolveCourierKey('Bluedart (Fastest)', config), 'bluedart');
  assert.equal(resolveCourierKey('DTDC Express', config), 'dtdc_express');
  assert.equal(resolveCourierKey('DTDC', config), 'dtdc_surface');
  assert.equal(resolveCourierKey('Delhivery', config), null);
});

console.log('\nCart');
test('cart total survives an invalid current input', () => {
  const item = { ...quote({ format: 'A4', quantity: 3 }), id: 'x', printTechnology: 'fabric', format: 'A4', quantity: 3, isSheetFormat: true, conversions: [], totalMeters: 0.6 };
  const r = quote({ cart: [item], format: 'Meters', rawLength: '' });
  assert.equal(r.isValid, false);
  assert.equal(r.finalTotal, 210);
  assert.ok(r.quoteText.length > 0);
});
test('transport cost comes from config', () => {
  const r = quote({ format: 'A4', deliveryMethod: 'transport' });
  assert.equal(r.shippingCost, config.pricing.TRANSPORT_COST);
  assert.equal(r.finalTotal, 70 + config.pricing.TRANSPORT_COST);
});
test('conversions show in quote for auto (manual-size) mode', () => {
  const r = packedQuote({ conversions: [{ id: 'c', type: 'Puff', qty: 2 }] }, [[5, 5, 1]]);
  assert.match(r.quoteText, /Conversions/);
});

console.log('\nERP entry point');
test('ERP courier estimate is never ₹0 for unknown courier names', () => {
  for (const name of ['Delhivery', 'Xpressbees', 'DTDC', 'Bluedart']) {
    const r = calculateQuote({ products: [{ category: 'Fabric Heat DTF', variant: 'Meter', quantity: 5 }], deliveryType: 'Courier', preferredCourier: name }, config);
    assert.ok(r.shippingCost > 0, `${name} → ₹${r.shippingCost}`);
  }
});
test('ERP final total includes packaging for courier', () => {
  const r = calculateQuote({ products: [{ category: 'Fabric Heat DTF', variant: 'Meter', quantity: 5 }], deliveryType: 'Courier', preferredCourier: 'Bluedart' }, config);
  assert.equal(r.finalTotal, Math.ceil(r.printCost + r.shippingCost + r.packagingCost));
});
test('ERP Custom Inches ₹12/inch, Meter < 1 at ₹468/m (original rates)', () => {
  const c = calculateQuote({ products: [{ category: 'Fabric Heat DTF', variant: 'Custom Inches', quantity: 100 }] }, config);
  const m = calculateQuote({ products: [{ category: 'Fabric Heat DTF', variant: 'Meter', quantity: 0.5 }] }, config);
  assert.equal(c.printCost, 1200);
  assert.equal(m.printCost, 234);
});
test('ERP Meter slab has no gap (9.995m → ₹225 rate)', () => {
  const r = calculateQuote({ products: [{ category: 'Fabric Heat DTF', variant: 'Meter', quantity: 9.995 }] }, config);
  assert.equal(r.lineItems[0].rate, 225);
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

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
