
-- 1. abandoned_carts: remove anon insert/update; keep authenticated owner update
DROP POLICY IF EXISTS "insert own session cart" ON public.abandoned_carts;
DROP POLICY IF EXISTS "update own session cart" ON public.abandoned_carts;
REVOKE INSERT, UPDATE ON public.abandoned_carts FROM anon;
REVOKE INSERT, UPDATE ON public.abandoned_carts FROM authenticated;

CREATE POLICY "users update own cart"
ON public.abandoned_carts
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT UPDATE ON public.abandoned_carts TO authenticated;

-- 2. system_alerts: remove public insert
DROP POLICY IF EXISTS "anyone can insert alerts" ON public.system_alerts;
REVOKE INSERT ON public.system_alerts FROM anon;
REVOKE INSERT ON public.system_alerts FROM authenticated;

-- 3. loyalty_ledger / loyalty_redemptions: remove user insert (server fn only)
DROP POLICY IF EXISTS "users insert own loyalty ledger" ON public.loyalty_ledger;
DROP POLICY IF EXISTS "users insert own loyalty" ON public.loyalty_redemptions;
REVOKE INSERT ON public.loyalty_ledger FROM authenticated;
REVOKE INSERT ON public.loyalty_redemptions FROM authenticated;

-- 4. drivers: restrict staff SELECT to drivers in their assigned locations
DROP POLICY IF EXISTS "staff read drivers for their location" ON public.drivers;
CREATE POLICY "staff read drivers for their location"
ON public.drivers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_location(auth.uid(), location_id)
);

-- 5. biyo_locations: revoke broad SELECT; expose only safe columns to public
DROP POLICY IF EXISTS "anyone reads biyo_locations" ON public.biyo_locations;
REVOKE SELECT ON public.biyo_locations FROM anon;
REVOKE SELECT ON public.biyo_locations FROM authenticated;
GRANT SELECT (location_id, display_name) ON public.biyo_locations TO anon, authenticated;

CREATE POLICY "public reads biyo_location basic info"
ON public.biyo_locations
FOR SELECT
TO public
USING (true);

-- 6. promo_codes: revoke broad SELECT for anon/authenticated; expose only customer-facing columns
DROP POLICY IF EXISTS "anyone reads active promo codes" ON public.promo_codes;
REVOKE SELECT ON public.promo_codes FROM anon;
REVOKE SELECT ON public.promo_codes FROM authenticated;
GRANT SELECT (id, code, description, discount_type, discount_value, min_subtotal, starts_at, expires_at, active)
  ON public.promo_codes TO anon, authenticated;

CREATE POLICY "public reads active promo codes"
ON public.promo_codes
FOR SELECT
TO public
USING (active = true);
