
-- Loyalty ledger: positive = earn, negative = redeem
CREATE TABLE public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid,
  kind text NOT NULL CHECK (kind IN ('earn','redeem','adjust','expire')),
  points integer NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_ledger_user_idx ON public.loyalty_ledger(user_id, created_at DESC);

ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own loyalty ledger" ON public.loyalty_ledger
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "users insert own loyalty ledger" ON public.loyalty_ledger
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage loyalty ledger" ON public.loyalty_ledger
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Track points spent in existing redemptions table
ALTER TABLE public.loyalty_redemptions
  ADD COLUMN IF NOT EXISTS points_used integer NOT NULL DEFAULT 100;

-- Order channel
DO $$ BEGIN
  CREATE TYPE order_channel AS ENUM ('web','tablet','phone','third_party');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS channel order_channel NOT NULL DEFAULT 'web';
CREATE INDEX IF NOT EXISTS orders_channel_idx ON public.orders(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_created_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_location_created_idx ON public.orders(location_id, created_at DESC);

-- Helper: compute current points balance
CREATE OR REPLACE FUNCTION public.loyalty_balance(_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(points), 0)::int FROM public.loyalty_ledger WHERE user_id = _user_id
$$;

-- Analytics events
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid,
  kind text NOT NULL,
  location_id text,
  order_type text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_kind_created_idx ON public.analytics_events(kind, created_at DESC);
CREATE INDEX analytics_events_session_idx ON public.analytics_events(session_id, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone inserts events" ON public.analytics_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "admins read events" ON public.analytics_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Abandoned carts: rolling per-session snapshot
CREATE TABLE public.abandoned_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  user_id uuid,
  customer_name text,
  email text,
  phone text,
  location_id text,
  order_type text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  reminded_email_at timestamptz,
  reminded_sms_at timestamptz,
  recovered boolean NOT NULL DEFAULT false,
  recovered_order_id uuid,
  marketing_email_opt_in boolean NOT NULL DEFAULT false,
  marketing_sms_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX abandoned_carts_activity_idx ON public.abandoned_carts(last_activity_at DESC);
CREATE INDEX abandoned_carts_user_idx ON public.abandoned_carts(user_id);

CREATE TRIGGER abandoned_carts_updated_at
  BEFORE UPDATE ON public.abandoned_carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone upserts own session cart" ON public.abandoned_carts
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anyone updates own session cart" ON public.abandoned_carts
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "users read own abandoned cart" ON public.abandoned_carts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
