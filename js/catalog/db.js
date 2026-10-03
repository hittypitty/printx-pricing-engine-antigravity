/**
 * BV Catalog — Supabase data layer
 *
 * Tables / RPC come from supabase/bv_inventory.sql:
 *   bv_products, bv_staff, bv_stock_log, bv_adjust_stock()
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase.js';
import { normalizeProduct } from './productStore.js';

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let clientPromise = null;

export function isDbConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getClient() {
  if (!isDbConfigured()) {
    return Promise.reject(new Error('Supabase is not configured (js/config/supabase.js).'));
  }
  if (!clientPromise) {
    clientPromise = import(SUPABASE_CDN).then(mod =>
      mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bv-inventory-auth' },
      })
    );
  }
  return clientPromise;
}

function friendlyError(error, fallback = 'Something went wrong.') {
  if (!error) return new Error(fallback);
  const msg = error.message || String(error);
  if (/Invalid login credentials/i.test(msg)) return new Error('Wrong email or password.');
  if (/Email not confirmed/i.test(msg)) return new Error('Email not confirmed. Ask the admin to confirm this user in Supabase.');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new Error('Could not reach the database. Check your internet connection.');
  if (/row-level security|permission denied|not allowed/i.test(msg)) return new Error('You do not have permission to do this.');
  if (/duplicate key/i.test(msg)) return new Error('A product with this ID already exists.');
  return new Error(msg);
}

// ---------- Mapping ----------

function fromRow(row) {
  return {
    ...normalizeProduct({
      id: row.id,
      title: row.title,
      category: row.category,
      image: row.image,
      unit: row.unit,
      stock: row.stock,
      tiers: Array.isArray(row.tiers) ? row.tiers : [],
    }),
    isActive: row.is_active !== false,
    sortOrder: row.sort_order || 0,
    updatedAt: row.updated_at || null,
  };
}

function toRow(product, { includeStock }) {
  const p = normalizeProduct(product);
  const row = {
    id: p.id,
    title: p.title,
    category: p.category,
    image: p.image,
    unit: p.unit,
    tiers: p.tiers,
    is_active: product.isActive !== false,
  };
  if (includeStock) row.stock = p.stock;
  return row;
}

// ---------- Products ----------

export async function fetchProducts() {
  const db = await getClient();
  const { data, error } = await db
    .from('bv_products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (error) throw friendlyError(error, 'Could not load products.');
  return (data || []).map(fromRow);
}

export async function createProduct(product) {
  const db = await getClient();
  const { data, error } = await db
    .from('bv_products')
    .insert(toRow(product, { includeStock: true }))
    .select()
    .single();
  if (error) throw friendlyError(error, 'Could not add product.');
  return fromRow(data);
}

/** Update details + price tiers. Stock is NOT sent — use adjustStock() so changes are atomic and logged. */
export async function updateProduct(product) {
  const db = await getClient();
  const { data, error } = await db
    .from('bv_products')
    .update(toRow(product, { includeStock: false }))
    .eq('id', product.id)
    .select();
  if (error) throw friendlyError(error, 'Could not save product.');
  if (!data || data.length === 0) throw new Error('You do not have permission to edit products.');
  return fromRow(data[0]);
}

export async function deleteProduct(id) {
  const db = await getClient();
  const { data, error } = await db.from('bv_products').delete().eq('id', id).select('id');
  if (error) throw friendlyError(error, 'Could not delete product.');
  if (!data || data.length === 0) throw new Error('Only an admin can delete products. Hide it instead (untick "Show on catalog").');
}

export async function adjustStock(id, change, reason) {
  const db = await getClient();
  const { data, error } = await db.rpc('bv_adjust_stock', {
    p_product_id: id,
    p_change: change,
    p_reason: reason || null,
  });
  if (error) throw friendlyError(error, 'Could not update stock.');
  return Number(data);
}

export async function fetchStockLog(productId, limit = 10) {
  const db = await getClient();
  const { data, error } = await db
    .from('bv_stock_log')
    .select('id, old_stock, new_stock, change, reason, user_id, created_at')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw friendlyError(error, 'Could not load stock history.');
  return data || [];
}

// ---------- Auth ----------

export async function signIn(email, password) {
  const db = await getClient();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw friendlyError(error, 'Login failed.');
  return data.session;
}

export async function signOut() {
  const db = await getClient();
  await db.auth.signOut();
}

export async function getSession() {
  const db = await getClient();
  const { data } = await db.auth.getSession();
  return data ? data.session : null;
}

/** Returns { name, role } if the logged-in user is inventory staff, else null. */
export async function getStaff(userId) {
  const db = await getClient();
  const { data, error } = await db
    .from('bv_staff')
    .select('name, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw friendlyError(error, 'Could not check access.');
  return data || null;
}

/** Map of user_id → name for staff (used in stock history). */
export async function fetchStaffNames() {
  const db = await getClient();
  const { data, error } = await db.from('bv_staff').select('user_id, name');
  if (error) return {};
  const map = {};
  (data || []).forEach(r => { map[r.user_id] = r.name || 'Staff'; });
  return map;
}
