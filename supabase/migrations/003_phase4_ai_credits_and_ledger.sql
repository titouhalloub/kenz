-- Supabase PostgreSQL Migration: Phase 4 Managed AI Credits, Ledger & Usage
-- Primary backend schema for AI credit accounting and usage auditing

-- 1. AI Credit Wallets Table
CREATE TABLE IF NOT EXISTS public.ai_credit_wallets (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_credits BIGINT NOT NULL DEFAULT 500 CHECK (balance_credits >= 0),
  lifetime_credits_used BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Usage Events Table
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('managed', 'byok')),
  provider TEXT NOT NULL DEFAULT 'google_gemini',
  model TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
  prompt_summary TEXT,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  credits_debited BIGINT NOT NULL DEFAULT 0,
  purpose TEXT NOT NULL, -- e.g. 'explain_budget', 'spending_leak_detector', 'categorize'
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON public.ai_usage_events(user_id, created_at DESC);

-- 3. Credit Ledger Entries Table (Audit trail of every balance mutation)
CREATE TABLE IF NOT EXISTS public.credit_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('grant', 'purchase', 'usage_debit', 'refund')),
  credits_delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  reference_id TEXT,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON public.credit_ledger_entries(user_id, created_at DESC);

-- RLS Security Policies
ALTER TABLE public.ai_credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger_entries ENABLE ROW LEVEL SECURITY;

-- Users can only read their own wallet & ledger entries; mutations require server-side execution
DROP POLICY IF EXISTS "Users can read own credit wallet" ON public.ai_credit_wallets;
CREATE POLICY "Users can read own credit wallet" ON public.ai_credit_wallets FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own AI usage events" ON public.ai_usage_events;
CREATE POLICY "Users can read own AI usage events" ON public.ai_usage_events FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own credit ledger" ON public.credit_ledger_entries;
CREATE POLICY "Users can read own credit ledger" ON public.credit_ledger_entries FOR SELECT USING (auth.uid() = user_id);
