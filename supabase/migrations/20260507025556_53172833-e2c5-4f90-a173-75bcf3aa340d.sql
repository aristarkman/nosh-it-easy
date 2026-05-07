-- Favorites table for saved customer orders
CREATE TABLE public.customer_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  location_id text NOT NULL,
  order_type text NOT NULL,
  items jsonb NOT NULL,
  source_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_favorites_user ON public.customer_favorites(user_id, created_at DESC);

ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own favorites"
ON public.customer_favorites
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER customer_favorites_updated_at
BEFORE UPDATE ON public.customer_favorites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();