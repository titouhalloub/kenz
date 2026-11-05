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

After a valid Supabase sign-in, the app hydrates and syncs the profile, accounts, system/custom categories, transactions, monthly budgets, recurring items, savings goals, Kredy debts, and Kredy payment history. Debt and payment writes use the signed-in user's RLS session; local demo records with non-UUID identifiers are not uploaded. The browser keeps a per-user local cache, but automatic retry/reconciliation of edits made while offline is not complete yet; do not treat this as full offline sync.

The AI wallet, credit ledger, and usage history are loaded from Supabase. Authenticated AI responses are metered server-side through the `record_ai_usage` RPC, which derives the owner from `auth.uid()`, applies a row lock, and uses a server-generated idempotency key to prevent duplicate debits. The server reserves credits before invoking a managed provider and finalizes token metadata without a second debit. Its privileged implementation is kept in the non-exposed `private` schema; the public RPC wrapper is security-invoker and executable only by authenticated users. The client cannot grant itself purchased credits: credit top-ups remain disabled until a trusted payment provider and verified payment webhook are implemented.

Zakat settings and festive budgets now use authenticated, per-user local caches and RLS-protected Supabase tables. Authenticated users start with an empty Zakat asset record and no seeded demo festive budgets, preventing demo financial fixtures from being copied into a real account. A missing cloud record is represented locally as empty/default state until the user saves it.

Neighborhood document storage is still not fully integrated: the schema has metadata tables, but a private Storage bucket, upload/download workflow, and ownership tests remain. Offline retry/reconciliation and a real authenticated signup/data round-trip test are still required before production readiness.

The project database migrations are stored in `supabase/migrations`. The signup trigger and privileged AI metering implementation live in the non-exposed `private` schema; client roles cannot call the signup trigger directly.
