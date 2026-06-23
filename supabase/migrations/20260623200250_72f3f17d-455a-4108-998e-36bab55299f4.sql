
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS slug text;

-- Backfill slugs from name, ensuring uniqueness by appending a counter for dupes
WITH base AS (
  SELECT id, name,
    regexp_replace(
      regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ) AS s
  FROM public.menu_items
  WHERE slug IS NULL OR slug = ''
),
numbered AS (
  SELECT id,
    CASE WHEN s = '' THEN 'item-' || substr(id::text,1,8) ELSE s END AS base_slug,
    row_number() OVER (PARTITION BY CASE WHEN s = '' THEN 'item-' || substr(id::text,1,8) ELSE s END ORDER BY id) AS rn
  FROM base
)
UPDATE public.menu_items m
SET slug = CASE WHEN n.rn = 1 THEN n.base_slug ELSE n.base_slug || '-' || n.rn END
FROM numbered n
WHERE m.id = n.id;

ALTER TABLE public.menu_items ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_slug_key ON public.menu_items(slug);
