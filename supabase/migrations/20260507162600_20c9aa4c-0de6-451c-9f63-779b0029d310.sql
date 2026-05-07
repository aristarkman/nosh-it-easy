
-- Add hours_kind to differentiate storefront vs online ordering hours
ALTER TABLE public.store_hours
  ADD COLUMN IF NOT EXISTS hours_kind text NOT NULL DEFAULT 'storefront';

-- Drop old unique constraint if it exists, recreate including hours_kind
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.store_hours'::regclass
    AND contype = 'u'
    AND conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = 'public.store_hours'::regclass
        AND attname IN ('location_id','day_of_week')
    );
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.store_hours DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS store_hours_loc_kind_dow_key
  ON public.store_hours (location_id, hours_kind, day_of_week);

-- Seed 'online' rows for each existing storefront row (copy values) if missing
INSERT INTO public.store_hours (location_id, day_of_week, open_time, close_time, is_closed, hours_kind)
SELECT location_id, day_of_week, open_time, close_time, is_closed, 'online'
FROM public.store_hours sh
WHERE hours_kind = 'storefront'
  AND NOT EXISTS (
    SELECT 1 FROM public.store_hours sh2
    WHERE sh2.location_id = sh.location_id
      AND sh2.day_of_week = sh.day_of_week
      AND sh2.hours_kind = 'online'
  );
