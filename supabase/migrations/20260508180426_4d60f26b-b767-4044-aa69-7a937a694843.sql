CREATE TABLE public.menu_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  blurb text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads active menu_categories"
  ON public.menu_categories FOR SELECT
  USING (active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins manage menu_categories"
  ON public.menu_categories FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_menu_categories_updated_at
  BEFORE UPDATE ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed with the existing curated buckets so nothing breaks day one
INSERT INTO public.menu_categories (name, blurb, sort_order) VALUES
  ('Classic Sandwiches', 'Hand-carved, piled high, on fresh-baked rye.', 10),
  ('Deli Platters', NULL, 20),
  ('Soups & Sides', NULL, 30),
  ('All-Day Breakfast', NULL, 40),
  ('Knishes & Latkes', NULL, 50),
  ('Entrées', NULL, 60),
  ('Snacks', NULL, 70),
  ('Drinks', NULL, 80),
  ('Desserts', NULL, 90),
  ('Catering', NULL, 100),
  ('More from the Deli', NULL, 110)
ON CONFLICT (name) DO NOTHING;