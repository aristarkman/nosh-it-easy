
CREATE OR REPLACE FUNCTION public.handle_new_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.customer_profiles (user_id, full_name, email, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'phone'
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Welcome bonus: 100 points, once per user
  IF NOT EXISTS (
    SELECT 1 FROM public.loyalty_ledger
    WHERE user_id = NEW.id AND note = 'welcome_bonus'
  ) THEN
    INSERT INTO public.loyalty_ledger (user_id, kind, points, note)
    VALUES (NEW.id, 'adjust', 100, 'welcome_bonus');
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill existing customers who never received the welcome bonus
INSERT INTO public.loyalty_ledger (user_id, kind, points, note)
SELECT cp.user_id, 'adjust', 100, 'welcome_bonus'
FROM public.customer_profiles cp
WHERE NOT EXISTS (
  SELECT 1 FROM public.loyalty_ledger ll
  WHERE ll.user_id = cp.user_id AND ll.note = 'welcome_bonus'
);
