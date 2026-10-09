/**
 * Dropship rates + pure calculation (no DOM) so it can be unit-tested.
 * Rates mirror the ERP's Dropship rate table (PrintX Order Flow → defaultConfig.js).
 */

export const DROPSHIP_RATES = {
  'Sipper': 200,
  'Sipper with Straw': 300,
  'Engrave': 25,
  'Sashes Plain': 30,
  'VC 100': 500,
  'Sublimation Tape': 140,
  'NT Sticker 12x18': 110,
  'Mug White': 100,
  'Badges Circle': 25,
  'Wall Clock': 350,
  '(180 GSM) Regular Fit T-Shirt (180 GSM)': 200,
  '(220 GSM) Oversize Fit T-Shirt': 280,
  '(240 GSM) Oversize Fit T-Shirt – French Terry': 300,
  '(Spun) Polo – Basic': 190,
  '(Cotton) Polo – Premium': 320,
  'Sports Jersey – DryFit': 150,
  '(Rice Knit) Polo Sports – Basic': 200,
  '(PQ Matty) Polo Sports – Premium': 250,
  '(400 GSM) Hoodie': 680,
  'Tote Bag': 140,
  '(Flexi) Caps – Executive': 100,
  '(Cotton) Caps – Premium': 150,
};

/** Print add-on per placement, by chosen print size */
export const SIZE_RATE = { 'Logo': 25, 'Logo Only': 25, 'A4': 70, 'A3': 120, 'A2': 250 };

export const ADDONS = [
  { value: 'Puff DTF', label: 'Puff DTF (+₹50)', rate: 50 },
  { value: 'Embroidery DTF', label: 'Embroidery DTF (+₹50)', rate: 50 },
  { value: 'Leather DTF', label: 'Leather DTF (+₹50)', rate: 50 },
  { value: 'Neck Tag Printing', label: 'Neck Tag Print (FREE)', rate: 0 },
];

/** Only garments take print placements / add-ons */
export const isApparel = variant => /T-Shirt|Polo|Jersey|Hoodie/i.test(variant);

export function placementsFor(variant) {
  return [
    { key: 'Front', sizes: ['Logo', 'A4', 'A3', 'A2'] },
    { key: 'Back', sizes: ['Logo', 'A4', 'A3', 'A2'] },
    { key: 'Right Sleeve', sizes: ['Logo Only'] },
    { key: 'Left Sleeve', sizes: ['Logo Only'] },
    ...(/Hoodie/i.test(variant) ? [{ key: 'Hood', sizes: ['Logo Only'] }] : []),
  ];
}

/** Per-piece rate = base + each placement size + each add-on (garments only) */
export function unitRate(variant, placements = {}, addons = []) {
  let rate = DROPSHIP_RATES[variant] || 0;
  if (isApparel(variant)) {
    Object.values(placements).forEach(sz => { rate += SIZE_RATE[sz] || 0; });
    addons.forEach(a => { rate += (ADDONS.find(x => x.value === a) || {}).rate || 0; });
  }
  return rate;
}

export function lineTotal(variant, qty, placements, addons) {
  const q = Math.max(1, Math.floor(Number(qty) || 1));
  const rate = unitRate(variant, placements, addons);
  return { qty: q, rate, total: Math.ceil(rate * q) };
}
