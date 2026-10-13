-- Supabase PostgreSQL Migration: Phase 1 Budget MVP
-- Primary backend schema for Kenz Personal Finance

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
DO $$ BEGIN
  CREATE TYPE public.transaction_type AS ENUM ('income', 'expense', 'transfer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.account_type AS ENUM ('cash', 'bank', 'savings', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.commitment_frequency AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.goal_status AS ENUM ('active', 'achieved', 'paused', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  preferred_currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
  locale VARCHAR(5) NOT NULL DEFAULT 'fr',
  payday_day_of_month SMALLINT CHECK (payday_day_of_month BETWEEN 1 AND 31),
  planning_period_days SMALLINT DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Accounts Table
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.account_type NOT NULL DEFAULT 'cash',
  currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
  initial_balance_minor BIGINT NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  is_income BOOLEAN NOT NULL DEFAULT FALSE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  type public.transaction_type NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  destination_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  linked_transfer_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  description TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transfer_destination_check CHECK (
    (type = 'transfer' AND destination_account_id IS NOT NULL AND destination_account_id <> account_id)
    OR (type <> 'transfer' AND destination_account_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency ON public.transactions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, transaction_date DESC);

-- 5. Budgets Table
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  month_year DATE NOT NULL,
  budget_minor BIGINT NOT NULL CHECK (budget_minor >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category_id, month_year)
);

-- 6. Recurring Commitments Table
CREATE TABLE IF NOT EXISTS public.recurring_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.transaction_type NOT NULL CHECK (type IN ('income', 'expense')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
  frequency public.commitment_frequency NOT NULL DEFAULT 'monthly',
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  next_due_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Savings Goals Table
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount_minor BIGINT NOT NULL CHECK (target_amount_minor > 0),
  current_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (current_amount_minor >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
  target_date DATE,
  planned_monthly_contribution_minor BIGINT NOT NULL DEFAULT 0,
  status public.goal_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security (RLS) Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Accounts Policies
DROP POLICY IF EXISTS "Users can manage own accounts" ON public.accounts;
CREATE POLICY "Users can manage own accounts" ON public.accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Categories Policies
DROP POLICY IF EXISTS "Users can read system or own categories" ON public.categories;
CREATE POLICY "Users can read system or own categories" ON public.categories FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own custom categories" ON public.categories;
CREATE POLICY "Users can manage own custom categories" ON public.categories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Transactions Policies
DROP POLICY IF EXISTS "Users can manage own transactions" ON public.transactions;
CREATE POLICY "Users can manage own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Budgets Policies
DROP POLICY IF EXISTS "Users can manage own budgets" ON public.budgets;
CREATE POLICY "Users can manage own budgets" ON public.budgets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Recurring Commitments Policies
DROP POLICY IF EXISTS "Users can manage own recurring items" ON public.recurring_items;
CREATE POLICY "Users can manage own recurring items" ON public.recurring_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Savings Goals Policies
DROP POLICY IF EXISTS "Users can manage own savings goals" ON public.savings_goals;
CREATE POLICY "Users can manage own savings goals" ON public.savings_goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
