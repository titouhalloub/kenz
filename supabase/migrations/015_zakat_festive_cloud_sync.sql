-- Phase 15: authenticated cloud persistence for Zakat settings and festive budgets.
CREATE TABLE public.zakat_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nisab_threshold_minor BIGINT NOT NULL DEFAULT 95000000 CHECK (nisab_threshold_minor >= 0),
  gold_price_per_gram_minor BIGINT NOT NULL DEFAULT 1150000 CHECK (gold_price_per_gram_minor >= 0),
  custom_cash_minor BIGINT NOT NULL DEFAULT 0 CHECK (custom_cash_minor >= 0),
  custom_savings_minor BIGINT NOT NULL DEFAULT 0 CHECK (custom_savings_minor >= 0),
  custom_business_goods_minor BIGINT NOT NULL DEFAULT 0 CHECK (custom_business_goods_minor >= 0),
  custom_liabilities_minor BIGINT NOT NULL DEFAULT 0 CHECK (custom_liabilities_minor >= 0),
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_date DATE,
  paid_amount_minor BIGINT CHECK (paid_amount_minor IS NULL OR paid_amount_minor >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.festive_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  festival_type TEXT NOT NULL CHECK (festival_type IN ('ramadan', 'aid_adha', 'aid_fitr')),
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  target_budget_minor BIGINT NOT NULL CHECK (target_budget_minor >= 0),
  actual_spent_minor BIGINT NOT NULL DEFAULT 0 CHECK (actual_spent_minor >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
  notes TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, festival_type, year)
);

CREATE INDEX idx_festive_budgets_user_year ON public.festive_budgets(user_id, year DESC);

ALTER TABLE public.zakat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festive_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own Zakat settings"
  ON public.zakat_settings FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users manage own festive budgets"
  ON public.festive_budgets FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zakat_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.festive_budgets TO authenticated;
REVOKE ALL ON public.zakat_settings FROM anon;
REVOKE ALL ON public.festive_budgets FROM anon;
