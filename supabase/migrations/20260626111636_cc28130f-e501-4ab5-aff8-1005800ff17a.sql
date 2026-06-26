ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS available_locations text[] NOT NULL DEFAULT ARRAY['cresskill','glen-rock']::text[];

CREATE INDEX IF NOT EXISTS menu_items_available_locations_gin
  ON public.menu_items USING gin (available_locations);