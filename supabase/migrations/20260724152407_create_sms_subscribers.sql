CREATE TABLE IF NOT EXISTS public.sms_subscribers (
  phone TEXT PRIMARY KEY,
  sms_consent BOOLEAN NOT NULL DEFAULT true,
  confirmation_sent_at TIMESTAMPTZ,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_subscribers ENABLE ROW LEVEL SECURITY;
-- No policies: this table is only ever read/written via server functions
-- using the service-role client (supabaseAdmin). No direct client access.
REVOKE ALL ON public.sms_subscribers FROM anon;
REVOKE ALL ON public.sms_subscribers FROM authenticated;
