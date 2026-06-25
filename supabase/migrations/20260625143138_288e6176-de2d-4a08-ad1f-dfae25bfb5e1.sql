DROP POLICY IF EXISTS "public reads biyo_location basic info" ON public.biyo_locations;
DROP POLICY IF EXISTS "public reads active promo codes" ON public.promo_codes;
REVOKE SELECT ON public.biyo_locations FROM anon;
REVOKE SELECT ON public.promo_codes FROM anon;