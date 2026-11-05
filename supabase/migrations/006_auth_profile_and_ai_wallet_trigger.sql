-- Create the application profile and initial AI credit wallet for every new auth user.
-- The trigger is SECURITY DEFINER so it can write the profile despite client-facing RLS.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ai_credit_wallets (user_id, balance_credits)
  VALUES (NEW.id, 500)
  ON CONFLICT (user_id) DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.credit_ledger_entries (
      user_id, entry_type, credits_delta, balance_after, description
    )
    VALUES (
      NEW.id, 'grant', 500, 500, 'Initial Kenz AI credits'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill users who already existed before this migration.
INSERT INTO public.profiles (id, email, display_name)
SELECT
  u.id,
  COALESCE(u.email, ''),
  NULLIF(u.raw_user_meta_data ->> 'full_name', '')
FROM auth.users AS u
ON CONFLICT (id) DO NOTHING;

WITH created_wallets AS (
  INSERT INTO public.ai_credit_wallets (user_id, balance_credits)
  SELECT u.id, 500
  FROM auth.users AS u
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id, balance_credits
)
INSERT INTO public.credit_ledger_entries (
  user_id, entry_type, credits_delta, balance_after, description
)
SELECT
  user_id, 'grant', balance_credits, balance_credits, 'Initial Kenz AI credits'
FROM created_wallets;
