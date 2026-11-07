# Price Source Audit (Phase 0 / Phase 1 onboarding)

Audit date: 2026-11-07. Scope: official and partner sources for Algerian consumer prices used by Kenz's simulator.

**Method and limits.** Public pages and indexed official bulletins were reviewed. Project-owner direction is to collect openly accessible public price information directly, rather than depend only on CSV files. The collector does not log in, bypass paywalls/CAPTCHAs, or follow cross-host redirects; it checks robots.txt at runtime, uses a descriptive User-Agent, rate-limits each host, bounds response sizes, and stages every observation for review. This engineering note is not a legal opinion.

**Collection rule.** Only openly accessible, unauthenticated pages are eligible. The project owner has approved the three official public sources below for pending-only collection. robots.txt is checked on every fetch and the collector fails closed when access is disallowed or cannot be checked. Collection never publishes a price automatically: a moderator must review each observation before it enters public aggregates.

## 1. Findings

| # | Source | Type | What it provides | Granularity / cadence | Evidence | Verdict |
|---|---|---|---|---|---|---|
| S1 | Ministry of Commerce — Observation des prix platform | Official | Daily wholesale and retail prices for selected products | Per wilaya; described as daily | Official ministry page says access is via the ministry's MCIRMN intranet: [FR](https://www.commerce.gov.dz/fr/observation-des-prix), [AR](https://www.commerce.gov.dz/observation-des-prix) | **Do not automate from the public page.** Ask the ministry for an authorised export/API or data agreement. |
| S2 | Ministry of Agriculture — Mercuriale des produits agricoles | Official | Daily retail average, minimum and maximum for fresh produce, fruit, meat, eggs and some dairy | National averages in reviewed November 2026 bulletins; not neighborhood prices | Official ministry-hosted PDFs indexed for 2 and 4 Nov 2026 (see links below) | **Automated parser implemented and owner-approved for pending-only collection.** The collector follows the public bulletin index to the newest dated PDF, checks robots.txt, and parses national-average rows. Live dry-run on 7 Nov 2026 fetched the 04/11/2026 PDF and matched 13 fresh rows. No row was staged or published by the dry-run. |
| S3 | Directorate of Commerce, Tizi Ouzou — daily and monthly price statements | Official local directorate | Wholesale/retail and min/max retail prices for staple products | Tizi Ouzou wilaya; dated daily pages and monthly PDF statements | [Daily price statement](https://www.dcwtiziouzou.dz/fr/index.php?Itemid=77&id=76&option=com_content&view=article); [February 2026 monthly statement](https://www.dcwtiziouzou.dz/fr/images/stories/bilan/doc%202026/releve%20du%20prix%202026/Prix%20Fevrier%202026.pdf) | **HTML parser implemented and owner-approved for pending-only collection.** The collector reads the published retail-price column and the page's own observation date. Live dry-run on 7 Nov 2026 parsed 40 matched rows dated 07/10/2026; all 40 were outside the 14-day freshness window and were excluded. |
| S3a | Directorate of Commerce, Jijel — daily price statement | Official local directorate | Retail prices for staples, vegetables, fruits, meat and eggs | Jijel wilaya (18); live dry-run confirmed the page's printed date as 25/10/2026 | [Daily price statement](https://www.dcwjijel.dz/index.php/moy-prix/prix-journ) | **Three-column HTML parser implemented and owner-approved for pending-only collection.** The crawler extracts the printed date and retail column. Live dry-run on 7 Nov 2026 read the 25/10/2026 bulletin, matched 32 product rows for wilaya 18, and marked all 32 fresh under the 14-day window. |
| S4 | ONS — Consumer Price Index | Official statistics | Monthly CPI movement and category-level inflation | National / city index; monthly, not shelf price levels | [ONS CPI bulletin](https://www.ons.dz/IMG/pdf/i.IPC_janvier2026.pdf) | **Trend context only.** Never convert CPI into a fabricated basket price. |
| S5 | Ministry of Commerce — regulated-price legal notices | Official legal texts | Legally fixed prices / ceilings for specified products and pack sizes | National; effective dates depend on each legal text | [Regulated prices FAQ](https://commerce.gov.dz/fr/questions-frequentes/themes/prix-reglementees); [price regulation page](https://www.commerce.gov.dz/fr/reglementation-des-prix-des-biens-et-services) | **Curated legal table only.** A human must verify the current legal text and effective date; do not treat an old page as current shelf price. |
| S6 | Ouedkniss (classifieds) | Scraped | Asking prices in listings | Listing/city; irregular | Terms and robots access were not verified | **UNVERIFIED — do not scrape.** Poor fit for grocery shelf prices; only revisit with written permission. |
| S7 | Online grocery apps and supermarket chains | Partner / scraped | Potential shelf prices | Store-level, if a partner feed exists | No verified public price API or reuse licence found in this audit | **Partnership route only.** No HTML scraper enabled. |
| S8 | Kenz verified merchant submissions | Merchant | Shelf prices submitted by owners of published, document-verified businesses | Business / wilaya (commune when verified codes are seeded) | Migration 043 RPC checks business ownership and verification status, explicit consent, duplicate/rate limits and plausibility; observations stay pending | **Implemented, pending-only.** The source is enabled in migration 043; no contribution is accepted into public aggregates until moderator review. |
| S9 | Kenz opt-in community observations | Crowd | User-reported paid prices | Neighborhood after aggregation | Kenz feature not yet implemented | Future source; requires explicit opt-in, abuse controls and minimum three distinct contributors for neighborhood aggregates. |

### Official bulletin examples reviewed

- [Ministry of Agriculture bulletin — 2 November 2026](https://madr.gov.dz/wp-content/uploads/2026/11/prix_02_Nov_2026_MADRP.pdf): national retail averages and min/max for produce, fruit, meat, eggs and milk.
- [Ministry of Agriculture bulletin — 4 November 2026](https://madr.gov.dz/wp-content/uploads/2026/11/prix_04_Nov_2026_MADRP.pdf): same general structure and daily date.
- The Ministry of Commerce price observation platform describes daily wholesale/retail monitoring across all wilayas, but its page says the platform itself is accessed through the ministry intranet. Public description ≠ public feed.

## 2. Phase 1 implementation

1. **Direct public scraping is implemented and live dry-run verified** in `workers/price-ingest/publicSources.ts` for three official page shapes: the Ministry of Agriculture daily bulletin index (newest dated PDF), the Tizi Ouzou Directorate of Commerce HTML table, and the Jijel Directorate of Commerce three-column price table. The 7 Nov 2026 dry-run matched 13 fresh national MADRP rows (04/11/2026), 32 fresh Jijel rows (25/10/2026), and 40 stale Tizi Ouzou rows (07/10/2026), which were excluded. The scraper uses HTTPS only, checks each host's `robots.txt` at runtime, follows at most two same-host HTTPS redirects, sends a descriptive User-Agent, and does not bypass logins, CAPTCHAs, rate limits or other access controls. The run used no Supabase credentials and made no database writes.
2. The MADRP adapter extracts the national daily average (not the bulletin's min/max columns) and labels it national. The Tizi Ouzou adapter extracts the retail column, uses the date printed on the page, and labels it wilaya 15; its 07/10/2026 snapshot was stale on the 7 Nov run. The Jijel adapter parses the official three-column table, including product+unit labels in one cell, and labels it wilaya 18; its live 25/10/2026 snapshot yielded 32 fresh matched rows.
3. `workers/price-ingest/run.ts` stages scraper output as `pending`; it never publishes automatically. It skips a source until an operator has explicitly marked it reviewed/enabled. `workers/price-ingest/review.ts` is the explicit approval path: approve an ingest run, optionally enable a source after checking its terms/access policy, and refresh aggregates. Only accepted observations from reviewed+enabled sources feed public statistics.
4. `workers/price-ingest/run.ts --dry-run` fetches and parses without database credentials or writes. `.github/workflows/ingest-public-prices.yml` provides a daily scheduled job and a manual dry-run / review path. GitHub Actions requires `SUPABASE_SERVICE_ROLE_KEY` to stage or approve records. This workflow uses GitHub-hosted free Actions; it adds no paid service.
5. CSV remains supported as an alternative via `workers/price-ingest/manualImport.ts`, not the only ingestion path. It validates DZD, dates, HTTPS provenance and optional wilaya/commune codes.
6. The Ministry of Commerce price observation platform's public description says access to the platform itself is via the MCIRMN intranet; Kenz does not scrape that intranet page or attempt to bypass it. Never treat ONS CPI as a shelf price, and never publish a national average as a commune/neighborhood observation.
7. The three official scraper sources are enabled for pending-only collection by migration 039. Crowd and verified-merchant submissions are enabled for pending-only collection by migration 043. Migrations 036–043 are branch-only and have not been applied to production; no data is written until deployment and worker-secret configuration, and no price is public until a moderator accepts it.

## 3. Legal and privacy notes (Algeria)

Per a July 2026 law-firm summary of Law 18-07 as amended by Law 25-11 — a secondary source; verify with Algerian counsel:
- Processing personal data generally needs express consent; prior notification / authorization requirements may apply depending on processing.
- Transfers of personal data abroad need a legal review. The Kenz Supabase project is hosted in EU West (Paris), so community and contribution features need a cross-border data review before launch.
- Keep public data minimal: handle only, no email, no budget/income. Price-only official bulletin imports do not need personal data.

## 4. Source onboarding checklist

- [ ] Confirm the page is openly accessible without login, paywall, CAPTCHA or access-control bypass
- [ ] robots.txt checked at runtime; host rate limit, identifying User-Agent and response-size limits enabled
- [ ] Fields, units, currency, date semantics and geographic granularity documented
- [ ] Parser fixture committed (saved sample; no live network in CI)
- [ ] Trust weight and 14-day staleness window set
- [ ] Sample import reviewed by an operator before any observation is accepted
- [ ] Source collection may be enabled, but every observation remains pending until moderator review

## 5. Open actions

1. Run a worker dry-run after migration deployment and verify that each current page date is parsed correctly; robots.txt must allow every fetched path.
2. Ask the Ministry of Commerce whether the MCIRMN price platform offers an openly accessible export/API; do not attempt to bypass its intranet access.
3. Verify current regulated-price legal texts and their effective dates before adding curated values.
4. Verify official commune codes and names against the latest administrative register before seeding `communes`.
5. Complete the personal-data and cross-border hosting review for user profiles, contributions and community features before public launch.


## 5. Current implementation and deployment boundary

- Source adapters: MADRP PDF, Tizi Ouzou HTML, and Jijel daily price page.
- The daily GitHub Actions worker is configured to run outside the app server. It uses a server-side Supabase secret; no service-role credential is exposed to Vite or the mobile bundle.
- Every fetched observation is pending by default. Admin moderation can accept or reject individual observations, and the review decision is audited. Only accepted observations from enabled/reviewed sources are included in aggregates.
- Migrations 036–043 are still branch-only and have not been applied to production. The worker therefore has not populated the live price tables yet. After an approved migration deployment and secret configuration, run a dry-run, inspect staged rows, then review observations before they appear in the simulator.
- Commune data remains intentionally empty until official commune codes are checked. Current live price coverage therefore falls back to wilaya and national levels; neighborhood pricing requires future crowd/merchant density and the three-contributor threshold.
