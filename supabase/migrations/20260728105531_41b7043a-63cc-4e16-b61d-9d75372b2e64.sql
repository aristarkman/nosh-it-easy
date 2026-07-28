CREATE TABLE public.marketing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  source text NOT NULL DEFAULT 'gloriafood',
  last_order_at timestamptz,
  subscribed boolean NOT NULL DEFAULT true,
  unsubscribed_at timestamptz,
  bounced boolean NOT NULL DEFAULT false,
  bounce_reason text,
  last_emailed_at timestamptz,
  unsubscribe_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX marketing_contacts_email_key ON public.marketing_contacts (lower(email));
CREATE UNIQUE INDEX marketing_contacts_token_key ON public.marketing_contacts (unsubscribe_token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_contacts TO authenticated;
GRANT ALL ON public.marketing_contacts TO service_role;
ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage marketing contacts" ON public.marketing_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER marketing_contacts_updated_at BEFORE UPDATE ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  content_type text NOT NULL DEFAULT 'text',
  cta_label text,
  cta_url text,
  ramp integer[] NOT NULL DEFAULT '{50,100,200,400,600,800,1000,1000,1000,1000}',
  day_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  last_run_on date,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage marketing campaigns" ON public.marketing_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER marketing_campaigns_updated_at BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.marketing_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX marketing_sends_campaign_email_key ON public.marketing_sends (campaign_id, lower(email));
CREATE INDEX marketing_sends_campaign_idx ON public.marketing_sends (campaign_id, created_at DESC);

GRANT SELECT ON public.marketing_sends TO authenticated;
GRANT ALL ON public.marketing_sends TO service_role;
ALTER TABLE public.marketing_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view marketing sends" ON public.marketing_sends
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));