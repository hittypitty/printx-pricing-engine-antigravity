# BV Inventory — Supabase setup

Uses the **same Supabase project as PrintX ERP**. Only new `bv_` tables are created — ERP tables are not touched.

## 1. Run the SQL (one time)
Supabase → **SQL Editor** → New query → paste `bv_inventory.sql` → **Run**.
Safe to run again later.

## 2. Connect the website
Supabase → **Project Settings → API**, copy into `js/config/supabase.js`:

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';   // Project URL
export const SUPABASE_ANON_KEY = 'eyJ...';                // anon public key
```

Never use the `service_role` key in the website.

## 3. Create an inventory manager
1. Supabase → **Authentication → Users → Add user** → email + password, tick **Auto Confirm User**.
2. SQL Editor → run (change the email):

```sql
insert into public.bv_staff (user_id, name, role)
select id, 'Inventory Manager', 'inventory_manager' from auth.users
where email = 'manager@example.com'
on conflict (user_id) do update set role = excluded.role, name = excluded.name;
```

Use `'admin'` instead of `'inventory_manager'` for someone who can also delete products.

## 4. Use it
Open **Inventory** tab → log in → add/edit products, price tiers, add/remove stock with a reason.
The **BV Catalog** page shows the live stock to everyone.

| Role | Can do |
|---|---|
| Visitor (not logged in) | See products marked "Show on catalog" |
| inventory_manager | Add/edit products & price tiers, add/remove stock, hide products, see stock history |
| admin | Everything above + delete products |

## 5. Live rates from the ERP (calculator ↔ ERP)
Once `js/config/supabase.js` is filled (step 2), the calculator reads the ERP's pricing setup
(`settings.pricing_config` — Admin → Pricing & Rates) every 20 seconds and when the tab is reopened.
Core rates, couriers, weights, Sublimation, Dropship products (new / renamed / removed, with sub-category + MOQ)
and Digital paper rates all follow the ERP. A small pill at the bottom-left shows "Live from ERP · time"
(click it to refresh now). Read-only: the calculator never writes to the ERP. No new SQL needed.
