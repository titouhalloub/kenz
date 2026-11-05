-- Phase 12: authenticated, atomic AI usage metering.
-- The caller identity is always derived from auth.uid(); clients cannot debit another user's wallet.
CREATE OR REPLACE FUNCTION public.record_ai_usage(
  p_credits_to_debit BIGINT,
  p_mode TEXT,
  p_provider TEXT,
  p_model TEXT,
  p_tokens_input INTEGER,
  p_tokens_output INTEGER,
  p_purpose TEXT,
  p_idempotency_key TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance BIGINT;
  v_existing_balance BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF p_mode NOT IN ('managed', 'byok')
     OR p_credits_to_debit < 0
     OR (p_mode = 'managed' AND p_credits_to_debit <= 0)
     OR (p_mode = 'byok' AND p_credits_to_debit <> 0)
     OR p_tokens_input < 0
     OR p_tokens_output < 0
     OR NULLIF(BTRIM(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_AI_USAGE_REQUEST' USING ERRCODE = '22023';
  END IF;

  -- Serialize calls for this wallet; duplicate idempotency keys never debit twice.
  SELECT w.balance_credits
    INTO v_balance
    FROM public.ai_credit_wallets AS w
   WHERE w.user_id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_WALLET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT w.balance_credits
    INTO v_existing_balance
    FROM public.ai_usage_events AS e
    JOIN public.ai_credit_wallets AS w ON w.user_id = e.user_id
   WHERE e.user_id = v_user_id
     AND e.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_existing_balance;
  END IF;

  IF p_mode = 'managed' THEN
    UPDATE public.ai_credit_wallets
       SET balance_credits = balance_credits - p_credits_to_debit,
           lifetime_credits_used = lifetime_credits_used + p_credits_to_debit,
           updated_at = NOW()
     WHERE user_id = v_user_id
       AND balance_credits >= p_credits_to_debit
    RETURNING balance_credits INTO v_balance;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.credit_ledger_entries (
      user_id, entry_type, credits_delta, balance_after, reference_id, description
    ) VALUES (
      v_user_id, 'usage_debit', -p_credits_to_debit, v_balance, p_purpose,
      'Kenz AI usage debit (' || p_purpose || ')'
    );
  END IF;

  INSERT INTO public.ai_usage_events (
    user_id, mode, provider, model, tokens_input, tokens_output,
    credits_debited, purpose, idempotency_key
  ) VALUES (
    v_user_id, p_mode, COALESCE(NULLIF(p_provider, ''), 'unknown'),
    COALESCE(NULLIF(p_model, ''), 'unknown'),
    p_tokens_input, p_tokens_output, p_credits_to_debit, p_purpose, p_idempotency_key
  );

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_usage(BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;
