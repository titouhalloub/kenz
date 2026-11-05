-- Durable cross-device deletion markers for the local-first Kredy ledger.
-- Tombstones prevent an older offline device snapshot from recreating a deleted debt.
CREATE TABLE IF NOT EXISTS public.debt_sync_tombstones (
  debt_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debt_sync_tombstones_user
  ON public.debt_sync_tombstones(user_id, deleted_at DESC);

ALTER TABLE public.debt_sync_tombstones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own Kredy tombstones" ON public.debt_sync_tombstones;
CREATE POLICY "Users can read own Kredy tombstones"
  ON public.debt_sync_tombstones FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own Kredy tombstones" ON public.debt_sync_tombstones;
CREATE POLICY "Users can create own Kredy tombstones"
  ON public.debt_sync_tombstones FOR INSERT
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.debt_sync_tombstones TO authenticated;

DROP POLICY IF EXISTS "Users can update own Kredy tombstones" ON public.debt_sync_tombstones;
CREATE POLICY "Users can update own Kredy tombstones"
  ON public.debt_sync_tombstones FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT UPDATE ON public.debt_sync_tombstones TO authenticated;

-- Keep all three ledger tables in Realtime so other signed-in devices see
-- debt edits, appended payments, and deletion markers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'debts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.debts;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'debt_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.debt_payments;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'debt_sync_tombstones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.debt_sync_tombstones;
  END IF;
END $$;
