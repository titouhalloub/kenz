-- Deterministic allocation of concurrent/offline Kredy payments.
-- Keep every payment event, but explicitly separate the portion that settles
-- the debt from any amount that needs human reconciliation.
ALTER TABLE public.debt_payments
  ADD COLUMN IF NOT EXISTS applied_amount_minor BIGINT NOT NULL DEFAULT 0
    CHECK (applied_amount_minor >= 0),
  ADD COLUMN IF NOT EXISTS unapplied_amount_minor BIGINT NOT NULL DEFAULT 0
    CHECK (unapplied_amount_minor >= 0),
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('applied', 'partial', 'pending'));

-- Reallocate existing events in a stable order without deleting or changing
-- their original amounts. Older payments consume the debt balance first.
WITH ranked AS (
  SELECT
    p.id,
    p.amount_minor,
    d.total_amount_minor,
    COALESCE(
      SUM(p.amount_minor) OVER (
        PARTITION BY p.debt_id
        ORDER BY p.payment_date, p.created_at, p.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0
    ) AS prior_paid_minor
  FROM public.debt_payments p
  JOIN public.debts d ON d.id = p.debt_id
),
allocation AS (
  SELECT
    id,
    LEAST(amount_minor, GREATEST(total_amount_minor - prior_paid_minor, 0)) AS applied_minor,
    amount_minor - LEAST(amount_minor, GREATEST(total_amount_minor - prior_paid_minor, 0)) AS unapplied_minor
  FROM ranked
)
UPDATE public.debt_payments p
SET
  applied_amount_minor = a.applied_minor,
  unapplied_amount_minor = a.unapplied_minor,
  reconciliation_status = CASE
    WHEN a.unapplied_minor = 0 THEN 'applied'
    WHEN a.applied_minor > 0 THEN 'partial'
    ELSE 'pending'
  END
FROM allocation a
WHERE p.id = a.id;

UPDATE public.debts d
SET
  remaining_amount_minor = GREATEST(
    d.total_amount_minor - COALESCE((
      SELECT SUM(p.applied_amount_minor)
      FROM public.debt_payments p
      WHERE p.debt_id = d.id
    ), 0), 0
  ),
  status = CASE
    WHEN COALESCE((
      SELECT SUM(p.applied_amount_minor)
      FROM public.debt_payments p
      WHERE p.debt_id = d.id
    ), 0) >= d.total_amount_minor THEN 'settled'
    WHEN COALESCE((
      SELECT SUM(p.applied_amount_minor)
      FROM public.debt_payments p
      WHERE p.debt_id = d.id
    ), 0) > 0 THEN 'partially_paid'
    ELSE 'active'
  END;

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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT d.* INTO v_debt
  FROM public.debts d
  WHERE d.id = p_debt_id AND d.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debt not found or access denied';
  END IF;

  SELECT p.debt_id INTO v_existing_debt_id
  FROM public.debt_payments p
  WHERE p.id = p_payment_id;

  IF v_existing_debt_id IS NOT NULL THEN
    IF v_existing_debt_id <> p_debt_id THEN
      RAISE EXCEPTION 'Payment ID already belongs to another debt';
    END IF;
  ELSE
    INSERT INTO public.debt_payments (
      id, debt_id, amount_minor, payment_date, source_account_id, notes, created_at
    ) VALUES (
      p_payment_id, p_debt_id, p_amount_minor, p_payment_date,
      p_source_account_id, p_notes, COALESCE(p_created_at, NOW())
    );
  END IF;

  -- Recompute all allocations after taking the debt row lock. This makes
  -- the result independent of which offline device reconnects first.
  WITH ranked AS (
    SELECT
      p.id,
      p.amount_minor,
      v_debt.total_amount_minor AS debt_total_minor,
      COALESCE(
        SUM(p.amount_minor) OVER (
          ORDER BY p.payment_date, p.created_at, p.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0
      ) AS prior_paid_minor
    FROM public.debt_payments p
    WHERE p.debt_id = p_debt_id
  ),
  allocation AS (
    SELECT
      id,
      LEAST(amount_minor, GREATEST(debt_total_minor - prior_paid_minor, 0)) AS applied_minor,
      amount_minor - LEAST(amount_minor, GREATEST(debt_total_minor - prior_paid_minor, 0)) AS unapplied_minor
    FROM ranked
  )
  UPDATE public.debt_payments p
  SET
    applied_amount_minor = a.applied_minor,
    unapplied_amount_minor = a.unapplied_minor,
    reconciliation_status = CASE
      WHEN a.unapplied_minor = 0 THEN 'applied'
      WHEN a.applied_minor > 0 THEN 'partial'
      ELSE 'pending'
    END
  FROM allocation a
  WHERE p.id = a.id;

  SELECT COALESCE(SUM(p.applied_amount_minor), 0)
  INTO v_remaining
  FROM public.debt_payments p
  WHERE p.debt_id = p_debt_id;

  v_remaining := GREATEST(v_debt.total_amount_minor - v_remaining, 0);

  UPDATE public.debts
  SET
    remaining_amount_minor = v_remaining,
    status = CASE
      WHEN v_remaining = 0 THEN 'settled'
      WHEN v_remaining < v_debt.total_amount_minor THEN 'partially_paid'
      ELSE 'active'
    END,
    updated_at = NOW()
  WHERE id = p_debt_id AND user_id = v_user_id;

  RETURN QUERY
  SELECT
    p.id,
    p.applied_amount_minor,
    p.unapplied_amount_minor,
    p.reconciliation_status,
    v_remaining
  FROM public.debt_payments p
  WHERE p.id = p_payment_id AND p.debt_id = p_debt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_kredy_payment(UUID, UUID, BIGINT, DATE, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_kredy_payment(UUID, UUID, BIGINT, DATE, TIMESTAMPTZ, UUID, TEXT) TO authenticated;
