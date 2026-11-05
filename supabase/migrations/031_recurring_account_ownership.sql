-- Ensure recurring items can only reference an account owned by the same user.
DROP POLICY IF EXISTS "Users can manage own recurring items" ON public.recurring_items;
CREATE POLICY "Users can manage own recurring items"
  ON public.recurring_items
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      account_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.accounts a
        WHERE a.id = account_id AND a.user_id = (select auth.uid())
      )
    )
  );
