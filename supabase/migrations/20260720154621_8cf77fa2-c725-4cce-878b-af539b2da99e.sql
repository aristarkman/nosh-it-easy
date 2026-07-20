CREATE OR REPLACE FUNCTION public.upsert_abandoned_cart_secure(
  _session_id text,
  _customer_name text DEFAULT NULL,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _location_id text DEFAULT NULL,
  _order_type text DEFAULT NULL,
  _items jsonb DEFAULT '[]'::jsonb,
  _subtotal numeric DEFAULT 0,
  _item_count integer DEFAULT 0,
  _marketing_email_opt_in boolean DEFAULT false,
  _marketing_sms_opt_in boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_items jsonb := COALESCE(_items, '[]'::jsonb);
  v_item_count integer := COALESCE(_item_count, 0);
BEGIN
  IF _session_id IS NULL OR length(trim(_session_id)) < 8 OR length(_session_id) > 128 THEN
    RAISE EXCEPTION 'Invalid cart session';
  END IF;

  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Cart items must be an array';
  END IF;

  v_item_count := GREATEST(v_item_count, 0);

  IF v_item_count = 0 OR jsonb_array_length(v_items) = 0 THEN
    UPDATE public.abandoned_carts
       SET recovered = true,
           items = '[]'::jsonb,
           item_count = 0,
           subtotal = 0,
           last_activity_at = now()
     WHERE session_id = _session_id
       AND (user_id IS NULL OR user_id = v_user_id);
    RETURN;
  END IF;

  INSERT INTO public.abandoned_carts (
    session_id,
    user_id,
    customer_name,
    email,
    phone,
    location_id,
    order_type,
    items,
    subtotal,
    item_count,
    last_activity_at,
    recovered,
    marketing_email_opt_in,
    marketing_sms_opt_in
  ) VALUES (
    _session_id,
    v_user_id,
    NULLIF(left(COALESCE(_customer_name, ''), 120), ''),
    NULLIF(left(COALESCE(_email, ''), 200), ''),
    NULLIF(left(COALESCE(_phone, ''), 40), ''),
    NULLIF(left(COALESCE(_location_id, ''), 80), ''),
    NULLIF(left(COALESCE(_order_type, ''), 40), ''),
    v_items,
    GREATEST(COALESCE(_subtotal, 0), 0),
    v_item_count,
    now(),
    false,
    COALESCE(_marketing_email_opt_in, false),
    COALESCE(_marketing_sms_opt_in, false)
  )
  ON CONFLICT (session_id) DO UPDATE
     SET user_id = COALESCE(public.abandoned_carts.user_id, v_user_id),
         customer_name = EXCLUDED.customer_name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         location_id = EXCLUDED.location_id,
         order_type = EXCLUDED.order_type,
         items = EXCLUDED.items,
         subtotal = EXCLUDED.subtotal,
         item_count = EXCLUDED.item_count,
         last_activity_at = now(),
         recovered = false,
         marketing_email_opt_in = EXCLUDED.marketing_email_opt_in,
         marketing_sms_opt_in = EXCLUDED.marketing_sms_opt_in
   WHERE public.abandoned_carts.user_id IS NULL
      OR public.abandoned_carts.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cart session is owned by another user';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_abandoned_cart_recovered_secure(
  _session_id text,
  _order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF _session_id IS NULL OR length(trim(_session_id)) < 8 OR length(_session_id) > 128 THEN
    RAISE EXCEPTION 'Invalid cart session';
  END IF;

  UPDATE public.abandoned_carts
     SET recovered = true,
         recovered_order_id = _order_id,
         last_activity_at = now()
   WHERE session_id = _session_id
     AND (user_id IS NULL OR user_id = v_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_abandoned_cart_secure(text, text, text, text, text, text, jsonb, numeric, integer, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_abandoned_cart_recovered_secure(text, uuid) TO anon, authenticated;