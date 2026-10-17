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
/** Digital Printing (Paper) — flat rate per sheet, same rates as the ERP */
export const DIGITAL_RATES = {
  'Digital Paper Sheet': 250,
  'Spot UV - Paper Sheet (Matt)': 250,
  'Gold Foil - Paper Sheet (Matt)': 250,
};

/**
 * Digital Printing options (from the shop's spec list). The base rate stays ₹250 / sheet (same as the ERP).
 * `extra` is the per-sheet surcharge for each choice. All 0 until the rates for each option are confirmed:
 * put the ₹ amount next to an option and every quote picks it up.
 */
export const DIGITAL_OPTIONS = {
  sheetSize: { label: 'SHEET SIZE', choices: [{ v: '11x17', t: '11" × 17"', extra: 0 }, { v: '12x18', t: '12" × 18"', extra: 0 }, { v: '13x19', t: '13" × 19"', extra: 0 }] },
  lamination: { label: 'LAMINATION', choices: [{ v: 'Gloss', t: 'Gloss', extra: 0 }, { v: 'Matt', t: 'Matt', extra: 0 }, { v: 'Velvet', t: 'Velvet', extra: 0 }] },
  gsm: { label: 'SHEET (GSM)', choices: [{ v: '130', t: '130 GSM', extra: 0 }, { v: '300', t: '300 GSM', extra: 0 }, { v: '350', t: '350 GSM', extra: 0 }] },
  sides: { label: 'PRINT', choices: [{ v: 'Single side', t: 'Single side', extra: 0 }, { v: 'Double side', t: 'Double side', extra: 0 }] },
  sticker: { label: 'STICKER SHEET', choices: [{ v: 'None', t: 'Not a sticker', extra: 0 }, { v: 'Paper', t: 'Paper', extra: 0 }, { v: 'Transparent', t: 'Transparent', extra: 0 }, { v: 'NT', t: 'NT', extra: 0 }, { v: 'Gold', t: 'Gold', extra: 0 }] },
};
export const DIGITAL_ADDONS = [{ value: 'Spot UV', extra: 0 }, { value: 'Gold Foil', extra: 0 }];
export const DIGITAL_DEFAULTS = { sheetSize: '11x17', lamination: 'Matt', gsm: '300', sides: 'Single side', sticker: 'None' };

const pick = (key, v) => (DIGITAL_OPTIONS[key].choices.find(c => c.v === v) || DIGITAL_OPTIONS[key].choices[0]);

/** Per-sheet surcharge from the chosen Digital options (0 for Dropship / unset). */
export function digitalExtra(d = {}) {
  if (!d.sheetSize) return 0;
  let x = 0;
  Object.keys(DIGITAL_OPTIONS).forEach(k => { x += pick(k, d[k] ?? DIGITAL_DEFAULTS[k]).extra || 0; });
  (d.addons || []).forEach(a => { x += (DIGITAL_ADDONS.find(y => y.value === a) || {}).extra || 0; });
  return x;
}

/** Readable spec line, e.g. '11" × 17" · Matt lamination · 300 GSM · Single side · Spot UV' */
export function describeDigital(d = {}) {
  const parts = [pick('sheetSize', d.sheetSize).t, `${pick('lamination', d.lamination).t} lamination`, pick('gsm', d.gsm).t, pick('sides', d.sides).t];
  const st = pick('sticker', d.sticker);
  if (st.v !== 'None') parts.push(`${st.t} sticker sheet`);
  (d.addons || []).forEach(a => parts.push(a));
  return parts.join(' · ');
}

/** Rate lookup across both catalogues */
export const baseRate = variant => (DROPSHIP_RATES[variant] ?? DIGITAL_RATES[variant] ?? 0);

/** Technologies that sell ready catalogue items (no design input / format) */
export const CATALOG_TECHS = ['dropship', 'digital'];
export const isCatalogTech = t => CATALOG_TECHS.includes(t);

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
export function unitRate(variant, placements = {}, addons = [], extra = 0) {
  let rate = baseRate(variant) + (Number(extra) || 0);
  if (isApparel(variant)) {
    Object.values(placements).forEach(sz => { rate += SIZE_RATE[sz] || 0; });
    addons.forEach(a => { rate += (ADDONS.find(x => x.value === a) || {}).rate || 0; });
  }
  return rate;
}

export function lineTotal(variant, qty, placements, addons, extra = 0) {
  const q = Math.max(1, Math.floor(Number(qty) || 1));
  const rate = unitRate(variant, placements, addons, extra);
  return { qty: q, rate, total: Math.ceil(rate * q) };
}

/** Product groups for the dropdown (order = display order). Any product not listed falls under "Other". */
export const DROPSHIP_GROUPS = [
  { label: 'Garments', match: /T-Shirt|Polo|Jersey|Hoodie/i },
  { label: 'Caps & Bags', match: /Caps|Tote/i },
  { label: 'Drinkware', match: /Sipper|Mug/i },
];

export function groupedProducts() {
  const names = Object.keys(DROPSHIP_RATES);
  const used = new Set();
  const groups = DROPSHIP_GROUPS.map(g => {
    const items = names.filter(n => g.match.test(n));
    items.forEach(n => used.add(n));
    return { label: g.label, items };
  });
  const other = names.filter(n => !used.has(n));
  if (other.length) groups.push({ label: 'Other', items: other });
  return groups.filter(g => g.items.length);
}

/** Short human text for the print options of a line, e.g. "Front: A4, Right Sleeve: Logo Only, Puff DTF" */
export function describeOptions(placements = {}, addons = []) {
  const parts = Object.entries(placements).map(([k, s]) => `${k}: ${s}`);
  addons.forEach(a => parts.push(a));
  return parts.join(', ');
}

/** Step-by-step rate lines for the live "rate breakdown" box */
export function rateBreakdown(variant, placements = {}, addons = [], extra = 0) {
  const rows = [{ label: 'Base rate', amount: baseRate(variant) }];
  if (extra) rows.push({ label: 'Selected options', amount: extra });
  if (isApparel(variant)) {
    Object.entries(placements).forEach(([pos, sz]) => rows.push({ label: `${pos} — ${sz}`, amount: SIZE_RATE[sz] || 0 }));
    addons.forEach(a => rows.push({ label: a, amount: (ADDONS.find(x => x.value === a) || {}).rate || 0 }));
  }
  return rows;
}
