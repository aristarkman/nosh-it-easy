
create type public.order_status as enum ('new','accepted','ready','completed','cancelled');
create type public.order_type as enum ('pickup','delivery');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  location_id text not null,
  order_type public.order_type not null,
  status public.order_status not null default 'new',
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  delivery_address text,
  when_type text not null default 'asap',
  scheduled_time timestamptz,
  payment_method text not null,
  subtotal numeric(10,2) not null,
  delivery_fee numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  card_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  items jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_location_idx on public.orders (location_id, created_at desc);

alter table public.orders enable row level security;

-- Anyone can place an order
create policy "anyone can insert orders"
  on public.orders for insert
  to anon, authenticated
  with check (true);

-- Open read/update for now (tablet has no auth yet) — lock down when staff auth ships
create policy "open read orders"
  on public.orders for select
  to anon, authenticated
  using (true);

create policy "open update orders"
  on public.orders for update
  to anon, authenticated
  using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table public.orders;
alter table public.orders replica identity full;

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
