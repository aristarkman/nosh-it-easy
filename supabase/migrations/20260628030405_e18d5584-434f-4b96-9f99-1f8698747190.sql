GRANT INSERT ON public.orders TO anon;
GRANT INSERT, SELECT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;