DROP POLICY IF EXISTS "anyone updates own session cart" ON public.abandoned_carts;
DROP POLICY IF EXISTS "anyone upserts own session cart" ON public.abandoned_carts;

-- INSERT: anonymous carts must have NULL user_id; authenticated carts must match auth.uid()
CREATE POLICY "insert own session cart"
ON public.abandoned_carts
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL)
  OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

-- UPDATE: anonymous can only update anonymous carts (user_id IS NULL);
-- authenticated users can only update their own rows; cannot change ownership
CREATE POLICY "update own session cart"
ON public.abandoned_carts
FOR UPDATE
TO anon, authenticated
USING (
  (auth.uid() IS NULL AND user_id IS NULL)
  OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
)
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL)
  OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
);