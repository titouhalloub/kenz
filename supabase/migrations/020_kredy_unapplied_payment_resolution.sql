-- Resolve one unapplied Kredy payment only after the user confirms that the
-- original debt amount was recorded too low. Keep the original payment event.
-- The debt row lock and expected amount check make this safe across devices.
CREATE OR REPLACE FUNCTION public.resolve_kredy_unapplied_payment(
  p_payment_id UUID,
  p_expected_unapplied_minor BIGINT
)
RETURNS TABLE (
  payment_id UUID,
  adjusted_debt_total_minor BIGINT,
  applied_amount_minor BIGINT,
  unapplied_amount_minor BIGINT,
  remaining_amount_minor BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_debt public.debts%ROWTYPE;
  v_payment public.debt_payments%ROWTYPE;
  v_adjusted_total BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_expected_unapplied_minor IS NULL OR p_expected_unapplied_minor <= 0 THEN
    RAISE EXCEPTION 'A positive expected unapplied amount is required';
  END IF;

  -- Lock the owned debt first, matching record_kredy_payment lock order.
  SELECT d.* INTO v_debt
  FROM public.debts d
  JOIN public.debt_payments p ON p.debt_id = d.id
  WHERE p.id = p_payment_id
    AND d.user_id = v_user_id
  FOR UPDATE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  SELECT p.* INTO v_payment
  FROM public.debt_payments p
  WHERE p.id = p_payment_id
    AND p.debt_id = v_debt.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  IF v_payment.unapplied_amount_minor <= 0 THEN
    RAISE EXCEPTION 'This payment has no unapplied amount remaining';
  END IF;

  IF v_payment.unapplied_amount_minor <> p_expected_unapplied_minor THEN
    RAISE EXCEPTION 'The unapplied amount changed; refresh and review the payment again';
  END IF;

  -- Increasing the recorded debt total lets the existing allocation trigger
  -- recalculate every payment chronologically without changing payment events.
  UPDATE public.debts d
  SET
    total_amount_minor = d.total_amount_minor + v_payment.unapplied_amount_minor,
    updated_at = NOW()
  WHERE d.id = v_debt.id
    AND d.user_id = v_user_id
  RETURNING d.total_amount_minor INTO v_adjusted_total;

  RETURN QUERY
  SELECT
    p.id,
    d.total_amount_minor,
    p.applied_amount_minor,
    p.unapplied_amount_minor,
    d.remaining_amount_minor
  FROM public.debt_payments p
  JOIN public.debts d ON d.id = p.debt_id
  WHERE p.id = p_payment_id
    AND d.id = v_debt.id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_kredy_unapplied_payment(UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_kredy_unapplied_payment(UUID, BIGINT) TO authenticated;
