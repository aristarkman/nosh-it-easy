-- Promo codes
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed','bogo')),
  discount_value numeric NOT NULL DEFAULT 0,
  bogo_buy_item_id uuid,
  bogo_get_item_id uuid,
  min_subtotal numeric NOT NULL DEFAULT 0,
  max_uses_per_customer integer NOT NULL DEFAULT 1,
  max_total_uses integer,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads active promo codes" ON public.promo_codes FOR SELECT TO public USING (active = true);
CREATE POLICY "admins manage promo codes" ON public.promo_codes FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER promo_codes_updated BEFORE UPDATE ON public.promo_codes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Promo redemptions (enforce per-customer & global usage)
CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id uuid,
  customer_phone text,
  order_id uuid,
  discount_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_redemptions_user_idx ON public.promo_redemptions(promo_code_id, user_id);
CREATE INDEX promo_redemptions_phone_idx ON public.promo_redemptions(promo_code_id, customer_phone);
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own redemptions" ON public.promo_redemptions FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "anyone can insert redemptions" ON public.promo_redemptions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins manage redemptions" ON public.promo_redemptions FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Loyalty redemptions ($5 off per 10 completed orders)
CREATE TABLE public.loyalty_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid,
  amount numeric NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_redemptions_user_idx ON public.loyalty_redemptions(user_id);
ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own loyalty" ON public.loyalty_redemptions FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY "users insert own loyalty" ON public.loyalty_redemptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins manage loyalty" ON public.loyalty_redemptions FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Validate promo server-side via security definer function
CREATE OR REPLACE FUNCTION public.validate_promo(
  _code text,
  _user_id uuid,
  _customer_phone text,
  _subtotal numeric,
  _item_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.promo_codes%ROWTYPE;
  used_count integer;
  total_used integer;
BEGIN
  SELECT * INTO p FROM public.promo_codes WHERE upper(code) = upper(_code) AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Invalid promo code'); END IF;
  IF p.starts_at IS NOT NULL AND p.starts_at > now() THEN RETURN jsonb_build_object('ok', false, 'message', 'Promo not yet active'); END IF;
  IF p.expires_at IS NOT NULL AND p.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'message', 'Promo expired'); END IF;
  IF _subtotal < p.min_subtotal THEN RETURN jsonb_build_object('ok', false, 'message', 'Minimum subtotal not met'); END IF;

  IF p.max_total_uses IS NOT NULL THEN
    SELECT count(*) INTO total_used FROM public.promo_redemptions WHERE promo_code_id = p.id;
    IF total_used >= p.max_total_uses THEN RETURN jsonb_build_object('ok', false, 'message', 'Promo fully redeemed'); END IF;
  END IF;

  IF p.max_uses_per_customer IS NOT NULL AND p.max_uses_per_customer > 0 THEN
    SELECT count(*) INTO used_count FROM public.promo_redemptions
      WHERE promo_code_id = p.id
        AND ((_user_id IS NOT NULL AND user_id = _user_id) OR (_customer_phone IS NOT NULL AND customer_phone = _customer_phone));
    IF used_count >= p.max_uses_per_customer THEN RETURN jsonb_build_object('ok', false, 'message', 'You already used this code'); END IF;
  END IF;

  IF p.discount_type = 'bogo' THEN
    IF p.bogo_buy_item_id IS NULL OR NOT (p.bogo_buy_item_id = ANY(_item_ids)) THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Required item not in cart');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p.id,
    'code', p.code,
    'discount_type', p.discount_type,
    'discount_value', p.discount_value,
    'bogo_buy_item_id', p.bogo_buy_item_id,
    'bogo_get_item_id', p.bogo_get_item_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_promo(text, uuid, text, numeric, uuid[]) TO anon, authenticated;