-- Phase 24: consistent row revisions and realtime for cross-device conflict resolution.
-- Budgets and recurring items were missing updated_at, which made same-field
-- collision ordering impossible to determine after a device went offline.

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.recurring_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_sync_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'accounts', 'transactions', 'budgets',
    'recurring_items', 'savings_goals', 'zakat_settings', 'festive_budgets'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_sync_updated_at ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER touch_sync_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_sync_updated_at()',
      table_name
    );
  END LOOP;
END;
$$;

-- Add user-owned financial tables to Realtime only when not already published.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'accounts', 'transactions', 'budgets',
    'recurring_items', 'savings_goals', 'zakat_settings', 'festive_budgets'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
