-- Keep duplicate references pointed directly at a canonical payment event.
-- A payment already referenced by duplicate events cannot itself become a duplicate.
CREATE OR REPLACE FUNCTION public.resolve_kredy_payment_issue(
  p_payment_id UUID,
  p_action TEXT,
  p_refund_amount_minor BIGINT DEFAULT NULL,
  p_duplicate_of_payment_id UUID DEFAULT NULL
)
RETURNS TABLE (
  payment_id UUID,
  resolution_status TEXT,
  refunded_amount_minor BIGINT,
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
  v_target public.debt_payments%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('duplicate', 'refund') THEN
    RAISE EXCEPTION 'Unsupported payment resolution action';
  END IF;

  SELECT d.* INTO v_debt
  FROM public.debts d JOIN public.debt_payments p ON p.debt_id = d.id
  WHERE p.id = p_payment_id AND d.user_id = v_user_id
  FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found or access denied'; END IF;

  SELECT p.* INTO v_payment FROM public.debt_payments p
  WHERE p.id = p_payment_id AND p.debt_id = v_debt.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found or access denied'; END IF;

  IF p_action = 'duplicate' THEN
    IF v_payment.resolution_status <> 'normal' THEN
      RAISE EXCEPTION 'Only an unresolved payment can be marked as a duplicate';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.debt_payments p
      WHERE p.duplicate_of_payment_id = p_payment_id AND p.debt_id = v_debt.id
    ) THEN
      RAISE EXCEPTION 'This payment is already the original for another duplicate';
    END IF;
    IF p_duplicate_of_payment_id IS NULL OR p_duplicate_of_payment_id = p_payment_id THEN
      RAISE EXCEPTION 'Select the original payment for this duplicate';
    END IF;
    SELECT p.* INTO v_target FROM public.debt_payments p
    WHERE p.id = p_duplicate_of_payment_id AND p.debt_id = v_debt.id FOR UPDATE;
    IF NOT FOUND OR v_target.resolution_status = 'duplicate' THEN
      RAISE EXCEPTION 'Original payment not found or is itself a duplicate';
    END IF;
    UPDATE public.debt_payments
    SET duplicate_of_payment_id = p_duplicate_of_payment_id,
        resolution_status = 'duplicate'
    WHERE id = p_payment_id AND debt_id = v_debt.id;
  ELSE
    IF v_payment.resolution_status NOT IN ('normal', 'partially_refunded') THEN
      RAISE EXCEPTION 'This payment cannot receive another refund';
    END IF;
    IF p_refund_amount_minor IS NULL OR p_refund_amount_minor <= 0
      OR p_refund_amount_minor > v_payment.amount_minor - v_payment.refunded_amount_minor THEN
      RAISE EXCEPTION 'Refund amount must be positive and no greater than the unrefunded payment amount';
    END IF;
    UPDATE public.debt_payments
    SET refunded_amount_minor = refunded_amount_minor + p_refund_amount_minor,
        resolution_status = CASE
          WHEN refunded_amount_minor + p_refund_amount_minor >= amount_minor THEN 'refunded'
          ELSE 'partially_refunded'
        END
    WHERE id = p_payment_id AND debt_id = v_debt.id;
  END IF;

  UPDATE public.debts SET total_amount_minor = total_amount_minor,
    updated_at = NOW()
  WHERE id = v_debt.id AND user_id = v_user_id;

  RETURN QUERY
  SELECT p.id, p.resolution_status, p.refunded_amount_minor,
    p.applied_amount_minor, p.unapplied_amount_minor, d.remaining_amount_minor
  FROM public.debt_payments p JOIN public.debts d ON d.id = p.debt_id
  WHERE p.id = p_payment_id AND d.id = v_debt.id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_kredy_payment_issue(UUID, TEXT, BIGINT, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_kredy_payment_issue(UUID, TEXT, BIGINT, UUID)
  TO authenticated;