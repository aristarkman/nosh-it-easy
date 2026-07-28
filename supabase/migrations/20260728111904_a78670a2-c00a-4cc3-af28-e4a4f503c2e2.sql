ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';

ALTER TABLE public.marketing_campaigns
  DROP CONSTRAINT IF EXISTS marketing_campaigns_channel_check;
ALTER TABLE public.marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_channel_check CHECK (channel IN ('email','sms'));

ALTER TABLE public.marketing_sends ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.marketing_sends ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_sends_campaign_phone_key
  ON public.marketing_sends (campaign_id, phone) WHERE phone IS NOT NULL;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS sms_subscribed boolean NOT NULL DEFAULT true;
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS last_texted_at timestamptz;