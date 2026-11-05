-- Preserve original Kredy payment events while allowing a payment to be
-- marked as a duplicate or partially/fully refunded.
ALTER TABLE public.debt_payments
  ADD COLUMN IF NOT EXISTS refunded_amount_minor BIGINT NOT NULL DEFAULT 0
    CHECK (refunded_amount_minor >= 0 AND refunded_amount_minor <= amount_minor),
  ADD COLUMN IF NOT EXISTS duplicate_of_payment_id UUID NULL
    REFERENCES public.debt_payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS resolution_status TEXT NOT NULL DEFAULT 'normal'
    CHECK (resolution_status IN ('normal', 'partially_refunded', 'refunded', 'duplicate'));

ALTER TABLE public.debt_payments
  DROP CONSTRAINT IF EXISTS debt_payments_no_self_duplicate;
ALTER TABLE public.debt_payments
  ADD CONSTRAINT debt_payments_no_self_duplicate
  CHECK (duplicate_of_payment_id IS NULL OR duplicate_of_payment_id <> id);

CREATE INDEX IF NOT EXISTS idx_debt_payments_duplicate_of
  ON public.debt_payments(duplicate_of_payment_id)
  WHERE duplicate_of_payment_id IS NOT NULL;

-- A payment's effective amount is the original amount less refunds, or zero
-- when the event is explicitly linked as a duplicate.
CREATE OR REPLACE FUNCTION public.recalculate_kredy_payment_allocations_after_debt_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_applied_total BIGINT;
  v_remaining BIGINT;
