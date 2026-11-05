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
    'recurring_items', 'savings_goals', 'zakat_settings', 'festive_budgets', 'ai_credit_wallets'
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

-- Merge a single JSONB row against its common ancestor. A device timestamp
-- resolves same-field collisions; independent field edits are always retained.
CREATE OR REPLACE FUNCTION public.kenz_merge_jsonb(
  p_base jsonb, p_local jsonb, p_remote jsonb,
  p_local_updated_at timestamptz, p_remote_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := COALESCE(p_remote, '{}'::jsonb);
  v_key text;
  v_base jsonb;
  v_local jsonb;
  v_remote jsonb;
  v_local_changed boolean;
  v_remote_changed boolean;
  v_local_wins boolean;
BEGIN
  IF p_base IS NULL THEN
    IF COALESCE(p_local_updated_at, '-infinity'::timestamptz) >
       COALESCE(p_remote_updated_at, '-infinity'::timestamptz) THEN
      RETURN (COALESCE(p_remote, '{}'::jsonb) || COALESCE(p_local, '{}'::jsonb))
        - 'updated_at' - 'created_at' - 'syncUpdatedAt' - 'syncStatus';
    END IF;
    RETURN (COALESCE(p_local, '{}'::jsonb) || COALESCE(p_remote, '{}'::jsonb))
      - 'updated_at' - 'created_at' - 'syncUpdatedAt' - 'syncStatus';
  END IF;

  FOR v_key IN
    SELECT key FROM jsonb_object_keys(
      COALESCE(p_base, '{}'::jsonb) ||
      COALESCE(p_local, '{}'::jsonb) ||
      COALESCE(p_remote, '{}'::jsonb)
    ) AS keys(key)
  LOOP
    IF v_key IN ('id', 'user_id', 'email', 'created_at', 'updated_at', 'syncUpdatedAt', 'syncStatus') THEN
      CONTINUE;
    END IF;
    v_base := p_base -> v_key;
    v_local := p_local -> v_key;
    v_remote := p_remote -> v_key;
    v_local_changed := v_local IS DISTINCT FROM v_base;
    v_remote_changed := v_remote IS DISTINCT FROM v_base;

    IF v_local_changed AND NOT v_remote_changed THEN
      v_result := CASE WHEN v_local IS NULL THEN v_result - v_key
        ELSE jsonb_set(v_result, ARRAY[v_key], v_local, true) END;
    ELSIF v_local_changed AND v_remote_changed AND v_local IS NOT DISTINCT FROM v_remote THEN
      v_result := CASE WHEN v_local IS NULL THEN v_result - v_key
        ELSE jsonb_set(v_result, ARRAY[v_key], v_local, true) END;
    ELSIF v_local_changed AND v_remote_changed THEN
      v_local_wins :=
        COALESCE(p_local_updated_at, '-infinity'::timestamptz) >
        COALESCE(p_remote_updated_at, '-infinity'::timestamptz)
        OR (
          COALESCE(p_local_updated_at, '-infinity'::timestamptz) =
          COALESCE(p_remote_updated_at, '-infinity'::timestamptz)
          AND COALESCE(v_local::text, '') > COALESCE(v_remote::text, '')
        );
      IF v_local_wins THEN
        v_result := CASE WHEN v_local IS NULL THEN v_result - v_key
          ELSE jsonb_set(v_result, ARRAY[v_key], v_local, true) END;
      END IF;
    END IF;
  END LOOP;
  RETURN v_result - 'updated_at' - 'created_at' - 'syncUpdatedAt' - 'syncStatus';
END;
$$;

REVOKE ALL ON FUNCTION public.kenz_merge_jsonb(jsonb, jsonb, jsonb, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kenz_merge_jsonb(jsonb, jsonb, jsonb, timestamptz, timestamptz) TO authenticated;

-- Every collection sync takes the same per-user profile row lock. That makes
-- read/merge/write atomic across simultaneous device reconnects.
CREATE OR REPLACE FUNCTION public.sync_kenz_collection(
  p_table text, p_local_rows jsonb, p_base_rows jsonb,
  p_deleted_ids jsonb, p_updated_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_remote_rows jsonb;
  v_local jsonb;
  v_remote jsonb;
  v_base jsonb;
  v_merged jsonb;
  v_id text;
  v_column_list text;
  v_update_list text;
  v_deleted text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_table NOT IN ('accounts', 'transactions', 'budgets', 'recurring_items', 'savings_goals', 'festive_budgets') THEN
    RAISE EXCEPTION 'UNSUPPORTED_SYNC_COLLECTION';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE user_id = $1',
    p_table
  ) INTO v_remote_rows USING v_user_id;

  FOR v_local IN SELECT value FROM jsonb_array_elements(COALESCE(p_local_rows, '[]'::jsonb))
  LOOP
    v_id := v_local ->> 'id';
    IF v_id IS NULL OR COALESCE(v_local ->> 'user_id', '') <> v_user_id::text THEN
      RAISE EXCEPTION 'INVALID_SYNC_ROW_OWNER';
    END IF;

    IF COALESCE(p_deleted_ids, '[]'::jsonb) ? v_id THEN
      EXECUTE format('DELETE FROM public.%I WHERE id = $1::uuid AND user_id = $2', p_table)
        USING v_id, v_user_id;
      CONTINUE;
    END IF;

    SELECT value INTO v_remote
    FROM jsonb_array_elements(v_remote_rows) AS rows(value)
    WHERE value ->> 'id' = v_id LIMIT 1;
    SELECT value INTO v_base
    FROM jsonb_array_elements(COALESCE(p_base_rows, '[]'::jsonb)) AS rows(value)
    WHERE value ->> 'id' = v_id LIMIT 1;

    IF v_remote IS NULL THEN
      IF v_base IS NOT NULL AND v_local IS NOT DISTINCT FROM v_base THEN
        CONTINUE; -- Cloud deletion wins over an unchanged stale local row.
      END IF;
      v_merged := v_local;
    ELSE
      v_merged := public.kenz_merge_jsonb(
        v_base, v_local, v_remote, p_updated_at,
        NULLIF(v_remote ->> 'updated_at', '')::timestamptz
      );
    END IF;

    v_merged := (v_merged - 'syncUpdatedAt' - 'syncStatus') ||
      jsonb_build_object('user_id', v_user_id, 'updated_at', now());

    SELECT string_agg(format('%I', column_name), ',')
      INTO v_column_list
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table
      AND v_merged ? column_name;

    SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ',')
      INTO v_update_list
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table
      AND v_merged ? column_name
      AND column_name NOT IN ('id', 'user_id', 'created_at', 'updated_at');

    EXECUTE format(
      'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT (id) DO UPDATE SET %s',
      p_table, v_column_list, v_column_list, p_table, v_update_list
    ) USING v_merged;
  END LOOP;

  FOR v_deleted IN SELECT jsonb_array_elements_text(COALESCE(p_deleted_ids, '[]'::jsonb))
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE id = $1::uuid AND user_id = $2', p_table)
      USING v_deleted, v_user_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_kenz_collection(text, jsonb, jsonb, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_kenz_collection(text, jsonb, jsonb, jsonb, timestamptz) TO authenticated;

-- One atomic sync operation for profile, accounts, transactions, budgets,
-- recurring items, savings goals, and festive budgets.
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

  PERFORM public.sync_kenz_collection('transactions',
    COALESCE(p_snapshot -> 'transactions', '[]'::jsonb),
    COALESCE(p_base -> 'transactions', '[]'::jsonb),
    COALESCE(p_deleted -> 'transactions', '[]'::jsonb), p_updated_at);
  PERFORM public.sync_kenz_collection('budgets',
    COALESCE(p_snapshot -> 'budgets', '[]'::jsonb),
    COALESCE(p_base -> 'budgets', '[]'::jsonb),
    COALESCE(p_deleted -> 'budgets', '[]'::jsonb), p_updated_at);
  PERFORM public.sync_kenz_collection('recurring_items',
    COALESCE(p_snapshot -> 'recurring_items', '[]'::jsonb),
    COALESCE(p_base -> 'recurring_items', '[]'::jsonb),
    COALESCE(p_deleted -> 'recurring_items', '[]'::jsonb), p_updated_at);
  PERFORM public.sync_kenz_collection('savings_goals',
    COALESCE(p_snapshot -> 'savings_goals', '[]'::jsonb),
    COALESCE(p_base -> 'savings_goals', '[]'::jsonb),
    COALESCE(p_deleted -> 'savings_goals', '[]'::jsonb), p_updated_at);
  PERFORM public.sync_kenz_collection('accounts',
    COALESCE(p_snapshot -> 'accounts', '[]'::jsonb),
    COALESCE(p_base -> 'accounts', '[]'::jsonb),
    COALESCE(p_deleted -> 'accounts', '[]'::jsonb), p_updated_at);
  PERFORM public.sync_kenz_collection('festive_budgets',
    COALESCE(p_snapshot -> 'festive_budgets', '[]'::jsonb),
    COALESCE(p_base -> 'festive_budgets', '[]'::jsonb),
    COALESCE(p_deleted -> 'festive_budgets', '[]'::jsonb), p_updated_at);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_kenz_financial_snapshot(jsonb, jsonb, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_kenz_financial_snapshot(jsonb, jsonb, jsonb, timestamptz) TO authenticated;

-- Zakat settings share the same per-user lock so concurrent offline edits merge atomically.
CREATE OR REPLACE FUNCTION public.sync_kenz_zakat_snapshot(
  p_local jsonb, p_base jsonb, p_updated_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_remote jsonb;
  v_merged jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  SELECT to_jsonb(z) INTO v_remote
  FROM public.zakat_settings z WHERE z.user_id = v_user_id FOR UPDATE;

  v_merged := public.kenz_merge_jsonb(
    p_base, p_local, COALESCE(v_remote, '{}'::jsonb),
    p_updated_at, NULLIF(v_remote ->> 'updated_at', '')::timestamptz
  );

  INSERT INTO public.zakat_settings (
    user_id, nisab_threshold_minor, gold_price_per_gram_minor,
    custom_cash_minor, custom_savings_minor, custom_business_goods_minor,
    custom_liabilities_minor, is_paid, paid_date, paid_amount_minor, updated_at
  ) VALUES (
    v_user_id,
    COALESCE((v_merged ->> 'nisab_threshold_minor')::bigint, 95000000),
    COALESCE((v_merged ->> 'gold_price_per_gram_minor')::bigint, 1150000),
    COALESCE((v_merged ->> 'custom_cash_minor')::bigint, 0),
    COALESCE((v_merged ->> 'custom_savings_minor')::bigint, 0),
    COALESCE((v_merged ->> 'custom_business_goods_minor')::bigint, 0),
    COALESCE((v_merged ->> 'custom_liabilities_minor')::bigint, 0),
    COALESCE((v_merged ->> 'is_paid')::boolean, false),
    NULLIF(v_merged ->> 'paid_date', '')::date,
    NULLIF(v_merged ->> 'paid_amount_minor', '')::bigint,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    nisab_threshold_minor = EXCLUDED.nisab_threshold_minor,
    gold_price_per_gram_minor = EXCLUDED.gold_price_per_gram_minor,
    custom_cash_minor = EXCLUDED.custom_cash_minor,
    custom_savings_minor = EXCLUDED.custom_savings_minor,
    custom_business_goods_minor = EXCLUDED.custom_business_goods_minor,
    custom_liabilities_minor = EXCLUDED.custom_liabilities_minor,
    is_paid = EXCLUDED.is_paid,
    paid_date = EXCLUDED.paid_date,
    paid_amount_minor = EXCLUDED.paid_amount_minor,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.sync_kenz_zakat_snapshot(jsonb, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_kenz_zakat_snapshot(jsonb, jsonb, timestamptz) TO authenticated;
