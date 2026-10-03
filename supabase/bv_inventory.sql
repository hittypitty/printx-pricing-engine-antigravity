-- =====================================================================
-- BV Web — Inventory Manager setup for Supabase
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → New query → paste this
-- whole file → Run. Safe to run more than once.
--
-- Creates ONLY new tables/functions whose names start with "bv_".
-- Existing PrintX ERP tables are not touched.
--
--   bv_staff       who can log in to "Manage Products" (admin / inventory_manager)
--   bv_products    catalog: title, category, stock, quantity-wise price tiers
--   bv_stock_log   automatic history of every stock change (who, when, why)
--   bv_adjust_stock()  RPC to add/remove stock with a reason (atomic, never < 0)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.bv_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text,
  role       text not null default 'inventory_manager'
             check (role in ('admin', 'inventory_manager')),
  created_at timestamptz not null default now()
);

create table if not exists public.bv_products (
  id         text primary key,
  title      text not null check (length(btrim(title)) > 0),
  category   text not null default 'General',
  image      text not null default '',
  unit       text not null default 'pc',
  stock      integer not null default 0 check (stock >= 0),
  -- [{ "minQty": 1, "maxQty": 9, "price": 100 }, { "minQty": 10, "maxQty": null, "price": 90 }]
  tiers      jsonb not null default '[]'::jsonb check (jsonb_typeof(tiers) = 'array'),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.bv_stock_log (
  id         bigint generated always as identity primary key,
  product_id text not null references public.bv_products(id) on delete cascade,
  old_stock  integer,
  new_stock  integer not null,
  change     integer not null,
  reason     text,
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bv_stock_log_product_idx
  on public.bv_stock_log (product_id, created_at desc);

create index if not exists bv_products_sort_idx
  on public.bv_products (sort_order, title);


-- ---------------------------------------------------------------------
-- 2. Role helpers
-- ---------------------------------------------------------------------

create or replace function public.bv_is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.bv_staff where user_id = auth.uid());
$$;

create or replace function public.bv_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.bv_staff where user_id = auth.uid() and role = 'admin');
$$;


-- ---------------------------------------------------------------------
-- 3. Triggers: updated_at / updated_by + automatic stock history
-- ---------------------------------------------------------------------

