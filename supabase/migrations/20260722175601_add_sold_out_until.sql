-- Let a sold-out item auto-return to available at a set time, instead of
-- requiring staff to remember to flip it back on.
ALTER TABLE public.menu_item_availability
  ADD COLUMN sold_out_until timestamptz;

COMMENT ON COLUMN public.menu_item_availability.sold_out_until IS
  'When set and sold_out is true, the item is treated as available again once this time passes. NULL means sold out indefinitely, until cleared manually.';
