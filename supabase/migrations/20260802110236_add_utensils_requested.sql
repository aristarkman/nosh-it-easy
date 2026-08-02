-- Customer-facing "include plastic cutlery & napkins" checkbox at checkout.
-- Prints on the kitchen ticket and shows on the tablet order card.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS utensils_requested boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
