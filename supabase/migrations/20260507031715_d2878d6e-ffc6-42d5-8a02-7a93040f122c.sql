ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipday_order_id TEXT,
  ADD COLUMN IF NOT EXISTS shipday_tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS quoted_delivery_fee NUMERIC(10,2);