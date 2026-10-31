/**
 * URL prefill — lets the ERP (or anyone) open the Pricing Engine with details already filled.
 *
 *   https://lifeatbv.com/?tech=fabric&format=A4&qty=10&delivery=courier&weight=1.5&l=45&b=33&h=4&ref=PX-12345&city=Bhopal&pin=462001
 *
 * tech:     fabric | uv_dtf | sublimation | dropship | digital
 * format:   A4 | A3 | A2 | Meters      (fabric / uv / sublimation)
 * qty:      pieces (or pieces for dropship / digital)
 * length:   running meters (when format=Meters)
 * delivery: pickup | transport | courier
 * variant:  catalog product name (dropship / digital)
 * weight:   parcel kg for the Shipping Calculator;  l, b, h = parcel cm
 * ref, city, pin, name: shown in a small "from ERP" banner only (never used in pricing)
 */

import { update } from './store.js';
import { DROPSHIP_RATES } from '../modules/dropshipEngine.js';
import { DIGITAL_MATERIALS } from '../modules/digitalEngine.js';

const TECHS = ['fabric', 'uv_dtf', 'sublimation', 'dropship', 'digital'];
const FORMATS = ['A4', 'A3', 'A2', 'Meters'];
const DELIVERY = ['pickup', 'transport', 'courier'];
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

export function readPrefill(search = window.location.search) {
  const q = new URLSearchParams(search);
  const out = { state: {}, calc: null, info: null };
  const tech = q.get('tech');
  if (TECHS.includes(tech)) out.state.printTechnology = tech;
  const t = out.state.printTechnology;
  const qty = num(q.get('qty'));

  if (t === 'dropship' || t === 'digital') {
    const rates = t === 'dropship' ? DROPSHIP_RATES : Object.fromEntries(DIGITAL_MATERIALS.map(m => [m.key, m.single]));
    const d = {};
    const v = q.get('variant');
    if (v && rates[v] != null) { d.variant = v; if (t === 'digital') d.material = v; }
    if (qty) d.qty = Math.round(qty);
    if (num(q.get('weight'))) d.weight = num(q.get('weight'));
    if (Object.keys(d).length) out.dropshipPatch = { key: t, patch: d };
  } else {
    const f = q.get('format');
    if (FORMATS.includes(f)) out.state.format = f;
    if (qty) out.state.quantity = Math.round(qty);
    if (num(q.get('length'))) out.state.rawLength = String(num(q.get('length')));
  }
  const del = q.get('delivery');
  if (DELIVERY.includes(del)) out.state.deliveryMethod = del;

  const calc = { weight: num(q.get('weight')), l: num(q.get('l')), b: num(q.get('b')), h: num(q.get('h')) };
  if (calc.weight || calc.l || calc.b || calc.h) out.calc = calc;

  const info = { ref: q.get('ref'), name: q.get('name'), city: q.get('city'), pin: q.get('pin') };
  if (info.ref || info.name || info.city || info.pin) out.info = info;
  return out;
}

/** Apply the state part of the prefill. Call before the UI is built. */
export function applyPrefill(p, currentState) {
  if (p.dropshipPatch) {
    const { key, patch } = p.dropshipPatch;
    p.state[key] = { ...currentState[key], ...patch };
  }
  if (Object.keys(p.state).length) update(p.state);
}
