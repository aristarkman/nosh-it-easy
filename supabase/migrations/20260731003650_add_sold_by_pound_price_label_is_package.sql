-- Sell-by-the-pound, price-label override, and package-unit features.
-- Idempotent: safe to run more than once.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS sold_by_pound boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minimum_quantity numeric,
  ADD COLUMN IF NOT EXISTS price_label text,
  ADD COLUMN IF NOT EXISTS is_package boolean NOT NULL DEFAULT false;

-- In case minimum_quantity already existed as integer on a prior attempt —
-- widen it to numeric so fractional minimums (0.25, 0.5) can be saved.
ALTER TABLE public.menu_items
  ALTER COLUMN minimum_quantity TYPE numeric USING minimum_quantity::numeric;

NOTIFY pgrst, 'reload schema';
