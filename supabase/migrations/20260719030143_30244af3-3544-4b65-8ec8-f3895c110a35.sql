-- Per-item taxability. Defaults to true (most prepared deli food is taxable
-- in NJ); admins flip specific items (e.g. grocery/retail goods) to false.
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS taxable boolean NOT NULL DEFAULT true;
