# Kenz Phase 4 Plan — Local Price Intelligence, Monthly Budget Simulator, Community Channel

Status: in progress. Working branch: `feat/price-simulator-community`; changes remain isolated from `main` until reviewed and merged.
Stack facts this plan builds on: Vite + React 19 + TS, Tailwind 4, Express `server.ts` (AI gateway only), Supabase (Postgres + RLS, migrations 001–035), Capacitor Android, Vitest, CI = `tsc --noEmit` + `vitest` + `vite build`.

## 0. Implementation status — 2026-11-07

- Work is isolated on `feat/price-simulator-community`; no changes from this phase have been merged into `main`.
- Migrations 036–043 are branch-only and **have not been applied to the production Supabase project**. No paid Supabase branch, paid API, or paid hosting was added. The Android APK workflow is manual-only and **no APK was built during this continuation**.
- The canonical product catalog and aliases are aligned between the app and database migrations. No market prices are seeded or invented. Commune records remain unseeded pending verification against an official administrative register.
- Direct HTTPS scrapers cover the MADRP dated PDF bulletin index, the Tizi Ouzou Directorate of Commerce HTML table, and the Jijel Directorate of Commerce three-column daily price table. Live dry-run on 7 Nov 2026 verified 13 fresh MADRP national rows (04/11/2026), 32 fresh Jijel rows (25/10/2026), and 40 stale Tizi Ouzou rows (07/10/2026), which were excluded. The worker checks robots.txt at runtime, refuses cross-host/non-HTTPS redirects, spaces requests per host, bounds response sizes, parses source dates, rejects observations outside 14 days, and stages every row as pending. The dry-run used no Supabase credentials and made no database writes. CSV import remains an optional fallback, not the primary ingestion path.
- The official source rows are enabled for collection by migration 039 based on the project owner's direction to collect openly accessible public bulletins. This does **not** auto-publish prices: each observation stays pending until a moderator accepts it. The daily GitHub Actions worker runs outside the app server; its service credential is not exposed to the client.
- The simulator has integer-only DZD calculations, household/month/basket planning, low/median/high estimates, weekly/category summaries, local manual-price fallback, a validated offline market-price cache with a freshness label, and private scenario save/load/delete. Scenario records contain only month, household assumptions and basket quantities; budget, income, balances, transactions and computed totals are not stored or sent to the price service.
- The text-first community feature is integrated into desktop and mobile navigation. It supports recipes with multiple ingredients, shopping lists, tips, viewer-area recipe estimates, comments, reactions, saves, reports and blocks. Public profiles use pseudonymous handles and remain private until a successful publication; sharing a wilaya on a post is opt-in. Community prices are calculated on the viewer's device and the viewer's budget is never sent.
- Crowd and verified-merchant price submission RPCs require explicit consent, enforce rate limits and duplicate checks, flag out-of-range values, and stage observations as pending. Users can delete their own crowd and merchant contributions. Merchant submissions require an owner of a published, document-verified Kenz business.
- Admin tools now include a community report queue, individual price-observation review, source health, and an audit trail. The account that should moderate must be explicitly inserted into `public.community_moderators` after migrations are approved; no moderator identity is hard-coded or auto-promoted.
- Remaining before production release: review and apply migrations 036–043 with explicit approval; seed verified commune codes; configure the free GitHub Actions service-role secret for scheduled ingestion; review and accept real observations; run two-device and mobile end-to-end tests; assign the moderator account. The live scraper dry-run is now verified, but it made no database writes. Until deployment, source review, and moderator approval are completed, live prices and community moderation are not production-ready.

## 1. Goals

1. **Monthly budget simulator** — project a whole month (income, recurring commitments, savings plan, variable spending priced from real local prices) against the budget Kenz already computes for the user, and show surplus/shortfall, per category and per week.
2. **Real neighborhood pricing** — a server-side price database fed by scraping/official sources, crowd contributions and merchant submissions, queryable by wilaya → commune → neighborhood cell, always with freshness and confidence.
3. **Community channel** — users post recipes, shopping lists and buying tips. Every recipe/list is priced at the *viewer's* area and shown against the *viewer's* Kenz budget.

## 2. Key findings and decisions (read first)

**F1. Scraping alone will not give neighborhood-level prices in Algeria.** Much grocery buying is informal (souk, local épicerie) with no online price list. Online sources (classifieds, a few chains, official bulletins) mostly give wilaya-level or national reference prices. Decision: a **four-tier source model** — official reference → scraped retail → merchant-submitted (directory businesses) → crowd observations. Neighborhood precision comes mainly from tiers 3–4; the scraper supplies the baseline and the fallback.

