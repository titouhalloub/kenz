# Kenz Product Expansion Roadmap

This roadmap tracks the eight approved product enhancements. Implement in small, testable phases and preserve existing user data and flows.

## Delivery principles

- Work on `feat/kenz-expansion`; do not push feature work directly to `main`.
- Keep existing functionality working while introducing each capability behind clear routes/components and safe defaults.
- Add database migrations with appropriate Row Level Security (RLS) for all user-owned data.
- Never expose service-role keys or provider secrets in the client.
- Add unit tests for financial calculations and integration tests for persistence/sync before release.
- Treat financial guidance as educational support, not a guarantee or regulated financial advice.

## Phase 0 — Reliability and security foundations

- Fix and test safe-to-spend calculations, including already-paid recurring expenses, date boundaries, future-dated transactions, and savings contributions.
- Review Supabase authentication, authorization, and RLS policies.
- Harden the AI server routes with authentication, request validation, rate limits, and SSRF-safe provider URL handling.
- Establish shared date, currency, localization, and error-handling utilities.

## Phase 1 — Core personal finance improvements

1. **Savings Challenges** — user-defined goals, target amounts/dates, contributions, progress, and completion states.
2. **Smart Bill Reminders** — recurring bill schedules, due dates, notification preferences, and paid/overdue states.
3. **Advanced Financial Reports** — date-range summaries, category trends, month comparisons, and exportable reports.

## Phase 2 — Convenience and access

4. **Offline Mode and Sync** — local transaction queue, conflict handling, retry states, and clear sync status.
5. **Receipt Scanner** — opt-in image capture/import, OCR extraction preview, user confirmation before creating a transaction, and safe image retention/deletion.
6. **Arabic/French Experience** — complete translations, RTL layout, locale-aware dates/numbers, and Algerian DZD formatting.

## Phase 3 — Connected experiences

7. **Shared Wallets** — invite-based membership, roles/permissions, shared expense records, and transparent contribution/split calculations.
8. **Smart Financial Coach** — consent-based insights over the user's own financial data, explainable calculations, configurable AI provider, and privacy controls.

## Definition of done

- Database schema and RLS reviewed for every persisted feature.
- Loading, empty, error, and offline states implemented.
- Mobile layouts checked.
- Tests added for core business logic and access boundaries.
- Existing features manually regression-tested.
- No feature is described as production-ready until the required tests and deployment configuration are verified.
