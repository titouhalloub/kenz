-- Phase 26: synchronize financial rows in foreign-key dependency order.
-- Parent rows must exist before transactions are upserted. Deletes run in the
-- reverse dependency order so account/recurring-item references are not broken.
-- Linked transfers are deferred to a second transaction pass so either row in
-- a transfer pair can be inserted first without violating the self-reference.

CREATE OR REPLACE FUNCTION public.sync_kenz_financial_snapshot(
  p_snapshot jsonb, p_base jsonb, p_deleted jsonb, p_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_remote_profile jsonb;
  v_profile jsonb;
  v_local_transactions jsonb;
  v_base_transactions jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT to_jsonb(p) INTO v_remote_profile
  FROM public.profiles p WHERE p.id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  v_profile := public.kenz_merge_jsonb(
    p_base -> 'profile', p_snapshot -> 'profile', v_remote_profile,
    p_updated_at, NULLIF(v_remote_profile ->> 'updated_at', '')::timestamptz
  );

  UPDATE public.profiles
  SET display_name = v_profile ->> 'display_name',
      preferred_currency = COALESCE(v_profile ->> 'preferred_currency', preferred_currency),
      locale = COALESCE(v_profile ->> 'locale', locale),
      payday_day_of_month = NULLIF(v_profile ->> 'payday_day_of_month', '')::smallint,
      planning_period_days = COALESCE(NULLIF(v_profile ->> 'planning_period_days', '')::smallint, planning_period_days),
      updated_at = now()
  WHERE id = v_user_id;

  -- Upsert referenced parent rows first. Deletions are intentionally deferred.
  PERFORM public.sync_kenz_collection('accounts',
    COALESCE(p_snapshot -> 'accounts', '[]'::jsonb),
    COALESCE(p_base -> 'accounts', '[]'::jsonb),
    '[]'::jsonb, p_updated_at);

  PERFORM public.sync_kenz_collection('recurring_items',
    COALESCE(p_snapshot -> 'recurring_items', '[]'::jsonb),
    COALESCE(p_base -> 'recurring_items', '[]'::jsonb),
    '[]'::jsonb, p_updated_at);

  -- First pass creates/updates transactions without their self-referencing
  -- linked_transfer_id. Existing remote links remain untouched by this pass.
  SELECT COALESCE(jsonb_agg(value - 'linked_transfer_id'), '[]'::jsonb)
    INTO v_local_transactions
  FROM jsonb_array_elements(COALESCE(p_snapshot -> 'transactions', '[]'::jsonb)) AS rows(value);

  SELECT COALESCE(jsonb_agg(value - 'linked_transfer_id'), '[]'::jsonb)
    INTO v_base_transactions
  FROM jsonb_array_elements(COALESCE(p_base -> 'transactions', '[]'::jsonb)) AS rows(value);

  PERFORM public.sync_kenz_collection('transactions',
    v_local_transactions, v_base_transactions, '[]'::jsonb, p_updated_at);

  -- Second pass restores/merges transfer links after both sides exist.
  PERFORM public.sync_kenz_collection('transactions',
    COALESCE(p_snapshot -> 'transactions', '[]'::jsonb),
    COALESCE(p_base -> 'transactions', '[]'::jsonb),
    '[]'::jsonb, p_updated_at);

  PERFORM public.sync_kenz_collection('budgets',
    COALESCE(p_snapshot -> 'budgets', '[]'::jsonb),
    COALESCE(p_base -> 'budgets', '[]'::jsonb),
    '[]'::jsonb, p_updated_at);

  PERFORM public.sync_kenz_collection('savings_goals',
    COALESCE(p_snapshot -> 'savings_goals', '[]'::jsonb),
    COALESCE(p_base -> 'savings_goals', '[]'::jsonb),
    '[]'::jsonb, p_updated_at);

  PERFORM public.sync_kenz_collection('festive_budgets',
    COALESCE(p_snapshot -> 'festive_budgets', '[]'::jsonb),
    COALESCE(p_base -> 'festive_budgets', '[]'::jsonb),
    '[]'::jsonb, p_updated_at);

  -- Delete dependent rows before their referenced parents.
  PERFORM public.sync_kenz_collection('transactions', '[]'::jsonb, '[]'::jsonb,
    COALESCE(p_deleted -> 'transactions', '[]'::jsonb), p_updated_at);

  PERFORM public.sync_kenz_collection('budgets', '[]'::jsonb, '[]'::jsonb,
    COALESCE(p_deleted -> 'budgets', '[]'::jsonb), p_updated_at);

  PERFORM public.sync_kenz_collection('savings_goals', '[]'::jsonb, '[]'::jsonb,
    COALESCE(p_deleted -> 'savings_goals', '[]'::jsonb), p_updated_at);

  PERFORM public.sync_kenz_collection('recurring_items', '[]'::jsonb, '[]'::jsonb,
    COALESCE(p_deleted -> 'recurring_items', '[]'::jsonb), p_updated_at);

  PERFORM public.sync_kenz_collection('accounts', '[]'::jsonb, '[]'::jsonb,
    COALESCE(p_deleted -> 'accounts', '[]'::jsonb), p_updated_at);

  PERFORM public.sync_kenz_collection('festive_budgets', '[]'::jsonb, '[]'::jsonb,
    COALESCE(p_deleted -> 'festive_budgets', '[]'::jsonb), p_updated_at);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_kenz_financial_snapshot(jsonb, jsonb, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_kenz_financial_snapshot(jsonb, jsonb, jsonb, timestamptz) TO authenticated;
