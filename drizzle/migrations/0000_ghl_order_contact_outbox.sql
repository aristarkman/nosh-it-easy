-- lovable-cron-fallback-reviewed: Immediate enqueue delivery with bounded five-minute retries armed only while pending rows exist, unscheduled on drain.
CREATE TABLE public.ghl_order_contact_outbox (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), synced_at timestamptz, contact_id text,
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 delivery_nonce uuid, nonce_expires_at timestamptz, last_error text
);
GRANT ALL ON public.ghl_order_contact_outbox TO service_role;
REVOKE ALL ON public.ghl_order_contact_outbox FROM anon, authenticated;
ALTER TABLE public.ghl_order_contact_outbox ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.ghl_order_marketing_consent(_order_id uuid)
RETURNS TABLE(email_consent boolean, sms_consent boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT
 coalesce(p.marketing_email AND lower(trim(p.email))=lower(trim(o.customer_email)), false)
 AND NOT EXISTS (SELECT 1 FROM public.marketing_contacts m WHERE lower(trim(m.email))=lower(trim(o.customer_email)) AND NOT m.subscribed),
 coalesce(CASE WHEN right(regexp_replace(p.phone,'[^0-9]','','g'),10)=right(regexp_replace(o.customer_phone,'[^0-9]','','g'),10) THEN p.marketing_sms END, s.marketing_sms_consent, false)
 FROM public.orders o
 LEFT JOIN public.customer_profiles p ON p.user_id=o.user_id
 LEFT JOIN public.sms_subscribers s ON right(regexp_replace(s.phone,'[^0-9]','','g'),10)=right(regexp_replace(o.customer_phone,'[^0-9]','','g'),10)
 WHERE o.id=_order_id AND o.status::text <> 'cancelled'
$$;
REVOKE ALL ON FUNCTION public.ghl_order_marketing_consent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ghl_order_marketing_consent(uuid) TO service_role;
CREATE FUNCTION public.send_pending_ghl_order_contacts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE q record; n uuid;
BEGIN
 FOR q IN SELECT order_id FROM public.ghl_order_contact_outbox
 WHERE synced_at IS NULL AND attempts < 12 AND next_attempt_at <= now()
 AND (nonce_expires_at IS NULL OR nonce_expires_at <= now())
 ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED
 LOOP
  n := gen_random_uuid();
  UPDATE public.ghl_order_contact_outbox SET delivery_nonce=n, nonce_expires_at=now()+interval '5 minutes', next_attempt_at=now()+interval '5 minutes' WHERE order_id=q.order_id;
  PERFORM net.http_post(url:='https://takeout.koshernosh.com/api/public/hooks/ghl-order-contact', headers:=jsonb_build_object('Content-Type','application/json'), body:=jsonb_build_object('nonce',n), timeout_milliseconds:=60000);
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.ghl_order_contact_outbox WHERE synced_at IS NULL AND attempts<12) THEN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='ghl-order-contact-retry';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.send_pending_ghl_order_contacts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_pending_ghl_order_contacts() TO service_role;
CREATE FUNCTION public.enqueue_ghl_order_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.ghl_order_marketing_consent(NEW.id) c WHERE c.email_consent OR c.sms_consent) THEN
  INSERT INTO public.ghl_order_contact_outbox(order_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  PERFORM pg_advisory_xact_lock(27102026);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='ghl-order-contact-retry') THEN
   PERFORM cron.schedule('ghl-order-contact-retry','*/5 * * * *','SELECT public.send_pending_ghl_order_contacts();');
  END IF;
  PERFORM public.send_pending_ghl_order_contacts();
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_ghl_order_contact() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER orders_enqueue_ghl_contact AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_ghl_order_contact();
CREATE FUNCTION public.claim_ghl_order_contact(_nonce uuid)
RETURNS TABLE(order_id uuid, customer_name text, customer_email text, customer_phone text, email_consent boolean, sms_consent boolean, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE claimed uuid;
BEGIN
 UPDATE public.ghl_order_contact_outbox q SET delivery_nonce=NULL, attempts=q.attempts+1
 WHERE q.delivery_nonce=_nonce AND q.nonce_expires_at>now() AND q.synced_at IS NULL
 RETURNING q.order_id INTO claimed;
 IF claimed IS NULL THEN RETURN; END IF;
 RETURN QUERY SELECT o.id,o.customer_name,o.customer_email,o.customer_phone,coalesce(c.email_consent,false),coalesce(c.sms_consent,false),q.attempts
 FROM public.orders o JOIN public.ghl_order_contact_outbox q ON q.order_id=o.id
 LEFT JOIN LATERAL public.ghl_order_marketing_consent(o.id) c ON true WHERE o.id=claimed;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_ghl_order_contact(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ghl_order_contact(uuid) TO service_role;