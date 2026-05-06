
-- Map our locations to Biyo store IDs
CREATE TABLE public.biyo_locations (
  location_id text PRIMARY KEY,
  biyo_store_id text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Menu items (synced from Biyo, enriched here)
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  biyo_product_id text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text,
  photo_url text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT false, -- default false: review before publishing
  popular boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_items_active ON public.menu_items(active) WHERE active;
CREATE INDEX idx_menu_items_category ON public.menu_items(category);

-- Per-location prices (pulled from Biyo)
CREATE TABLE public.menu_item_prices (
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  location_id text NOT NULL REFERENCES public.biyo_locations(location_id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_item_id, location_id)
);

-- Modifier groups per item (managed in this app, not Biyo)
CREATE TABLE public.menu_item_modifiers (
  menu_item_id uuid PRIMARY KEY REFERENCES public.menu_items(id) ON DELETE CASCADE,
  groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sold-out toggle per location
CREATE TABLE public.menu_item_availability (
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  location_id text NOT NULL REFERENCES public.biyo_locations(location_id) ON DELETE CASCADE,
  sold_out boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_item_id, location_id)
);

-- Sync log
CREATE TABLE public.menu_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  items_upserted integer DEFAULT 0,
  prices_upserted integer DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  error text
);

-- Triggers for updated_at
CREATE TRIGGER trg_biyo_locations_updated BEFORE UPDATE ON public.biyo_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_menu_item_modifiers_updated BEFORE UPDATE ON public.menu_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_menu_item_availability_updated BEFORE UPDATE ON public.menu_item_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.biyo_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_sync_log ENABLE ROW LEVEL SECURITY;

-- Public read for active items, prices, modifiers, availability
CREATE POLICY "anyone reads biyo_locations" ON public.biyo_locations FOR SELECT TO public USING (true);
CREATE POLICY "anyone reads active menu_items" ON public.menu_items FOR SELECT TO public USING (active);
CREATE POLICY "anyone reads menu_item_prices" ON public.menu_item_prices FOR SELECT TO public USING (true);
CREATE POLICY "anyone reads menu_item_modifiers" ON public.menu_item_modifiers FOR SELECT TO public USING (true);
CREATE POLICY "anyone reads menu_item_availability" ON public.menu_item_availability FOR SELECT TO public USING (true);

-- Admin reads all menu_items (including inactive)
CREATE POLICY "admins read all menu_items" ON public.menu_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin manages everything
CREATE POLICY "admins manage biyo_locations" ON public.biyo_locations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins manage menu_items" ON public.menu_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins manage menu_item_prices" ON public.menu_item_prices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins manage menu_item_modifiers" ON public.menu_item_modifiers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins manage menu_item_availability" ON public.menu_item_availability FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins read sync log" ON public.menu_sync_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed location mapping (matches Sweet Companion: Glen Rock=1, Cresskill=2)
INSERT INTO public.biyo_locations (location_id, biyo_store_id, display_name) VALUES
  ('glen-rock', '1', 'Glen Rock'),
  ('cresskill', '2', 'Cresskill');

-- Storage bucket for menu photos (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('menu-photos', 'menu-photos', true);

CREATE POLICY "menu photos public read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'menu-photos');
CREATE POLICY "admins upload menu photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'menu-photos' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins update menu photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'menu-photos' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins delete menu photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'menu-photos' AND has_role(auth.uid(), 'admin'::app_role));
