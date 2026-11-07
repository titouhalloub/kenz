# Price Source Audit (Phase 0 / Phase 1 onboarding)

Audit date: 2026-11-07. Scope: official and partner sources for Algerian consumer prices used by Kenz's simulator.

**Method and limits.** Public pages and indexed official bulletins were reviewed. Finding a published document does not itself grant permission to bulk-copy or republish its contents. Terms, reuse licences, robots rules and any API access must be confirmed by a human before automated ingestion. This is an engineering audit, not legal advice.

**Gate rule.** A source may be enabled in `price_sources` (`reviewed = true`) only after: (1) reuse terms/licence or written permission recorded, (2) robots/access rules checked where relevant, (3) scope and geographic granularity documented, (4) parser fixture committed, and (5) an operator reviews a sample import. Until then it stays disabled.

## 1. Findings

| # | Source | Type | What it provides | Granularity / cadence | Evidence | Verdict |
|---|---|---|---|---|---|---|
| S1 | Ministry of Commerce — Observation des prix platform | Official | Daily wholesale and retail prices for selected products | Per wilaya; described as daily | Official ministry page says access is via the ministry's MCIRMN intranet: [FR](https://www.commerce.gov.dz/fr/observation-des-prix), [AR](https://www.commerce.gov.dz/observation-des-prix) | **Do not automate from the public page.** Ask the ministry for an authorised export/API or data agreement. |
| S2 | Ministry of Agriculture — Mercuriale des produits agricoles | Official | Daily retail average, minimum and maximum for fresh produce, fruit, meat, eggs and some dairy | National averages in reviewed November 2026 bulletins; not neighborhood prices | Official ministry-hosted PDFs indexed for 2 and 4 Nov 2026 (see links below) | **Automated parser implemented.** The collector follows the public bulletin index to the newest dated PDF, checks robots.txt, and stages national-average rows for review. The source remains disabled until an operator confirms its terms/access review. |
| S3 | Directorate of Commerce, Tizi Ouzou — daily and monthly price statements | Official local directorate | Wholesale/retail and min/max retail prices for staple products | Tizi Ouzou wilaya; dated daily pages and monthly PDF statements | [Daily price statement](https://www.dcwtiziouzou.dz/fr/index.php?Itemid=77&id=76&option=com_content&view=article); [February 2026 monthly statement](https://www.dcwtiziouzou.dz/fr/images/stories/bilan/doc%202026/releve%20du%20prix%202026/Prix%20Fevrier%202026.pdf) | **HTML parser implemented.** The collector reads the published retail-price column and the page's own observation date. The page inspected during this audit showed 30/07/2026, so those values are stale as of this audit and must not be treated as current market prices. |
| S3a | Directorate of Commerce, Jijel — daily price statement | Official local directorate | Retail prices for staples, vegetables, fruits, meat and eggs | Jijel wilaya (18); page advertises 25/10/2026 in current search index, while cached page text showed 06/08/2026 | [Daily price statement](https://www.dcwjijel.dz/index.php/moy-prix/prix-journ) | **Plain-text parser implemented.** The crawler extracts the printed date and retail column; 14-day freshness gate prevents old cached pages from being accepted. |
| S4 | ONS — Consumer Price Index | Official statistics | Monthly CPI movement and category-level inflation | National / city index; monthly, not shelf price levels | [ONS CPI bulletin](https://www.ons.dz/IMG/pdf/i.IPC_janvier2026.pdf) | **Trend context only.** Never convert CPI into a fabricated basket price. |
| S5 | Ministry of Commerce — regulated-price legal notices | Official legal texts | Legally fixed prices / ceilings for specified products and pack sizes | National; effective dates depend on each legal text | [Regulated prices FAQ](https://commerce.gov.dz/fr/questions-frequentes/themes/prix-reglementees); [price regulation page](https://www.commerce.gov.dz/fr/reglementation-des-prix-des-biens-et-services) | **Curated legal table only.** A human must verify the current legal text and effective date; do not treat an old page as current shelf price. |
| S6 | Ouedkniss (classifieds) | Scraped | Asking prices in listings | Listing/city; irregular | Terms and robots access were not verified | **UNVERIFIED — do not scrape.** Poor fit for grocery shelf prices; only revisit with written permission. |
| S7 | Online grocery apps and supermarket chains | Partner / scraped | Potential shelf prices | Store-level, if a partner feed exists | No verified public price API or reuse licence found in this audit | **Partnership route only.** No HTML scraper enabled. |
| S8 | Kenz verified merchant submissions | Merchant | Shelf prices from participating local shops | Store / neighborhood | Kenz feature not yet implemented | Future source; requires merchant agreement, verification and review. |
| S9 | Kenz opt-in community observations | Crowd | User-reported paid prices | Neighborhood after aggregation | Kenz feature not yet implemented | Future source; requires explicit opt-in, abuse controls and minimum three distinct contributors for neighborhood aggregates. |

### Official bulletin examples reviewed

- [Ministry of Agriculture bulletin — 2 November 2026](https://madr.gov.dz/wp-content/uploads/2026/11/prix_02_Nov_2026_MADRP.pdf): national retail averages and min/max for produce, fruit, meat, eggs and milk.
- [Ministry of Agriculture bulletin — 4 November 2026](https://madr.gov.dz/wp-content/uploads/2026/11/prix_04_Nov_2026_MADRP.pdf): same general structure and daily date.
- The Ministry of Commerce price observation platform describes daily wholesale/retail monitoring across all wilayas, but its page says the platform itself is accessed through the ministry intranet. Public description ≠ public feed.

## 2. Phase 1 implementation

1. **Direct public scraping is implemented** in `workers/price-ingest/publicSources.ts` for three public page shapes: the Ministry of Agriculture daily bulletin index (newest dated PDF), the Tizi Ouzou Directorate of Commerce HTML table, and the Jijel Directorate of Commerce plain-text daily statement. The scraper uses HTTPS only, checks each host's `robots.txt` at runtime, follows at most two same-host HTTPS redirects, sends a descriptive User-Agent, and does not bypass logins, CAPTCHAs, rate limits or other access controls.
2. The MADRP adapter extracts the national daily average (not the bulletin's min/max columns) and labels it national. The Tizi Ouzou adapter extracts the retail column, uses the date printed on the page, and labels it wilaya 15. The Jijel adapter handles rows without a table and labels them wilaya 18. Search indexing advertised a 25/10/2026 Jijel bulletin, but a cached page copy showed 06/08/2026; both sources are protected by the 14-day freshness gate, so stale copies are excluded.
3. `workers/price-ingest/run.ts` stages scraper output as `pending`; it never publishes automatically. It skips a source until an operator has explicitly marked it reviewed/enabled. `workers/price-ingest/review.ts` is the explicit approval path: approve an ingest run, optionally enable a source after checking its terms/access policy, and refresh aggregates. Only accepted observations from reviewed+enabled sources feed public statistics.
4. `workers/price-ingest/run.ts --dry-run` fetches and parses without database credentials or writes. `.github/workflows/ingest-public-prices.yml` provides a daily scheduled job and a manual dry-run / review path. GitHub Actions requires `SUPABASE_SERVICE_ROLE_KEY` to stage or approve records. This workflow uses GitHub-hosted free Actions; it adds no paid service.
5. CSV remains supported as an alternative via `workers/price-ingest/manualImport.ts`, not the only ingestion path. It validates DZD, dates, HTTPS provenance and optional wilaya/commune codes.
6. The Ministry of Commerce price observation platform's public description says access to the platform itself is via the MCIRMN intranet; Kenz does not scrape that intranet page or attempt to bypass it. Never treat ONS CPI as a shelf price, and never publish a national average as a commune/neighborhood observation.
7. Source rows are seeded disabled by migration 039. Migrations 036–039 are branch-only and have not been applied to production. No source is enabled and no price data is written until the migrations are deliberately deployed and the operator completes source review.

## 3. Legal and privacy notes (Algeria)

Per a July 2026 law-firm summary of Law 18-07 as amended by Law 25-11 — a secondary source; verify with Algerian counsel:
- Processing personal data generally needs express consent; prior notification / authorization requirements may apply depending on processing.
- Transfers of personal data abroad need a legal review. The Kenz Supabase project is hosted in EU West (Paris), so community and contribution features need a cross-border data review before launch.
- Keep public data minimal: handle only, no email, no budget/income. Price-only official bulletin imports do not need personal data.

## 4. Source onboarding checklist

- [ ] Terms / reuse licence read by a human; automated access and redistribution rights recorded
- [ ] Robots / access rules checked where relevant; rate limit and identifying User-Agent documented
- [ ] Written permission or official API/export agreement obtained if needed
- [ ] Fields, units, currency, date semantics and geographic granularity documented
- [ ] Parser fixture committed (saved sample; no live network in CI)
- [ ] Trust weight and staleness window set
- [ ] Sample import reviewed by an operator
- [ ] Only then set `price_sources.reviewed = true` and `enabled = true`

## 5. Open actions

1. Contact the Ministry of Agriculture for a structured daily feed, reuse terms or written permission for bulletin transcription.
2. Contact the Tizi Ouzou Directorate of Commerce to confirm whether its daily statement is routinely updated and may be reused.
3. Ask the Ministry of Commerce whether the MCIRMN price platform offers an authorised public export/API.
4. Verify current regulated-price legal texts and their effective dates before adding curated values.
5. Verify official commune codes and names against the latest administrative register before seeding `communes`.
6. Complete the human legal review of Law 18-07 / Law 25-11 and cross-border hosting before launching crowd/community features.
