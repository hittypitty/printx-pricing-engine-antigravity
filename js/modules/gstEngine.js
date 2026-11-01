/**
 * GST (optional, 18%) — one rule for every print technology. Pure, no DOM.
 *  • none      : no GST (default)
 *  • add       : 18% is charged on top of the taxable amount
 *  • inclusive : the amount already contains GST — shown separately, never added again
 * Taxable amount = print cost + conversion cost. Shipping / packaging are never taxed here.
 */
export const GST_RATE = 0.18;
export const GST_MODES = [
  { v: 'none', t: 'No GST' },
  { v: 'add', t: 'Add GST (18%)' },
  { v: 'inclusive', t: 'GST Inclusive' },
];
const round2 = n => Math.round(n * 100) / 100;

export function gstOn(amount, mode) {
  const a = Number(amount) || 0;
  if (mode === 'add') return { mode, add: round2(a * GST_RATE), included: 0, base: a };
  if (mode === 'inclusive') {
    const base = round2(a / (1 + GST_RATE));
    return { mode, add: 0, included: round2(a - base), base };
  }
  return { mode: 'none', add: 0, included: 0, base: a };
}
