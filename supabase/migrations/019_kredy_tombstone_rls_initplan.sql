-- Cache the authenticated user ID once per statement in tombstone RLS policies.
DROP POLICY IF EXISTS "Users can read own Kredy tombstones" ON public.debt_sync_tombstones;
CREATE POLICY "Users can read own Kredy tombstones"
  ON public.debt_sync_tombstones FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own Kredy tombstones" ON public.debt_sync_tombstones;
CREATE POLICY "Users can create own Kredy tombstones"
  ON public.debt_sync_tombstones FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own Kredy tombstones" ON public.debt_sync_tombstones;
CREATE POLICY "Users can update own Kredy tombstones"
  ON public.debt_sync_tombstones FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
