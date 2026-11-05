-- Link a transaction to the recurring commitment it settles.
-- The composite foreign key prevents cross-user links while allowing the
-- recurring item to be deleted without deleting its historical transactions.
ALTER TABLE public.recurring_items
  ADD CONSTRAINT recurring_items_id_user_id_unique UNIQUE (id, user_id);

ALTER TABLE public.transactions
  ADD COLUMN recurring_item_id UUID;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_recurring_item_owner_fkey
  FOREIGN KEY (recurring_item_id, user_id)
  REFERENCES public.recurring_items (id, user_id)
  ON DELETE SET NULL (recurring_item_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user_recurring_item
  ON public.transactions (user_id, recurring_item_id)
  WHERE recurring_item_id IS NOT NULL;
