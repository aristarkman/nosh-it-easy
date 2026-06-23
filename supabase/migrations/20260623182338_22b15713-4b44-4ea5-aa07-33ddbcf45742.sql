CREATE TABLE public.menu_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX menu_item_photos_item_idx ON public.menu_item_photos(menu_item_id, sort_order);

GRANT SELECT ON public.menu_item_photos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_photos TO authenticated;
GRANT ALL ON public.menu_item_photos TO service_role;

ALTER TABLE public.menu_item_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads menu_item_photos" ON public.menu_item_photos
  FOR SELECT TO public USING (true);

CREATE POLICY "admins manage menu_item_photos" ON public.menu_item_photos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER menu_item_photos_updated_at
  BEFORE UPDATE ON public.menu_item_photos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill from existing menu_items.photo_url
INSERT INTO public.menu_item_photos (menu_item_id, url, sort_order)
SELECT id, photo_url, 0
FROM public.menu_items
WHERE photo_url IS NOT NULL AND photo_url <> '';