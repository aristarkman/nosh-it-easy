ALTER TABLE public.marketing_contacts
  ADD CONSTRAINT marketing_contacts_email_unique UNIQUE (email);