**F2. Public price pages are collected directly under the project owner's instruction.** The scraper only accesses openly available HTTPS pages, checks robots.txt at runtime, does not bypass login/paywalls/CAPTCHAs, limits request rate and response size, and stages every observation for human review. Personal data in community profiles and contributions remains subject to a separate privacy review.

**F3. Scraping runs outside the app server.** A separate scheduled worker (GitHub Actions cron or Supabase Edge Function + pg_cron) writes with a server-only credential. The service-role key never enters `VITE_*`, the client bundle or `server.ts`.

**F4. The user's budget never leaves their account.** The server returns prices and community content; the client computes "fits my budget" locally from the user's own RLS-protected data. Posts never embed income or exact budget figures (optional coarse bands only, opt-in).

**F5. Offline/sync architecture.** Do NOT extend `sync_kenz_financial_snapshot` or the budget outbox. Prices and community are server-authoritative and online-first (like shared wallets). Only a cached price snapshot (with `fetched_at`) is stored locally so the simulator works offline with a visible staleness label. Simulator scenarios are small user-owned rows (RLS), saved online with a local draft.

**F6. Money rules stay as-is.** Integer minor units everywhere; unit prices stored as minor units per base unit (kg, l, unit). No floats in persisted data.

**F7. Existing gap to fix first (Phase 0).** In `server.ts`, `resolveOpenAIBaseUrl()` (the SSRF guard) is defined but not used by `/api/ai/advisor` or `/api/ai/test-key`, which build the provider URL from `byokBaseUrl` directly. Wire the guard in before adding any new server surface, and reuse the same auth + rate-limit + metering middleware for new AI routes.

**F8. App-store UGC requirements.** The Android APK ships via `build-apk.yml`; Google Play's user-generated-content policy generally requires in-app reporting, blocking and a moderation process. Reports + blocks + a moderation queue are therefore MVP scope for the community, not extras.

## 3. Architecture

```
 Official feeds / retail sites ──► ingest worker (scheduled, service credential, adapters)
 Merchant submissions ──┐                │ raw → normalize → match → outlier filter
 Crowd observations ────┼─────────► price_observations (append-only)
                        │                │ stats job (median/p25/p75/n/last_seen per area)
                        ▼                ▼
                  RPC get_area_prices(product_ids, commune, geo_cell)  ◄── client (cached)
                                          │
        Simulator engine (pure TS, tested) ◄── user budget/recurring/savings (local, RLS)
                                          │
        Community posts ── recipe cost = Σ qty × area price, "fits budget" computed client-side
```

New client modules: `src/domain/priceTypes.ts`, `src/domain/units.ts`, `src/domain/simulator.ts` (+ tests), `src/services/priceStore.ts`, `src/services/simulatorStore.ts`, `src/services/communityStore.ts`; components `SimulatorView`, `CommunityView`, `RecipeComposer`, `PostCard`, `PriceContributionModal`, `PriceSourceHealth` (admin).
Navigation: Simulator = new sub-tab in `PlanView` (budgets | recurring | goals | challenges | **simulator**); Community = new top-level `NavTab` `'community'` in `App.tsx`.

## 4. Data model (indicative migrations; next free number is 036)

| Migration | Contents |
|---|---|
| 036_price_catalog_and_locations | `products` (slug, name_fr/ar/en, category, base_unit, typical_pack_sizes), `product_aliases` (scraped-title matching), `communes` (wilaya_code, name_fr/ar, centroid lat/lng), `price_sources` (type: official/scraped/merchant/crowd, base_url, reviewed, license_note, enabled, schedule, trust_weight) |
| 037_price_observations_and_stats | `price_observations` (product_id, source_id, unit_price_minor, currency, observed_at, wilaya_code, commune_id, geo_cell, business_id?, user_id?, status, quality_flags) append-only; `price_stats` (product_id, area_level, area_key, window_days, median, p25, p75, n_obs, n_contributors, last_observed); `ingest_runs` (source health: rows fetched/parsed/accepted, errors); RPC `get_area_prices` with fallback chain neighborhood → commune → wilaya → national |
| 038_simulator_scenarios | `simulator_scenarios` (user_id, month, adults, children, child_consumption_permille, basket_overrides, updated_at) RLS owner-only; no financial totals are persisted |
| 039_public_price_ingestion | Adds source URL provenance, idempotency key, ingest-run linkage, and review metadata; registers MADRP, Tizi Ouzou and Jijel sources disabled by default |
| 040_align_price_catalog_slugs | Aligns database product slugs with the canonical client catalog so scraper observations resolve to the same products the simulator requests |
| 041_community_core | Pseudonymous `community_profiles`, `community_posts`, recipes/ingredients, shopping items, comments, reactions and saves |
| 042_community_moderation | Reports, user blocks, moderator registry, audit log, content filters, rate-limited post/comment RPCs, moderation RPCs and moderator-only queue |
| 041_price_contributions | RPC `submit_price_observation` (auth, rate-limited, plausibility-checked), contributor opt-in flag, k-anonymity guard (hide neighborhood stats with < 3 distinct contributors) |

