-- Avoid per-row auth.uid() evaluation in RLS predicates.
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING ((SELECT auth.uid()) = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can manage own accounts" ON public.accounts;
CREATE POLICY "Users can manage own accounts" ON public.accounts FOR ALL USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can read system or own categories" ON public.categories;
CREATE POLICY "Users can read system or own categories" ON public.categories FOR SELECT USING (user_id IS NULL OR (SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can manage own custom categories" ON public.categories;
CREATE POLICY "Users can insert own custom categories" ON public.categories FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own custom categories" ON public.categories FOR UPDATE USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete own custom categories" ON public.categories FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own transactions" ON public.transactions;
CREATE POLICY "Users can manage own transactions" ON public.transactions FOR ALL USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can manage own budgets" ON public.budgets;
CREATE POLICY "Users can manage own budgets" ON public.budgets FOR ALL USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can manage own recurring items" ON public.recurring_items;
CREATE POLICY "Users can manage own recurring items" ON public.recurring_items FOR ALL USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can manage own savings goals" ON public.savings_goals;
CREATE POLICY "Users can manage own savings goals" ON public.savings_goals FOR ALL USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Public can view published businesses" ON public.businesses;
CREATE POLICY "Public can view published businesses" ON public.businesses FOR SELECT USING (is_published = TRUE OR (SELECT auth.uid()) = owner_id);
DROP POLICY IF EXISTS "Owners can update own business" ON public.businesses;
CREATE POLICY "Owners can update own business" ON public.businesses FOR UPDATE USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id);
DROP POLICY IF EXISTS "Owners can register a business" ON public.businesses;
CREATE POLICY "Owners can register a business" ON public.businesses FOR INSERT WITH CHECK ((SELECT auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Owners can insert verification documents" ON public.business_documents;
CREATE POLICY "Owners can insert verification documents" ON public.business_documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.businesses WHERE businesses.id = business_documents.business_id AND businesses.owner_id = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS "Owners can view own document metadata" ON public.business_documents;
CREATE POLICY "Owners can view own document metadata" ON public.business_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.businesses WHERE businesses.id = business_documents.business_id AND businesses.owner_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Users can read own credit wallet" ON public.ai_credit_wallets;
CREATE POLICY "Users can read own credit wallet" ON public.ai_credit_wallets FOR SELECT USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can read own AI usage events" ON public.ai_usage_events;
CREATE POLICY "Users can read own AI usage events" ON public.ai_usage_events FOR SELECT USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can read own credit ledger" ON public.credit_ledger_entries;
CREATE POLICY "Users can read own credit ledger" ON public.credit_ledger_entries FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own debts" ON public.debts;
CREATE POLICY "Users can manage own debts" ON public.debts FOR ALL USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can manage payments for own debts" ON public.debt_payments;
CREATE POLICY "Users can manage payments for own debts" ON public.debt_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.debts d WHERE d.id = debt_payments.debt_id AND d.user_id = (SELECT auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.debts d WHERE d.id = debt_payments.debt_id AND d.user_id = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS "Users can view own snapshots" ON public.financial_snapshots;
CREATE POLICY "Users can view own snapshots" ON public.financial_snapshots FOR ALL USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- No client-facing policy is created for verification_reviews until a trusted moderation workflow exists.
