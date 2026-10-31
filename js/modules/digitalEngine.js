/**
 * Digital Printing (12" × 18" sheets) — pure pricing logic, no DOM, so it can be unit-tested.
 * Every rule below comes from the boss's confirmed spec (Version 1, prices configured here — no admin control):
 *
 *  • Standard printing, per sheet (single / double side)
 *      Paper 130 / 300 / 350 GSM  ₹25 / ₹30      NT 130 Micron ₹50 / ₹55      NT 300 Micron ₹70 / ₹75
 *      Stickers (single side only): Paper ₹80 · NT ₹100 · Gold ₹100 · Transparent ₹90
 *  • Premium printing (Gold Foil OR Spot UV — one only), complete per-sheet price on:
 *      Paper Sticker ₹250 · NT Sticker ₹270 · Transparent Sticker ₹260
 *      (includes plotter die-cut + file setting; excludes lamination, tax and shipping)
 *  • Lamination (all materials), per side per sheet — sides follow the print sides:
 *      1–9 sheets  : Gloss / Matt ₹100, Velvet not available
 *      10+ sheets  : Gloss / Matt / Velvet ₹10
 *  • Plotter die-cut ₹25 / sheet (compulsory on every sticker). File setting ₹150 / order,
 *    switched on automatically with die-cut. Premium prints include both (not charged twice).
 *  • Regular printing MOQ: 1 sheet.
 *  • GST optional, default No. If yes: "Add GST" (18% on top) or "GST Inclusive" (already inside the
 *    quoted amount — never added twice). Shipping is always separate and is never taxed here.
 */

export const DIGITAL_SHEET_LABEL = '12" × 18"';
export const GST_RATE = 0.18;

export const DIGITAL_MATERIALS = [
  { key: 'Paper 130 GSM',       group: 'Paper',    single: 25,  double: 30 },
  { key: 'Paper 300 GSM',       group: 'Paper',    single: 25,  double: 30 },
  { key: 'Paper 350 GSM',       group: 'Paper',    single: 25,  double: 30 },
  { key: 'NT 130 Micron',       group: 'NT',       single: 50,  double: 55 },
  { key: 'NT 300 Micron',       group: 'NT',       single: 70,  double: 75 },
  { key: 'Paper Sticker',       group: 'Stickers', single: 80,  double: null, sticker: true, premium: 250 },
  { key: 'NT Sticker',          group: 'Stickers', single: 100, double: null, sticker: true, premium: 270 },
  { key: 'Gold Sticker',        group: 'Stickers', single: 100, double: null, sticker: true },
  { key: 'Transparent Sticker', group: 'Stickers', single: 90,  double: null, sticker: true, premium: 260 },
];

export const PREMIUM_FINISHES = ['Gold Foil', 'Spot UV'];
export const LAMINATIONS = ['None', 'Gloss', 'Matt', 'Velvet'];
export const GST_MODES = [
  { v: 'none', t: 'No GST' },
  { v: 'add', t: 'Add GST (18%)' },
  { v: 'inclusive', t: 'GST Inclusive' },
];

export const LAMINATION_MOQ = 10;               // 10+ sheets get the low lamination rate (and Velvet)
export const LAMINATION_RATE_LOW_QTY = 100;     // ₹ per side per sheet, 1–9 sheets (Gloss / Matt)
export const LAMINATION_RATE_BULK = 10;         // ₹ per side per sheet, 10+ sheets
export const DIE_CUT_RATE = 25;                 // ₹ per sheet
export const FILE_SETTING_RATE = 150;           // ₹ per order

export const DIGITAL_DEFAULTS = {
  material: 'Paper 300 GSM', sides: 'Single side', premium: 'None', lamination: 'None',
  dieCut: false, fileSetting: false, gst: 'none',
};

export const findMaterial = key => DIGITAL_MATERIALS.find(m => m.key === key) || DIGITAL_MATERIALS[1];
const round2 = n => Math.round(n * 100) / 100;

/** Keep the selection consistent (e.g. stickers are single side only, premium only where a premium rate exists). */
export function normalizeDigital(d = {}) {
  const out = { ...DIGITAL_DEFAULTS, ...d };
  const m = findMaterial(out.material);
  out.material = m.key;
  out.variant = m.key;                                   // used by the cart / quote as the line title
  if (m.double == null) out.sides = 'Single side';
  if (!m.premium || !PREMIUM_FINISHES.includes(out.premium)) out.premium = 'None';
  if (!LAMINATIONS.includes(out.lamination)) out.lamination = 'None';
  if (!GST_MODES.some(g => g.v === out.gst)) out.gst = 'none';
  if (m.sticker) out.dieCut = true;                      // sticker die-cut is compulsory
  if (out.dieCut) out.fileSetting = true;                // file setting is automatic with die-cut
  return out;
}

