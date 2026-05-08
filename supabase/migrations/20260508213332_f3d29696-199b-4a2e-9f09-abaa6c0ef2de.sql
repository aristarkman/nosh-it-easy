DROP POLICY IF EXISTS "anyone can insert orders" ON public.orders;
CREATE POLICY "anyone can insert orders" ON public.orders FOR INSERT TO public WITH CHECK (true);