BEGIN
  WITH ranked AS (
    SELECT
      p.id,
      CASE WHEN p.resolution_status = 'duplicate' THEN 0
           ELSE GREATEST(p.amount_minor - p.refunded_amount_minor, 0) END AS effective_amount_minor,
      NEW.total_amount_minor AS debt_total_minor,
      COALESCE(
        SUM(CASE WHEN p.resolution_status = 'duplicate' THEN 0
                 ELSE GREATEST(p.amount_minor - p.refunded_amount_minor, 0) END)
        OVER (ORDER BY p.payment_date, p.created_at, p.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0
      ) AS prior_paid_minor
    FROM public.debt_payments p
    WHERE p.debt_id = NEW.id
  ),
  allocation AS (
    SELECT id,
      LEAST(effective_amount_minor, GREATEST(debt_total_minor - prior_paid_minor, 0)) AS applied_minor,
      effective_amount_minor - LEAST(effective_amount_minor, GREATEST(debt_total_minor - prior_paid_minor, 0)) AS unapplied_minor
    FROM ranked
  )
  UPDATE public.debt_payments p
  SET applied_amount_minor = a.applied_minor,
      unapplied_amount_minor = a.unapplied_minor,
      reconciliation_status = CASE
        WHEN a.unapplied_minor = 0 THEN 'applied'
        WHEN a.applied_minor > 0 THEN 'partial'
        ELSE 'pending'
      END
  FROM allocation a
  WHERE p.id = a.id;

  SELECT COALESCE(SUM(p.applied_amount_minor), 0)
  INTO v_applied_total
  FROM public.debt_payments p
  WHERE p.debt_id = NEW.id;

  v_remaining := GREATEST(NEW.total_amount_minor - v_applied_total, 0);

  UPDATE public.debts
  SET remaining_amount_minor = v_remaining,
      status = CASE
        WHEN v_remaining = 0 THEN 'settled'
        WHEN v_remaining < NEW.total_amount_minor THEN 'partially_paid'
        ELSE 'active'
      END
  WHERE id = NEW.id AND user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_kredy_payment_allocations_after_debt_write()
  FROM PUBLIC, anon, authenticated;

-- Replace the payment-ingest RPC so new offline events use net amounts too.
CREATE OR REPLACE FUNCTION public.record_kredy_payment(
  p_payment_id UUID,
  p_debt_id UUID,
  p_amount_minor BIGINT,
  p_payment_date DATE,
  p_created_at TIMESTAMPTZ DEFAULT NOW(),
  p_source_account_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  payment_id UUID,
  applied_amount_minor BIGINT,
  unapplied_amount_minor BIGINT,
  reconciliation_status TEXT,
  remaining_amount_minor BIGINT
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_debt public.debts%ROWTYPE;
  v_existing_debt_id UUID;
  v_remaining BIGINT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
  IF p_payment_date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
  IF p_source_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts a WHERE a.id = p_source_account_id AND a.user_id = v_user_id
  ) THEN RAISE EXCEPTION 'Source account not found or access denied'; END IF;

  SELECT d.* INTO v_debt FROM public.debts d
  WHERE d.id = p_debt_id AND d.user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debt not found or access denied'; END IF;

  SELECT p.debt_id INTO v_existing_debt_id FROM public.debt_payments p WHERE p.id = p_payment_id;
  IF v_existing_debt_id IS NOT NULL THEN
    IF v_existing_debt_id <> p_debt_id THEN RAISE EXCEPTION 'Payment ID already belongs to another debt'; END IF;
  ELSE
    INSERT INTO public.debt_payments (
      id, debt_id, amount_minor, payment_date, source_account_id, notes, created_at
    ) VALUES (
      p_payment_id, p_debt_id, p_amount_minor, p_payment_date,
      p_source_account_id, p_notes, COALESCE(p_created_at, NOW())
    );
  END IF;

  WITH ranked AS (
    SELECT p.id,
      CASE WHEN p.resolution_status = 'duplicate' THEN 0
           ELSE GREATEST(p.amount_minor - p.refunded_amount_minor, 0) END AS effective_amount_minor,
      COALESCE(
        SUM(CASE WHEN p.resolution_status = 'duplicate' THEN 0
                 ELSE GREATEST(p.amount_minor - p.refunded_amount_minor, 0) END)
        OVER (ORDER BY p.payment_date, p.created_at, p.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0
      ) AS prior_paid_minor
    FROM public.debt_payments p WHERE p.debt_id = p_debt_id
  ),
  allocation AS (
    SELECT id,
      LEAST(effective_amount_minor, GREATEST(v_debt.total_amount_minor - prior_paid_minor, 0)) AS applied_minor,
      effective_amount_minor - LEAST(effective_amount_minor, GREATEST(v_debt.total_amount_minor - prior_paid_minor, 0)) AS unapplied_minor
    FROM ranked
  )
  UPDATE public.debt_payments p
  SET applied_amount_minor = a.applied_minor,
      unapplied_amount_minor = a.unapplied_minor,
      reconciliation_status = CASE
        WHEN a.unapplied_minor = 0 THEN 'applied'
        WHEN a.applied_minor > 0 THEN 'partial'
        ELSE 'pending'
      END
  FROM allocation a WHERE p.id = a.id;

  SELECT COALESCE(SUM(p.applied_amount_minor), 0) INTO v_remaining
  FROM public.debt_payments p WHERE p.debt_id = p_debt_id;
  v_remaining := GREATEST(v_debt.total_amount_minor - v_remaining, 0);

  UPDATE public.debts SET remaining_amount_minor = v_remaining,
    status = CASE WHEN v_remaining = 0 THEN 'settled'
      WHEN v_remaining < v_debt.total_amount_minor THEN 'partially_paid' ELSE 'active' END,
    updated_at = NOW()
  WHERE id = p_debt_id AND user_id = v_user_id;

  RETURN QUERY SELECT p.id, p.applied_amount_minor, p.unapplied_amount_minor,
    p.reconciliation_status, v_remaining
  FROM public.debt_payments p WHERE p.id = p_payment_id AND p.debt_id = p_debt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_kredy_payment(UUID, UUID, BIGINT, DATE, TIMESTAMPTZ, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_kredy_payment(UUID, UUID, BIGINT, DATE, TIMESTAMPTZ, UUID, TEXT)
  TO authenticated;

-- Explicit, owner-scoped and row-locked resolution. The event's original
-- amount/date/notes are never changed or deleted.
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
  IF p_action NOT IN ('duplicate', 'refund') THEN RAISE EXCEPTION 'Unsupported payment resolution action'; END IF;

  SELECT d.* INTO v_debt
  FROM public.debts d JOIN public.debt_payments p ON p.debt_id = d.id
  WHERE p.id = p_payment_id AND d.user_id = v_user_id
  FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found or access denied'; END IF;

  SELECT p.* INTO v_payment FROM public.debt_payments p
  WHERE p.id = p_payment_id AND p.debt_id = v_debt.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found or access denied'; END IF;

  IF v_payment.resolution_status <> 'normal' THEN
    RAISE EXCEPTION 'This payment has already been resolved';
  END IF;

  IF p_action = 'duplicate' THEN
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

  -- Fire the same allocation trigger atomically, without changing debt principal.
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