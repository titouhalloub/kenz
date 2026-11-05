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

After a valid Supabase sign-in, the app hydrates and syncs the profile, accounts, system/custom categories, transactions, monthly budgets, recurring items, and savings goals. The browser keeps a local cache, but automatic retry/reconciliation of edits made while offline is not complete yet; do not treat this as full offline sync. Other areas (Kredy payments, neighborhood document storage, Zakat/festive budgets, and AI credit debits) still need dedicated authenticated cloud-sync workflows before they should be treated as fully cloud-backed.

The project database migrations are stored in `supabase/migrations`. The signup trigger lives in the non-exposed `private` schema; client roles cannot call it directly.
