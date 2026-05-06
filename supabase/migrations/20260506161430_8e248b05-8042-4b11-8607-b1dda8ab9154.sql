
-- Store hours
CREATE TABLE public.store_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT NOT NULL,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, day_of_week)
);
ALTER TABLE public.store_hours ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER store_hours_updated BEFORE UPDATE ON public.store_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "anyone reads store hours" ON public.store_hours FOR SELECT USING (true);
CREATE POLICY "admins manage store hours" ON public.store_hours FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Store closures
CREATE TABLE public.store_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.store_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads closures" ON public.store_closures FOR SELECT USING (true);
CREATE POLICY "admins manage closures" ON public.store_closures FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Delivery zones
CREATE TABLE public.delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT NOT NULL,
  zip TEXT NOT NULL,
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  minimum NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, zip)
);
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads zones" ON public.delivery_zones FOR SELECT USING (true);
CREATE POLICY "admins manage zones" ON public.delivery_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Throttle
CREATE TABLE public.location_throttle (
  location_id TEXT PRIMARY KEY,
  max_orders_per_15min INT NOT NULL DEFAULT 20,
  pickup_lead_min INT NOT NULL DEFAULT 20,
  delivery_lead_min INT NOT NULL DEFAULT 45,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.location_throttle ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER throttle_updated BEFORE UPDATE ON public.location_throttle
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "anyone reads throttle" ON public.location_throttle FOR SELECT USING (true);
CREATE POLICY "admins manage throttle" ON public.location_throttle FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Drivers
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  location_id TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read drivers for their location" ON public.drivers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.user_has_location(auth.uid(), location_id));
CREATE POLICY "admins manage drivers" ON public.drivers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Orders: driver + delivery status
CREATE TYPE public.delivery_status AS ENUM ('unassigned','assigned','out_for_delivery','delivered');
ALTER TABLE public.orders ADD COLUMN driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN delivery_status public.delivery_status;
ALTER TABLE public.orders ADD COLUMN dispatched_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN delivered_at TIMESTAMPTZ;

-- Seed default hours (Mon-Sun open 8am-8pm) for both locations
INSERT INTO public.store_hours (location_id, day_of_week, open_time, close_time, is_closed)
SELECT loc, dow, '08:00'::time, '20:00'::time, false
FROM (VALUES ('glen-rock'),('cresskill')) AS l(loc),
     generate_series(0,6) AS dow
ON CONFLICT DO NOTHING;

INSERT INTO public.location_throttle (location_id) VALUES ('glen-rock'),('cresskill')
ON CONFLICT DO NOTHING;
