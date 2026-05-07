CREATE TABLE public.system_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  location_id text,
  order_number text,
  order_id uuid,
  message text NOT NULL,
  details jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_alerts_open ON public.system_alerts (created_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX idx_system_alerts_location ON public.system_alerts (location_id, created_at DESC);

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert alerts"
ON public.system_alerts FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "staff read scoped alerts"
ON public.system_alerts FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR location_id IS NULL
  OR user_has_location(auth.uid(), location_id)
);

CREATE POLICY "staff acknowledge scoped alerts"
ON public.system_alerts FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR location_id IS NULL
  OR user_has_location(auth.uid(), location_id)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR location_id IS NULL
  OR user_has_location(auth.uid(), location_id)
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.system_alerts;