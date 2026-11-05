-- Keep the auth signup trigger in a non-exposed schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.handle_new_user()
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
    VALUES (NEW.id, 'grant', 500, 500, 'Initial Kenz AI credits');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();
DROP FUNCTION IF EXISTS public.handle_new_user();
