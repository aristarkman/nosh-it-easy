CREATE OR REPLACE FUNCTION public.capture_order_marketing_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(nullif(trim(COALESCE(NEW.customer_email, '')), ''));
  v_local text;
  v_first text;
  v_last text;
BEGIN
  IF v_email IS NULL OR position('@' in v_email) = 0 THEN
    RETURN NEW;
  END IF;

  v_local := split_part(v_email, '@', 1);
  IF v_local IN ('info','admin','no-reply','noreply','support','sales','office') THEN
    RETURN NEW;
  END IF;

  v_first := nullif(split_part(trim(COALESCE(NEW.customer_name, '')), ' ', 1), '');
  v_last := nullif(trim(substring(trim(COALESCE(NEW.customer_name, '')) from position(' ' in trim(COALESCE(NEW.customer_name, ''))) + 1)), '');
  IF v_last = v_first THEN v_last := NULL; END IF;

  INSERT INTO public.marketing_contacts (email, first_name, last_name, phone, source, last_order_at)
  VALUES (v_email, v_first, v_last, nullif(trim(COALESCE(NEW.customer_phone, '')), ''), 'web_order', NEW.created_at)
  ON CONFLICT (lower(email)) DO UPDATE
    SET first_name = COALESCE(EXCLUDED.first_name, public.marketing_contacts.first_name),
        last_name = COALESCE(EXCLUDED.last_name, public.marketing_contacts.last_name),
        phone = COALESCE(EXCLUDED.phone, public.marketing_contacts.phone),
        last_order_at = GREATEST(COALESCE(public.marketing_contacts.last_order_at, EXCLUDED.last_order_at), EXCLUDED.last_order_at),
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_capture_marketing_contact ON public.orders;
CREATE TRIGGER orders_capture_marketing_contact
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.capture_order_marketing_contact();

INSERT INTO public.marketing_contacts (email, first_name, last_name, phone, source, last_order_at)
SELECT DISTINCT ON (lower(o.customer_email))
  lower(trim(o.customer_email)),
  nullif(split_part(trim(COALESCE(o.customer_name, '')), ' ', 1), ''),
  nullif(trim(substring(trim(COALESCE(o.customer_name, '')) from position(' ' in trim(COALESCE(o.customer_name, ''))) + 1)), ''),
  nullif(trim(COALESCE(o.customer_phone, '')), ''),
  'web_order',
  o.created_at
FROM public.orders o
WHERE o.customer_email IS NOT NULL
  AND position('@' in o.customer_email) > 0
  AND split_part(lower(trim(o.customer_email)), '@', 1) NOT IN ('info','admin','no-reply','noreply','support','sales','office')
ORDER BY lower(o.customer_email), o.created_at DESC
ON CONFLICT (lower(email)) DO UPDATE
  SET last_order_at = GREATEST(COALESCE(public.marketing_contacts.last_order_at, EXCLUDED.last_order_at), EXCLUDED.last_order_at),
      phone = COALESCE(public.marketing_contacts.phone, EXCLUDED.phone),
      updated_at = now();