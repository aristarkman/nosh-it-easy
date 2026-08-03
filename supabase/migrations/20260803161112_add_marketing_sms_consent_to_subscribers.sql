-- Separate marketing SMS consent from transactional (order-status) consent
-- on sms_subscribers, so phone-only opt-ins (guest checkout, the standalone
-- /sms-opt-in page) can be reached by marketing blasts too, not just
-- logged-in accounts (customer_profiles.marketing_sms).

ALTER TABLE public.sms_subscribers
  ADD COLUMN IF NOT EXISTS marketing_sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_sms_consent_at timestamptz;

NOTIFY pgrst, 'reload schema';
