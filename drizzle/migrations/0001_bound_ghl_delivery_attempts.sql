CREATE OR REPLACE FUNCTION public.send_pending_ghl_order_contacts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE q record; n uuid;
BEGIN
 FOR q IN SELECT order_id FROM public.ghl_order_contact_outbox WHERE synced_at IS NULL AND attempts < 12 AND next_attempt_at <= now() AND (nonce_expires_at IS NULL OR nonce_expires_at <= now()) ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED
 LOOP
  n := gen_random_uuid();
  UPDATE public.ghl_order_contact_outbox SET delivery_nonce=n, attempts=attempts+1, nonce_expires_at=now()+interval '5 minutes', next_attempt_at=now()+interval '5 minutes' WHERE order_id=q.order_id;
  PERFORM net.http_post(url:='https://takeout.koshernosh.com/api/public/hooks/ghl-order-contact', headers:=jsonb_build_object('Content-Type','application/json'), body:=jsonb_build_object('nonce',n), timeout_milliseconds:=60000);
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.ghl_order_contact_outbox WHERE synced_at IS NULL AND attempts<12) THEN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='ghl-order-contact-retry';
 END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.claim_ghl_order_contact(_nonce uuid)
RETURNS TABLE(order_id uuid, customer_name text, customer_email text, customer_phone text, email_consent boolean, sms_consent boolean, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE claimed uuid;
BEGIN
 UPDATE public.ghl_order_contact_outbox q SET delivery_nonce=NULL WHERE q.delivery_nonce=_nonce AND q.nonce_expires_at>now() AND q.synced_at IS NULL RETURNING q.order_id INTO claimed;
 IF claimed IS NULL THEN RETURN; END IF;
 RETURN QUERY SELECT o.id,o.customer_name,o.customer_email,o.customer_phone,coalesce(c.email_consent,false),coalesce(c.sms_consent,false),q.attempts FROM public.orders o JOIN public.ghl_order_contact_outbox q ON q.order_id=o.id LEFT JOIN LATERAL public.ghl_order_marketing_consent(o.id) c ON true WHERE o.id=claimed;
END;
$$;