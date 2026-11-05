-- Move privileged AI metering logic out of the exposed public API schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER FUNCTION public.record_ai_usage(BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT)
  SET SCHEMA private;

GRANT EXECUTE ON FUNCTION private.record_ai_usage(BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT)
  TO authenticated;

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
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.record_ai_usage(
    p_credits_to_debit, p_mode, p_provider, p_model,
    p_tokens_input, p_tokens_output, p_purpose, p_idempotency_key
  );
$$;

REVOKE ALL ON FUNCTION public.record_ai_usage(BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT)
  TO authenticated;