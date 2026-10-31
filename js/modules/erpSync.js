/**
 * ERP Sync — keeps this calculator in step with the PrintX ERP (same Supabase project).
 *
 * The ERP saves its whole pricing setup (Admin → Pricing & Rates) as JSON in `settings.pricing_config`.
 * This module reads that row (read-only, anon key) and applies it to the calculator:
 *   • core rates      → pricing / uvDtfPricing / formats / couriers / weights   (configStore)
 *   • Sublimation     → sublimationPricing
 *   • Dropship items  → DROPSHIP_RATES (+ sub-category / MOQ)  — new, renamed and removed products follow the ERP
 * It checks again every 20 seconds, when the tab is shown again and when the internet comes back.
 * The last good copy is cached in the browser so the calculator still works offline.
 *
 * Needs js/config/supabase.js to be filled (same URL + anon key as the ERP). While empty, nothing changes.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase.js';
import { updateConfig } from '../state/configStore.js';
import { getState, update } from '../state/store.js';
import { DROPSHIP_RATES, DROPSHIP_META } from './dropshipEngine.js';
import { recalculate } from '../controller/appController.js';

const POLL_MS = 20000;
const CACHE_KEY = 'bv_erp_pricing_cache';
let lastHash = '';
let lastSyncedAt = null;
let badge = null;
let timer = null;

export const isErpConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// ---------- helpers ----------
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const isInf = v => v === null || v === undefined || v === 'Infinity' || v === '__INFINITY__' || Number(v) >= 1e9;

/** JSON turns Infinity into null — put it back on the last "and above" slab. */
function fixSlabs(slabs) {
  if (!Array.isArray(slabs) || !slabs.length) return null;
  return slabs.map((s, i) => ({
    ...s,
    min: Number(s.min) || 0,
    max: isInf(s.max) && (i === slabs.length - 1 || s.max === 'Infinity' || s.max === '__INFINITY__') ? Infinity : Number(s.max),
    ...(s.rate !== undefined ? { rate: Number(s.rate) } : {}),
  }));
}

const rateList = list => (Array.isArray(list) ? list.filter(x => x && x.variant && num(x.rate) !== null) : []);

// ---------- apply ----------
export function applyErpConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;

  // 1. Core rates (same shape as the calculator's own config)
  if (cfg.pricing) {
    const p = {};
    const slabs = fixSlabs(cfg.pricing.METER_SLABS);
    if (slabs) p.METER_SLABS = slabs;
    ['MICRO_RATE_SQ_INCH', 'CONVERSION_COST', 'DEFAULT_DESIGN_COUNT', 'PACKAGING_COST'].forEach(k => {
      const v = num(cfg.pricing[k]); if (v !== null) p[k] = v;
    });
    if (Object.keys(p).length) updateConfig('pricing', p);
  }
  if (cfg.uvDtfPricing) {
    const u = {};
    ['A4_NORMAL', 'A4_3D', 'A3_DOUBLE_SIDE'].forEach(k => { const v = num(cfg.uvDtfPricing[k]); if (v !== null) u[k] = v; });
    const slabs = fixSlabs(cfg.uvDtfPricing.A3_SLABS);
    if (slabs) u.A3_SLABS = slabs;
    if (Object.keys(u).length) updateConfig('uvDtfPricing', u);
  }
  if (cfg.formats && cfg.formats.FORMATS) {
    const fm = {};
    Object.entries(cfg.formats.FORMATS).forEach(([k, v]) => { if (v && typeof v === 'object') fm[k] = { ...v }; });
    const f = {};
    if (Object.keys(fm).length) f.FORMATS = fm;
    ['ROLL_WIDTH', 'PRINTABLE_WIDTH'].forEach(k => { const v = num(cfg.formats[k]); if (v !== null) f[k] = v; });
    if (Object.keys(f).length) updateConfig('formats', f);
  }
  if (cfg.couriers && typeof cfg.couriers === 'object' && Object.keys(cfg.couriers).length) {
    updateConfig('couriers', cfg.couriers);
  }
  if (cfg.weights) {
    const w = {};
    const per = num(cfg.weights.WEIGHT_PER_METER_KG); if (per !== null) w.WEIGHT_PER_METER_KG = per;
    if (Array.isArray(cfg.weights.UV_DTF_SHIPPING_SLABS) && cfg.weights.UV_DTF_SHIPPING_SLABS.length) w.UV_DTF_SHIPPING_SLABS = cfg.weights.UV_DTF_SHIPPING_SLABS;
    if (Object.keys(w).length) updateConfig('weights', w);
  }

  const other = cfg.otherProducts || {};

  // 2. Sublimation rates
  const sub = rateList(other['Sublimation']);
  if (sub.length) {
    const s = {};
    sub.forEach(r => {
      if (r.variant === 'A4') s.A4 = Number(r.rate);
      else if (r.variant === 'A3') s.A3 = Number(r.rate);
      else if (r.variant === 'Meter New') s.ROLL_RATE_PER_METER = Number(r.rate);
    });
    if (Object.keys(s).length) updateConfig('sublimationPricing', s);
  }

  // 3. Dropship catalogue — the ERP list IS the catalogue (new / renamed / removed products follow it)
  const drop = rateList(other['Dropship']);
  if (drop.length) {
    Object.keys(DROPSHIP_RATES).forEach(k => delete DROPSHIP_RATES[k]);
    Object.keys(DROPSHIP_META).forEach(k => delete DROPSHIP_META[k]);
    drop.forEach(r => {
      DROPSHIP_RATES[r.variant] = Number(r.rate);
      DROPSHIP_META[r.variant] = { subCategory: r.subCategory || '', moq: Number(r.moq) || 0 };
    });
  }

  // (Digital Printing rates are fixed inside the calculator — see modules/digitalEngine.js)

  // 5. Make sure the current selection still exists, then refresh the screen
  const s = getState();
  const patch = {};
  if (s.dropship && !(s.dropship.variant in DROPSHIP_RATES)) {
    const first = Object.keys(DROPSHIP_RATES)[0];
    if (first) patch.dropship = { ...s.dropship, variant: first };
  }
  if (Object.keys(patch).length) update(patch);
  recalculate();
  document.dispatchEvent(new CustomEvent('erp-catalog-changed'));
  return true;
}

