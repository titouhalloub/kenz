-- Tighten challenge configuration and validate every recorded contribution date.
ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_challenge_configuration_check
  CHECK (
    challenge_frequency IS NULL OR (
      challenge_period_amount_minor IS NOT NULL
      AND challenge_start_date IS NOT NULL
      AND challenge_end_date IS NOT NULL
      AND challenge_start_date <= challenge_end_date
      AND challenge_starting_amount_minor IS NOT NULL
    )
  );

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
  v_start_date date;
  v_end_date date;
  v_contribution_date date := COALESCE(p_contribution_date, CURRENT_DATE);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN RAISE EXCEPTION 'INVALID_CONTRIBUTION_AMOUNT'; END IF;

  SELECT challenge_start_date, challenge_end_date
    INTO v_start_date, v_end_date
  FROM public.savings_goals
  WHERE id = p_goal_id AND user_id = v_user_id AND challenge_frequency IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_contribution_date < v_start_date OR v_contribution_date > v_end_date THEN
    RAISE EXCEPTION 'CONTRIBUTION_OUTSIDE_CHALLENGE_DATES';
  END IF;

  INSERT INTO public.savings_challenge_contributions
    (id, user_id, savings_goal_id, amount_minor, contribution_date, note)
  VALUES
    (p_id, v_user_id, p_goal_id, p_amount_minor, v_contribution_date, NULLIF(trim(p_note), ''))
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN RETURN false; END IF;

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