RLS rules: public read of products/stats/published posts; authors write/edit/delete own posts; blocked users filtered in queries; observations are insert-only via RPC; reports readable by moderators only. Follow the 032/033 pattern: `(select auth.uid())` initplan form, explicit privilege grants, and run `REVOKE TRUNCATE, REFERENCES, TRIGGER` consistent with 011. Add every new table to the RLS review checklist.

## 5. Phases

### Phase 0 — Foundations (S)
- Wire `resolveOpenAIBaseUrl` into `/api/ai/advisor` and `/api/ai/test-key`; add timeouts to `test-key`; test.
- **Source audit document** `docs/PRICE_SOURCES.md`: candidate sources (official price bulletins/observatories, retail chains, classifieds such as Ouedkniss — all unverified), robots/ToS/licence verdict, update frequency, geographic granularity, expected parse stability. Output: go/no-go per source.
- Seed `products` (~150 staple SKUs: semoule, farine, huile, sucre, lait, œufs, pain, tomate, pomme de terre, poulet, légumineuses, café/thé, fuel, gas bottle, etc.) in FR/AR/EN; load `communes` dataset (verify against the current administrative reform before seeding).
- Add Phase 4 section to `docs/FEATURE_ROADMAP.md`.
- Exit: SSRF fix merged with tests; audit doc reviewed; seeds reviewed.

### Phase 1 — Price data layer (L)
- Migrations 036–037 applied to a Supabase branch first (not straight to production).
- `workers/price-ingest/`: adapter interface `fetch() → parse() → normalize()`; polite fetching (robots.txt, per-host rate limit, identifying User-Agent, conditional requests, response caching); per-source adapters only for audited sources.
- Normalization: unit parser (`1kg`, `500 g`, `1L`, `x6`, Arabic digits/units) → price per base unit; product matching via alias table + fuzzy match; unmatched items go to an admin review queue (optional AI-assisted suggestions, never auto-trusted).
- Quality: outlier rejection (median/MAD per product+area), dedupe, staleness window, trust weights by source tier.
- Stats job (hourly/daily) fills `price_stats`; `PriceSourceHealth` admin panel (extend `AdminDashboardModal`) shows yield, last success, parse-rate drops with alerting.
- Tests: adapter parsers against saved HTML/JSON **fixtures** (no live network in CI), unit parser table tests, outlier/median tests, RPC fallback-chain test.
- Exit: at least one audited source producing stats for ≥ 30 staple products at wilaya level, with `last_observed` visible.

### Phase 2 — Budget simulator (L) — can start in parallel with Phase 1
De-risk: ship first against a static `reference_prices.json` (national estimates, clearly labeled "estimate"), switch to `get_area_prices` when Phase 1 lands.
- `src/domain/simulator.ts` (pure, integer math), reusing `calculateSafeToSpend`, `calculateCategoryBudgets`, recurring items and savings plans:
  - Inputs: month, household (adults/children, diet flags), area, monthly income (recurring + payday), recurring commitments, savings plan, category budgets, basket template with per-person consumption, user overrides, optional meal plan from saved recipes.
  - Outputs: line-item costs (low/expected/high from p25/median/p75), totals per category, projected surplus/shortfall, weekly split, "days covered" by the food budget, deterministic cheapest-substitute suggestions (same category, lower unit price), data-quality summary (n, freshness).
- `SimulatorView`: household + area picker (default from profile wilaya), basket editor with sliders, scenario compare (A/B), results vs Kenz budget, "Apply to my budget" which calls `updateBudget` only after explicit confirmation, save/load scenarios.
- AI (optional, existing credit metering): explain results in plain language using the already-computed numbers; the model never produces figures.
- Tests: boundary months (28–31 days), zero income, negative surplus, mixed currencies rejected, rounding/remainder allocation, fallback when price missing (flagged, not guessed).
- Exit: simulator reproduces hand-checked fixtures to the centime; works offline with cached prices and a staleness banner; mobile layout checked.

### Phase 3 — Crowd and merchant prices (M)
- Migration 041. `PriceContributionModal`: "I paid X for Y at Z" with product picker, unit, commune; explicit opt-in; shown clearly as a public contribution.
- Merchants (directory businesses, verified status already modelled) can submit shelf prices for their store; no identity-document upload (per roadmap constraint).
- Receipt scanner stays opt-in/preview-only per roadmap: a scanned receipt may *pre-fill* a contribution, but nothing is submitted without the user confirming each line; no image retention.
- Anti-abuse: rate limits, plausibility vs area median, contributor reputation weight, k-anonymity (min 3 distinct contributors) before neighborhood stats are shown.
- Exit: abuse tests (spam, outlier, sybil-style repeat submissions) pass; privacy review done.