// ---------- fetch ----------
async function fetchErpConfig() {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/settings?select=pricing_config,updated_at&order=updated_at.desc&limit=1`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`ERP responded ${res.status}`);
  const rows = await res.json();
  return rows && rows[0] ? rows[0] : null;
}

export async function syncNow() {
  if (!isErpConfigured()) return false;
  try {
    const row = await fetchErpConfig();
    if (!row || !row.pricing_config) { setBadge('warn', 'ERP pricing not found — using built-in rates'); return false; }
    const hash = JSON.stringify(row.pricing_config);
    if (hash !== lastHash) {
      lastHash = hash;
      applyErpConfig(row.pricing_config);
      try { localStorage.setItem(CACHE_KEY, hash); } catch (e) { /* storage blocked */ }
    }
    lastSyncedAt = new Date();
    setBadge('ok');
    return true;
  } catch (err) {
    console.warn('[ERP sync]', err);
    setBadge('warn', lastSyncedAt ? 'ERP unreachable — showing last synced rates' : 'ERP unreachable — using saved rates');
    return false;
  }
}

// ---------- tiny status pill ----------
function setBadge(kind, text) {
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'erp-sync-badge';
    badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;font:600 11.5px system-ui,sans-serif;padding:6px 11px;border-radius:999px;background:#fff;border:1px solid rgba(0,0,0,.12);box-shadow:0 4px 14px rgba(0,0,0,.12);display:flex;gap:6px;align-items:center;cursor:pointer';
    badge.title = 'Click to refresh rates from the ERP now';
    badge.addEventListener('click', () => syncNow());
    document.body.appendChild(badge);
  }
  const dot = kind === 'ok' ? '#1fae56' : '#e6a100';
  const label = kind === 'ok' ? `Live from ERP · ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : text;
  badge.innerHTML = `<i style="width:8px;height:8px;border-radius:50%;background:${dot};display:inline-block"></i>${label}`;
}

export function init() {
  if (!isErpConfigured()) return;
  // Show the last good copy straight away (works offline), then fetch the fresh one
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) { lastHash = cached; applyErpConfig(JSON.parse(cached)); }
  } catch (e) { /* ignore */ }
  syncNow();
  timer = setInterval(syncNow, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  window.addEventListener('online', syncNow);
}

export function stop() { if (timer) clearInterval(timer); }
