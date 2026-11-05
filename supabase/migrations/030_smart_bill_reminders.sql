-- Point 3: Smart Bill Reminders
-- Reminder preferences and payment account association live with recurring items,
-- so the existing snapshot sync and conflict-resolution path keeps them cross-device.
ALTER TABLE public.recurring_items
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_day_of_month smallint,
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_days_before smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_items_billing_day_check') THEN
    ALTER TABLE public.recurring_items ADD CONSTRAINT recurring_items_billing_day_check
      CHECK (billing_day_of_month IS NULL OR billing_day_of_month BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_items_reminder_days_check') THEN
    ALTER TABLE public.recurring_items ADD CONSTRAINT recurring_items_reminder_days_check
      CHECK (reminder_days_before BETWEEN 0 AND 30);
  END IF;
END;
$$;
