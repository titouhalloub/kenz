-- Phase 25: publish the authoritative AI wallet balance for cross-device refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_credit_wallets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_credit_wallets;
  END IF;
END;
$$;