/** Starting per-sheet rate shown next to each material in the dropdown. */
export const materialRateLabel = m => (m.double != null ? `₹${m.single} / ₹${m.double}` : `₹${m.single}`);

/**
 * Price a Digital selection.
 * @param {object} d      selection (see DIGITAL_DEFAULTS) + qty
 * @param {number} sheets sheets to print (auto-packed from designs, or typed quantity)
 * @returns {{valid:boolean,error?:string,sheets:number,rate:number,lines:{label:string,amount:number,note?:string}[],
 *            subtotal:number,gstMode:string,gstAdd:number,gstIncluded:number,gstBase:number,totalExShipping:number,options:string,breakdown:string}}
 */
export function calcDigital(d, sheets) {
  const sel = normalizeDigital(d);
  const m = findMaterial(sel.material);
  const qty = Math.max(1, Math.floor(Number(sheets) || 1));
  const double = sel.sides === 'Double side' && m.double != null;
  const sideCount = double ? 2 : 1;
  const premium = sel.premium !== 'None';

  const lines = [];

  // 1. Printing
  let rate;
  if (premium) {
    rate = m.premium;
    lines.push({ label: `${sel.premium} printing — ${m.key} (${qty} × ₹${rate})`, amount: rate * qty });
  } else {
    rate = double ? m.double : m.single;
    lines.push({ label: `${m.key}, ${double ? 'double' : 'single'} side (${qty} × ₹${rate})`, amount: rate * qty });
  }

  // 2. Lamination (sides follow the print sides)
  if (sel.lamination !== 'None') {
    if (sel.lamination === 'Velvet' && qty < LAMINATION_MOQ) {
      return invalid(`Velvet lamination is available only from ${LAMINATION_MOQ} sheets.`, qty, rate);
    }
    const lamRate = qty >= LAMINATION_MOQ ? LAMINATION_RATE_BULK : LAMINATION_RATE_LOW_QTY;
    lines.push({
      label: `${sel.lamination} lamination, ${sideCount} side${sideCount > 1 ? 's' : ''} (${qty} × ${sideCount} × ₹${lamRate})`,
      amount: lamRate * sideCount * qty,
    });
  }

  // 3. Plotter die-cut + file setting (premium prints include both)
  if (premium) {
    if (sel.dieCut) lines.push({ label: 'Plotter die-cut', amount: 0, note: 'Included' });
    if (sel.fileSetting) lines.push({ label: 'File setting', amount: 0, note: 'Included' });
  } else {
    if (sel.dieCut) lines.push({ label: `Plotter die-cut (${qty} × ₹${DIE_CUT_RATE})`, amount: DIE_CUT_RATE * qty });
    if (sel.fileSetting) lines.push({ label: 'File setting', amount: FILE_SETTING_RATE });
  }

  const subtotal = lines.reduce((n, l) => n + l.amount, 0);

  // 4. GST (optional). Shipping is added elsewhere and is not taxed here.
  let gstAdd = 0, gstIncluded = 0, gstBase = subtotal;
  if (sel.gst === 'add') {
    gstAdd = round2(subtotal * GST_RATE);
  } else if (sel.gst === 'inclusive') {
    gstBase = round2(subtotal / (1 + GST_RATE));
    gstIncluded = round2(subtotal - gstBase);
  }

  const parts = [`${m.key}${double ? ' (double side)' : ''}`];
  if (premium) parts.push(sel.premium);
  if (sel.lamination !== 'None') parts.push(`${sel.lamination} lamination`);
  if (sel.dieCut) parts.push('Plotter die-cut');
  parts.push(DIGITAL_SHEET_LABEL);

  return {
    valid: true,
    sheets: qty,
    rate,
    lines,
    subtotal,
    gstMode: sel.gst,
    gstAdd,
    gstIncluded,
    gstBase,
    totalExShipping: round2(subtotal + gstAdd),
    options: parts.join(' · '),
    breakdown: lines.map(l => `${l.label}${l.amount ? ' ₹' + l.amount : ''}`).join(' + '),
  };
}

function invalid(error, sheets, rate) {
  return { valid: false, error, sheets, rate, lines: [], subtotal: 0, gstMode: 'none', gstAdd: 0, gstIncluded: 0, gstBase: 0, totalExShipping: 0, options: '', breakdown: '' };
}