### Phase 4 — Community channel MVP (L)
- Migrations 039–040. `CommunityView` feed: filter by wilaya/commune and kind; sort new / top / **fits my budget**.
- `RecipeComposer`: ingredient picker from the catalog (or free text), servings, steps, live cost preview at the author's area.
- Shopping-list posts ("what I bought / where / how much") and tips; comments, like, save.
- Safety: report, block, hide, moderation queue + audit trail in the admin dashboard, server-side rate limits (`create_post`), link/phone-number restrictions, handle-only public profile, Arabic/French/English with RTL.
- Images: **deferred** to a later sub-phase (Supabase Storage bucket, MIME/size caps, moderation) — text-first MVP.
- Tests: RLS/access-boundary tests (non-author edit, blocked-user visibility, reports visibility), rate-limit tests, `communityStore` unit tests.
- Exit: moderation flow works end-to-end; no PII leakage in public views verified with a test.

### Phase 5 — Integration and release (M)
- Post cost at *viewer's* prices: `costPerServing = Σ qty × medianUnitPrice(viewerArea)` with fallback chain and confidence label; "fits budget" badge = share of the viewer's remaining weekly food budget (computed client-side).
- "Cook this": add recipe to the simulator meal plan and generate a priced shopping list; export/share list.
- Price alerts/notifications for staples in the user's commune (opt-in), reusing the bill-reminder notification service.
- i18n completion (FR/AR/EN, RTL, DZD formatting), accessibility pass, empty/loading/error/offline states, Android build check, regression pass on existing flows, docs update (`SUPABASE_SETUP.md`, this plan's status).
- Exit: roadmap "Definition of done" satisfied for every item; nothing labelled production-ready until the tests and deployment configuration are verified.

## 6. Cross-cutting requirements

- **Security:** service credential only in the worker's secret store; RLS on every table; no client-trusted prices (client never writes `price_stats`); all server routes authenticated + rate-limited + validated; SSRF-safe outbound fetching in the worker (allow-list of audited hosts).
- **Privacy:** contributions and posts are public by design and labelled; no raw budget/income in public data; delete-my-contributions and delete-my-posts supported (erasure path for law 18-07 expectations).
- **Transparency:** every price shows source tier, sample size and age; stale (> 14 days) or thin (< 3 observations) data is flagged and widens the low/high band instead of being hidden.
- **Financial guidance wording:** simulator output is a planning estimate, not a guarantee or regulated financial advice (matches roadmap principle).
- **Observability:** ingest run metrics, parse-yield alerts, moderation queue size, RPC latency.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Sources forbid scraping or change layout | Source audit gate; prefer official/open data; fixture-based parser tests; health alerts; crowd tier as a second leg |
| Sparse neighborhood data | Fallback chain + explicit confidence; seed with merchant/crowd campaign in pilot wilayas first |
| Spam/abuse/harmful content | Rate limits, reports, blocks, moderation queue, text-first MVP, staged rollout by wilaya |
| Wrong prices mislead budgets | Low/expected/high bands, freshness labels, outlier filters, no silent guessing of missing prices |
| Scope size | Phase 2 ships on reference prices early; community is MVP-text-only; images/notifications deferred |
| Hosting for the scheduled worker unclear | Decision D2 below; both options need only a cron + secret store |

## 8. Decisions needed from you (defaults chosen so work can start)

- **D1 Pilot geography:** default Alger + one inland wilaya (e.g. your own area) for price coverage and moderation.
- **D2 Worker hosting:** default GitHub Actions scheduled workflow writing through a Supabase RPC with a dedicated ingest role (least privilege, no service-role key in the repo).
- **D3 Community moderation owner:** who reviews reports (you, volunteers, hired)? Default: admin role in the existing admin dashboard, you as moderator at launch.
- **D4 Images in posts:** default deferred.
- **D5 Source shortlist:** to be confirmed after the Phase 0 audit.

## 9. First executable steps (Phase 0 checklist)

1. Create branch `feat/price-simulator-community` from `feat/kenz-expansion`.
2. Wire `resolveOpenAIBaseUrl` into the two AI routes + tests.
3. Create `docs/PRICE_SOURCES.md` and complete the audit of candidate sources.
4. Draft migrations 036–038 and validate them in CI/static review. A paid Supabase preview branch is intentionally not used; do not apply to production until separately approved.
5. Implement `units.ts`, the price-ingest normalization core, and `simulator.ts` with deterministic tests. (Initial implementations are now on the feature branch.)