create or replace function public.bv_products_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.bv_products_after_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('bv.reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.bv_stock_log (product_id, old_stock, new_stock, change, reason, user_id)
    values (new.id, null, new.stock, new.stock, coalesce(v_reason, 'Product created'), auth.uid());
  elsif new.stock is distinct from old.stock then
    insert into public.bv_stock_log (product_id, old_stock, new_stock, change, reason, user_id)
    values (new.id, old.stock, new.stock, new.stock - old.stock, coalesce(v_reason, 'Stock edited'), auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists bv_products_before_write on public.bv_products;
create trigger bv_products_before_write
  before insert or update on public.bv_products
  for each row execute function public.bv_products_before_write();

drop trigger if exists bv_products_after_write on public.bv_products;
create trigger bv_products_after_write
  after insert or update on public.bv_products
  for each row execute function public.bv_products_after_write();


-- ---------------------------------------------------------------------
-- 4. RPC: adjust stock with a reason (e.g. +50 "New purchase", -3 "Damaged")
-- ---------------------------------------------------------------------

create or replace function public.bv_adjust_stock(p_product_id text, p_change integer, p_reason text default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_new integer;
begin
  if not public.bv_is_staff() then
    raise exception 'Not allowed: inventory staff only';
  end if;
  if p_change is null or p_change = 0 then
    raise exception 'Change must be a non-zero whole number';
  end if;

  perform set_config('bv.reason', coalesce(nullif(btrim(p_reason), ''), case when p_change > 0 then 'Stock added' else 'Stock removed' end), true);

  update public.bv_products
     set stock = stock + p_change
   where id = p_product_id
  returning stock into v_new;

  if v_new is null then
    raise exception 'Product % not found', p_product_id;
  end if;

  perform set_config('bv.reason', '', true);
  return v_new;
exception
  when check_violation then
    raise exception 'Stock cannot go below 0';
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------

alter table public.bv_staff     enable row level security;
alter table public.bv_products  enable row level security;
alter table public.bv_stock_log enable row level security;

-- Staff: a user can see their own row; staff can see the team
drop policy if exists bv_staff_select on public.bv_staff;
create policy bv_staff_select on public.bv_staff
  for select to authenticated
  using (user_id = auth.uid() or public.bv_is_staff());

-- Products: everyone (website visitors) sees active products; staff see all
drop policy if exists bv_products_select on public.bv_products;
create policy bv_products_select on public.bv_products
  for select to anon, authenticated
  using (is_active or public.bv_is_staff());

drop policy if exists bv_products_insert on public.bv_products;
create policy bv_products_insert on public.bv_products
  for insert to authenticated
  with check (public.bv_is_staff());

drop policy if exists bv_products_update on public.bv_products;
create policy bv_products_update on public.bv_products
  for update to authenticated
  using (public.bv_is_staff())
  with check (public.bv_is_staff());

-- Only admins can delete products (inventory managers can hide them via is_active)
drop policy if exists bv_products_delete on public.bv_products;
create policy bv_products_delete on public.bv_products
  for delete to authenticated
  using (public.bv_is_admin());

-- Stock history: staff only (rows are written by the trigger)
drop policy if exists bv_stock_log_select on public.bv_stock_log;
create policy bv_stock_log_select on public.bv_stock_log
  for select to authenticated
  using (public.bv_is_staff());


-- ---------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------

grant select on public.bv_products to anon, authenticated;
grant insert, update, delete on public.bv_products to authenticated;
grant select on public.bv_staff to authenticated;
grant select on public.bv_stock_log to authenticated;
grant execute on function public.bv_is_staff() to anon, authenticated;
grant execute on function public.bv_is_admin() to anon, authenticated;
grant execute on function public.bv_adjust_stock(text, integer, text) to authenticated;


-- ---------------------------------------------------------------------
-- 7. Starter products (sample — edit or delete from Manage Products)
--    Only inserted if the id doesn't exist yet.
-- ---------------------------------------------------------------------

insert into public.bv_products (id, title, category, unit, stock, tiers, sort_order) values
  ('sipper',            'Sipper Bottle',                'Drinkware',    'pc',   120,  '[{"minQty":1,"maxQty":9,"price":200},{"minQty":10,"maxQty":49,"price":180},{"minQty":50,"maxQty":null,"price":160}]', 1),
  ('sipper-straw',      'Sipper with Straw',            'Drinkware',    'pc',   8,    '[{"minQty":1,"maxQty":9,"price":300},{"minQty":10,"maxQty":49,"price":270},{"minQty":50,"maxQty":null,"price":240}]', 2),
  ('mug-white',         'White Sublimation Mug',        'Drinkware',    'pc',   450,  '[{"minQty":1,"maxQty":9,"price":100},{"minQty":10,"maxQty":49,"price":90},{"minQty":50,"maxQty":99,"price":80},{"minQty":100,"maxQty":null,"price":72}]', 3),
  ('wall-clock',        'Custom Wall Clock',            'Home & Decor', 'pc',   0,    '[{"minQty":1,"maxQty":9,"price":350},{"minQty":10,"maxQty":null,"price":315}]', 4),
  ('badge-circle',      'Round Button Badge',           'Corporate',    'pc',   1000, '[{"minQty":1,"maxQty":49,"price":25},{"minQty":50,"maxQty":199,"price":20},{"minQty":200,"maxQty":null,"price":16}]', 5),
  ('sash-plain',        'Plain Sash',                   'Corporate',    'pc',   60,   '[{"minQty":1,"maxQty":24,"price":30},{"minQty":25,"maxQty":null,"price":25}]', 6),
  ('visiting-card-100', 'Visiting Cards (Pack of 100)', 'Stationery',   'pack', 200,  '[{"minQty":1,"maxQty":4,"price":500},{"minQty":5,"maxQty":null,"price":450}]', 7),
  ('sublimation-tape',  'Sublimation Heat Tape',        'Supplies',     'roll', 5,    '[{"minQty":1,"maxQty":9,"price":140},{"minQty":10,"maxQty":null,"price":125}]', 8)
on conflict (id) do nothing;


-- =====================================================================
-- 8. GIVE SOMEONE INVENTORY ACCESS  (run separately, after step above)
--
--    a) Supabase → Authentication → Users → "Add user" → enter email +
--       password (tick "Auto Confirm User").
--    b) Then run ONE of these with that email:
--
-- Inventory manager (add/edit products, stock, price tiers):
--   insert into public.bv_staff (user_id, name, role)
--   select id, 'Inventory Manager', 'inventory_manager' from auth.users
--   where email = 'manager@example.com'
--   on conflict (user_id) do update set role = excluded.role, name = excluded.name;
--
-- Admin (everything above + delete products):
--   insert into public.bv_staff (user_id, name, role)
--   select id, 'Arjun', 'admin' from auth.users
--   where email = 'you@example.com'
--   on conflict (user_id) do update set role = excluded.role, name = excluded.name;
--
-- Remove access:
--   delete from public.bv_staff
--   where user_id = (select id from auth.users where email = 'manager@example.com');
-- =====================================================================
