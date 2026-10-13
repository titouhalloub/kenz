-- Supabase PostgreSQL Migration: Phase 5 Neighborhood Debt & Credit Ledger ("Carnet Kredy") & Financial Health
-- Connects personal liquidity with neighborhood merchant tabs and informal credit

-- 1. Debts Table ("Carnet Kredy")
CREATE TABLE IF NOT EXISTS public.debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  counterparty_name TEXT NOT NULL,
  counterparty_phone TEXT,
  type TEXT NOT NULL CHECK (type IN ('payable', 'receivable')),
  total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor > 0),
  remaining_amount_minor BIGINT NOT NULL CHECK (remaining_amount_minor >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
  due_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partially_paid', 'settled', 'overdue')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debts_user_status ON public.debts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_debts_business ON public.debts(business_id);

-- 2. Debt Payments Table (Repayments & partial installments)
CREATE TABLE IF NOT EXISTS public.debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON public.debt_payments(debt_id);

-- 3. Financial Snapshots & Health Score History
CREATE TABLE IF NOT EXISTS public.financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  grade VARCHAR(2) NOT NULL,
  debt_to_income_pct NUMERIC(5,2),
  savings_rate_pct NUMERIC(5,2),
  safe_to_spend_minor BIGINT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_user ON public.financial_snapshots(user_id, recorded_at DESC);

-- RLS Security Policies
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own debts" ON public.debts;
CREATE POLICY "Users can manage own debts" ON public.debts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage payments for own debts" ON public.debt_payments;
CREATE POLICY "Users can manage payments for own debts" ON public.debt_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.debts d
      WHERE d.id = debt_payments.debt_id AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.debts d
      WHERE d.id = debt_payments.debt_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own snapshots" ON public.financial_snapshots;
CREATE POLICY "Users can view own snapshots" ON public.financial_snapshots
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
