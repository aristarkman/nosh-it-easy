
-- Refund type and status enums
DO $$ BEGIN
  CREATE TYPE public.refund_type AS ENUM ('full', 'partial', 'void');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.refund_status AS ENUM ('recorded', 'failed', 'pending');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_refund_state AS ENUM ('none', 'partial', 'full', 'voided');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Refunds table (immutable audit log)
CREATE TABLE IF NOT EXISTS public.order_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  location_id text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  reason text NOT NULL,
  reason_notes text,
  type public.refund_type NOT NULL,
  status public.refund_status NOT NULL DEFAULT 'recorded',
  ipospays_reference text,
  refunded_by uuid,
  refunded_by_email text,
  items_refunded jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_refunds_order_id ON public.order_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_location_id ON public.order_refunds(location_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_created_at ON public.order_refunds(created_at DESC);

ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read scoped refunds" ON public.order_refunds;
CREATE POLICY "staff read scoped refunds" ON public.order_refunds
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR user_has_location(auth.uid(), location_id));

DROP POLICY IF EXISTS "staff insert scoped refunds" ON public.order_refunds;
CREATE POLICY "staff insert scoped refunds" ON public.order_refunds
  FOR INSERT TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR user_has_location(auth.uid(), location_id))
    AND refunded_by = auth.uid()
  );

-- Add refund tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refunded_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status public.order_refund_state NOT NULL DEFAULT 'none';

-- Trigger to keep orders.refunded_total / refund_status in sync
CREATE OR REPLACE FUNCTION public.sync_order_refund_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_order_total numeric;
  v_has_void boolean;
BEGIN
  SELECT COALESCE(SUM(amount), 0),
         BOOL_OR(type = 'void')
    INTO v_total, v_has_void
    FROM public.order_refunds
   WHERE order_id = NEW.order_id AND status = 'recorded';

  SELECT total INTO v_order_total FROM public.orders WHERE id = NEW.order_id;

  UPDATE public.orders
     SET refunded_total = v_total,
         refund_status = CASE
           WHEN v_has_void THEN 'voided'::order_refund_state
           WHEN v_total <= 0 THEN 'none'::order_refund_state
           WHEN v_total >= COALESCE(v_order_total, 0) THEN 'full'::order_refund_state
           ELSE 'partial'::order_refund_state
         END,
         updated_at = now()
   WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_refund_totals ON public.order_refunds;
CREATE TRIGGER trg_sync_order_refund_totals
  AFTER INSERT ON public.order_refunds
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_refund_totals();
