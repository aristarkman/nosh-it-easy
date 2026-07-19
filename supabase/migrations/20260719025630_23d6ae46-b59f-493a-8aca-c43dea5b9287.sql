-- Fix: the 2026-05-26 lockdown migration revoked SELECT on promo_codes from
-- `authenticated` and re-granted it only for a limited set of customer-facing
-- columns. Since Supabase auth users (including admins) all map to the
-- Postgres `authenticated` role, this silently blocked the admin promo-codes
-- page's `select("*")` query too (missing: bogo_buy_item_id, bogo_get_item_id,
-- max_uses_per_customer, max_total_uses) — even though the admin RLS row
-- policy was, and still is, correct.
--
-- Rather than widening the column grant (which would re-expose those columns
-- to any authenticated customer), add an admin-only SECURITY DEFINER RPC that
-- returns the full row, gated by an explicit role check.

CREATE OR REPLACE FUNCTION public.admin_list_promo_codes()
RETURNS SETOF public.promo_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY SELECT * FROM public.promo_codes ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_promo_codes() TO authenticated;
