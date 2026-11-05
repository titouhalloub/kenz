# Supabase setup for Kenz

Kenz is configured to use the connected Supabase project through the browser-safe Publishable API key.

## Local development

1. Copy `.env.example` to `.env`.
2. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set to the Kenz project URL and its **Publishable** key.
3. Never add a `service_role` key or a Supabase Secret key to a `VITE_*` variable or the browser bundle.
4. Restart the Vite/Node development server after changing environment variables.

## Deployment

Set the same project URL and Publishable key in the hosting provider's build and runtime environment:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The AI gateway also reads the non-prefixed server aliases `SUPABASE_URL` and `SUPABASE_ANON_KEY`; set those on the server runtime when the platform does not preserve build variables.

## Current cloud sync scope

After a valid Supabase sign-in, the app hydrates and syncs the profile, accounts, system/custom categories, transactions, monthly budgets, recurring items, savings goals, Kredy debts, and Kredy payment history. Debt and payment writes use the signed-in user's RLS session; local demo records with non-UUID identifiers are not uploaded. The browser keeps a per-user local cache. Budget/profile/account/category/transaction/recurring-item/savings-goal changes now write a durable, per-user latest-snapshot outbox to localStorage before attempting cloud sync. The outbox is replayed after authenticated startup (before cloud hydration) and when connectivity returns; successful idempotent upserts clear only the exact snapshot that was sent. Failed requests remain queued across app restarts. This is an initial durable retry layer, not a complete operation log: deletions are not yet represented as durable tombstones, multiple-device conflict resolution is not implemented, and localStorage can be cleared by the user or browser.

Kredy has a durable, per-user outbox. Debt snapshots and delete markers are persisted before network requests, replayed before authenticated cloud hydration, and retried when connectivity returns. Migrations `016_kredy_sync_tombstones.sql`, `017_kredy_payment_reconciliation.sql`, and `018_kredy_balance_recalculation_trigger.sql` are applied to the connected Supabase project. Migration 016 adds owner-scoped deletion tombstones and enables Realtime for debts, payments, and tombstones. Concurrent payment events are merged by unique payment ID and allocated atomically under a debt-row lock in a stable chronological order. The database preserves each original payment amount, records the amount applied to the debt separately from any unapplied remainder, and recalculates balances when stale device snapshots arrive. Debt details continue to use `updated_at` last-write-wins. The Kredy ledger displays unapplied amounts with a reconciliation warning; a user must verify the payment with the counterparty before changing the underlying debt or treating the unapplied amount as resolved.

The AI wallet, credit ledger, and usage history are loaded from Supabase. Authenticated AI responses are metered server-side through the `record_ai_usage` RPC, which derives the owner from `auth.uid()`, applies a row lock, and uses a server-generated idempotency key to prevent duplicate debits. The server reserves credits before invoking a managed provider and finalizes token metadata without a second debit. Its privileged implementation is kept in the non-exposed `private` schema; the public RPC wrapper is security-invoker and executable only by authenticated users. The client cannot grant itself purchased credits: credit top-ups remain disabled pending legal/business readiness review, a trusted payment provider, and verified payment webhooks.

Zakat settings and festive budgets now use authenticated, per-user local caches and RLS-protected Supabase tables. Authenticated users start with an empty Zakat asset record and no seeded demo festive budgets, preventing demo financial fixtures from being copied into a real account. A missing cloud record is represented locally as empty/default state until the user saves it.

Neighborhood document uploads are intentionally out of scope: Kenz must not collect or retain merchants' identity documents. The preferred direction is to evaluate a TrustedIn Portable Verified Identity integration, subject to the provider's official technical documentation, availability, consent model, and security review. Until then, do not build a document upload flow or claim identity verification. Store only the minimum verification result/reference if a supported integration is later approved.

Zakat and festive-budget writes still use best-effort retries from current in-memory state while the app is open; their durable outboxes are deferred. The budget outbox does not yet include durable delete tombstones or cross-device conflict resolution. A real authenticated signup/data round-trip test is still required before production readiness.

The project database migrations are stored in `supabase/migrations`. The signup trigger and privileged AI metering implementation live in the non-exposed `private` schema; client roles cannot call the signup trigger directly.
