-- Point 2: Savings Challenges
-- A challenge is a savings goal with a cadence and a required amount per period.
-- Contributions are append-only events; the RPC applies each event exactly once.

ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS challenge_frequency text,
  ADD COLUMN IF NOT EXISTS challenge_period_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS challenge_start_date date,
  ADD COLUMN IF NOT EXISTS challenge_end_date date,
  ADD COLUMN IF NOT EXISTS challenge_starting_amount_minor bigint;

ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_challenge_frequency_check
  CHECK (challenge_frequency IS NULL OR challenge_frequency IN ('daily', 'weekly', 'monthly'));

ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_challenge_period_amount_check
  CHECK (challenge_period_amount_minor IS NULL OR challenge_period_amount_minor > 0);

ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_challenge_starting_amount_check
  CHECK (challenge_starting_amount_minor IS NULL OR challenge_starting_amount_minor >= 0);

CREATE TABLE IF NOT EXISTS public.savings_challenge_contributions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  savings_goal_id uuid NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  contribution_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS savings_challenge_contributions_goal_date_idx
  ON public.savings_challenge_contributions (savings_goal_id, contribution_date DESC);

CREATE INDEX IF NOT EXISTS savings_challenge_contributions_user_idx
  ON public.savings_challenge_contributions (user_id, created_at DESC);

ALTER TABLE public.savings_challenge_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own savings challenge contributions" ON public.savings_challenge_contributions;
CREATE POLICY "Users read own savings challenge contributions"
  ON public.savings_challenge_contributions FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users add own savings challenge contributions" ON public.savings_challenge_contributions;
CREATE POLICY "Users add own savings challenge contributions"
  ON public.savings_challenge_contributions FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.savings_goals g
      WHERE g.id = savings_goal_id AND g.user_id = (select auth.uid())
        AND g.challenge_frequency IS NOT NULL
    )
  );

GRANT SELECT, INSERT ON public.savings_challenge_contributions TO authenticated;
REVOKE ALL ON public.savings_challenge_contributions FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.record_kenz_savings_challenge_contribution(
  p_id uuid,
  p_goal_id uuid,
  p_amount_minor bigint,
  p_contribution_date date,
  p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_inserted_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN RAISE EXCEPTION 'INVALID_CONTRIBUTION_AMOUNT'; END IF;

  PERFORM 1 FROM public.savings_goals
  WHERE id = p_goal_id AND user_id = v_user_id AND challenge_frequency IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;

  INSERT INTO public.savings_challenge_contributions
    (id, user_id, savings_goal_id, amount_minor, contribution_date, note)
  VALUES
    (p_id, v_user_id, p_goal_id, p_amount_minor, COALESCE(p_contribution_date, CURRENT_DATE), NULLIF(trim(p_note), ''))
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.savings_goals
  SET current_amount_minor = current_amount_minor + p_amount_minor,
      status = CASE
        WHEN current_amount_minor + p_amount_minor >= target_amount_minor THEN 'achieved'::public.goal_status
        ELSE status
      END,
      updated_at = now()
  WHERE id = p_goal_id AND user_id = v_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_kenz_savings_challenge_contribution(uuid, uuid, bigint, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_kenz_savings_challenge_contribution(uuid, uuid, bigint, date, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'savings_challenge_contributions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.savings_challenge_contributions;
  END IF;
END;
$$;
