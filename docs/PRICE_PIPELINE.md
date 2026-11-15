# Kenz price engine — architecture and Phase 3 audit

Status: code written, **not run, not tested, no migration applied**. Everything below builds on the existing
tables (`price_sources`, `price_observations`, `price_stats`, `ingest_runs`, `price_observation_reviews`)
and RPCs from migrations 036–044. Migration `057_price_stats_windows.sql` is a **draft for approval**.

## One pipeline, three input channels

| Channel | Entry point | Becomes |
|---|---|---|
| Official sources | `workers/price-ingest/run.ts` (existing adapters: MADR bulletin PDF, DCW Tizi Ouzou, DCW Jijel) | `pending` row, flags `public_scrape` |
| Admin / manual | Settings → "Revue des prix" → "Ajouter des prix" (single entry or CSV) → RPC `admin_stage_price_observation`; or CLI `workers/price-ingest/import.ts --file x.csv` | `pending` row, flags `admin_import`, source reference required |
| Community | Community → "Partager un prix payé" → RPC `submit_price_observation` (opt-in consent, 10/day, one per product/day, optional https evidence) | `pending` row, flags `crowd_contribution`, `outside_reference_range`, `has_evidence` |

Shared validation: `src/domain/priceValidation.ts` (product id, wilaya, date, unit conversion g→kg / ml→l with
dimension-mismatch refusal, https references, duplicate and outlier flags). Workers stage through
`workers/price-ingest/stage.ts`; the SQL RPCs apply the equivalent rules. **No channel can write `accepted`.**

## Review and publication
1. Moderator (row in `community_moderators`) opens Settings → "Revue des prix du marché".
2. Tabs: En attente / Vérifiés / Rejetés. Each row shows source (type), wilaya or national, price per kg/l/unit,
   observation date and age, flags, evidence link, and (once decided) the recorded reason.
3. Accept/Reject requires a reason (stored in `price_observation_reviews`). Accepting an observation older than the
   extended window is refused (it could never be published).
4. `review_price_observation` → `refresh_price_stats_all()` rebuilds `price_stats` from **accepted** observations of
   enabled + reviewed sources only (national / wilaya / commune; neighborhood needs 3 contributors).
5. Ingestion and imports also call `refresh_price_stats_all()` so aggregates that aged out disappear.

Labels: **pending**, **verified** (= accepted, within window), **rejected**, **expired** (derived: older than the
extended window), **manual estimate** (a price a user typed in the simulator: `origin: 'manual'`, never stored as an
observation, never counted as verified: `isVerifiedMarketPrice`).

## Windows (configurable)
`price_engine_settings` (fresh 14 days, extended 30 days, bounds 1 ≤ fresh < extended ≤ 90) → `get_price_windows()`.
The app asks for the fresh window first and falls back to the extended window per product; `last_observed` always
travels with the price. Defaults live in `src/domain/priceWindow.ts` when the migration is absent.

## Simulation reads published data only
`priceStore.loadMarketPrices` → `get_area_prices` (reads `price_stats`; wilaya first, national fallback; area level,
`n_observations`, `source_tiers`, `last_observed`). No scraping or external HTTP during a simulation; the existing
offline cache and fallback to typed prices are unchanged. Missing data stays missing.

## Why "30 pending, 0 published" (root causes)
- Nothing publishes by design: acceptance is a human step, and the review screen was buried.
- The daily job never ran: GitHub only runs `schedule` from the default branch (`main`); the workflow is on a feature
  branch (there, `push` only does a dry run). Only one manual dispatch wrote data (Nov 7).
- Window mismatch: 14-day window and refresh-only-at-review; staged rows from Nov 4 stop counting on Nov 18.

## Scheduler recommendation (not applied)
- **Cleanest:** a Render Cron Job (weekly) running `npx tsx workers/price-ingest/run.ts` from a small worker image
  with Node 22, `poppler-utils` (PDF text) and the env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. It runs
  independently of the web service, is not tied to the default branch, and logs in the same dashboard as the app.
  Requires you to create the cron job (changes Render settings).
- **Alternative (free):** put `.github/workflows/ingest-public-prices.yml` on `main` through a pull request
  (schedule is now weekly). Caveat: GitHub pauses scheduled workflows after 60 days without repository activity.
- Either way `workflow_dispatch` / running the command by hand triggers a collection at any time.

## Needs your approval
1. Apply migration 057 (settings, windows RPCs, `admin_import` source type + disabled source, evidence column,
   `submit_price_observation` with optional evidence, `admin_stage_price_observation`, `list_price_observations`,
   review refresh + expiry guard).
2. Enable the `admin-manual-import` source after your own review (`review.ts`); add moderator rows.
3. Choose and create the scheduler (Render Cron or workflow on `main`).
4. Accept/reject the 30 pending observations yourself.

## Not covered / risks
- Community evidence is an https link only (no file upload/storage yet).
- Official parsers are unverified against live pages; the Nov 7 run staged only 30 rows from 3 sources.
- Reference-range flags need accepted data first; until then outliers cannot be flagged.
- Nothing here has been executed: tests (`priceValidation.test.ts`) are written but unrun.
