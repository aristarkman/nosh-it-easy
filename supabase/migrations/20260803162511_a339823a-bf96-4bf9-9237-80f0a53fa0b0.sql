ALTER TABLE public.sms_subscribers
  ADD COLUMN IF NOT EXISTS marketing_sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_sms_consent_at timestamptz;

NOTIFY pgrst, 'reload schema';