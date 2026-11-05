-- Keep debt balances correct even when an offline device syncs a stale
-- snapshot of remaining_amount_minor/status after another device recorded a payment.
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
      p.amount_minor,
      NEW.total_amount_minor AS debt_total_minor,
      COALESCE(
        SUM(p.amount_minor) OVER (
          ORDER BY p.payment_date, p.created_at, p.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0
      ) AS prior_paid_minor
    FROM public.debt_payments p
    WHERE p.debt_id = NEW.id
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
  INTO v_applied_total
  FROM public.debt_payments p
  WHERE p.debt_id = NEW.id;

  v_remaining := GREATEST(NEW.total_amount_minor - v_applied_total, 0);

  UPDATE public.debts
  SET
    remaining_amount_minor = v_remaining,
    status = CASE
      WHEN v_remaining = 0 THEN 'settled'
      WHEN v_remaining < NEW.total_amount_minor THEN 'partially_paid'
      ELSE 'active'
    END
  WHERE id = NEW.id AND user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_kredy_payment_allocations_after_debt_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS debts_recalculate_kredy_payments ON public.debts;
CREATE TRIGGER debts_recalculate_kredy_payments
AFTER INSERT OR UPDATE OF total_amount_minor ON public.debts
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_kredy_payment_allocations_after_debt_write();
