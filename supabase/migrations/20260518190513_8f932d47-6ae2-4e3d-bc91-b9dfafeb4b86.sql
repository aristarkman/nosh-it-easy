
-- Polygon-based delivery zones replace ZIP-based zones
CREATE TABLE public.delivery_zone_polygons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  name text NOT NULL,
  fee numeric NOT NULL DEFAULT 0,
  minimum numeric NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#3b82f6',
  polygon jsonb NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_zone_polygons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads zone polygons"
  ON public.delivery_zone_polygons FOR SELECT
  USING (true);

CREATE POLICY "admins manage zone polygons"
  ON public.delivery_zone_polygons FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_updated_at_delivery_zone_polygons
  BEFORE UPDATE ON public.delivery_zone_polygons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_delivery_zone_polygons_location ON public.delivery_zone_polygons(location_id);

-- Drop the old ZIP-based zones table (replaced by polygon zones)
DROP TABLE IF EXISTS public.delivery_zones;
