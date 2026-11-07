# Price Source Audit (Phase 0)

Audit date: 2026-11-07. Scope: where Kenz can obtain *real* Algerian consumer prices for the budget simulator and the community channel (see `docs/PLAN_PRICE_SIMULATOR_COMMUNITY.md`).

**Method and limits.** Desktop research via web search and page fetches. Several sites could not be read automatically (JavaScript-only pages, robots.txt not fetchable from this environment, Facebook not scrapable). Anything not directly read is marked **UNVERIFIED**. This is an engineering audit, not legal advice; confirm the legal points with Algerian counsel before launch.

**Gate rule.** A source may be enabled in `price_sources` (`reviewed = true`) only after: (1) terms of use read by a human, (2) robots.txt checked, (3) licence/permission recorded here, (4) a parser fixture committed. Until then it stays disabled.

## 1. Findings

| # | Source | Type | What it gives | Granularity | Evidence | Verdict |
|---|---|---|---|---|---|---|
| S1 | Ministry of Agriculture retail price posts | Official | Min / max / average retail prices for vegetables, fruit, beef, chicken, eggs (Feb 2024 example: potatoes 62 DA/kg avg, tomatoes 82, eggs 22/unit) | National, no wilaya or market named | Reported by Algerie360 (11 Feb 2024); the Ministry posts on its Facebook page; schedule "regular", not fixed | **Use as baseline** via manual/semi-automated entry or an official data agreement. Do **not** scrape Facebook (platform terms). |
| S2 | Regulated / subsidized prices (oil, sugar, semolina, flour, bread, milk) | Official (legal texts) | Fixed ceiling prices per pack size | National | Only a secondary list found (consumer-association list reported by TSA, 16 Oct 2022); other press reports mention later oil price revisions | **Use**, but source from the official legal texts (Journal Officiel / ministry notices), maintained as a curated table with `effective_from` dates. Treat the 2022 figures as **stale**; never ship them as current. |
| S3 | ONS consumer price index | Official | Monthly inflation index and category changes | National index, not price levels | Monthly figures covered by Algerian press; ONS site not directly verified | **Use for trend adjustment only** (age-correct stale prices), not as basket prices. |
| S4 | Wholesale market prices (marchés de gros) | Official / press | Wholesale price levels, reported around events such as Ramadan | Market-level, unstructured | Press mentions only; no structured feed found | **Investigate.** Ask the Ministry of Commerce/Agriculture whether a feed exists. Wholesale ≠ shelf price; needs a documented retail-margin rule if used. |
| S5 | Ouedkniss (classifieds) | Scraped | Asking prices on listings | Per listing, city | Site has terms/legal pages but they are JavaScript-rendered and **could not be read**; robots.txt **not retrievable here** | **UNVERIFIED — do not scrape.** Poor fit anyway: asking prices, mostly non-grocery. Only pursue with written permission. |
| S6 | Online grocery apps/sites (e.g. Alimarket) | Scraped / partner | Possibly DZD shelf prices | Unknown | App-store page shows an "online supermarket" by an individual developer; coverage, prices and terms not stated | **UNVERIFIED, low priority.** Needs per-service check; prefer a partnership or API over HTML scraping. |
| S7 | Hypermarket / supermarket chains | Partner | Shelf prices | Per store | Large chains exist (press list of the biggest hypermarkets); no verified public price feed | **Partnership route** via the merchant tier, not scraping. |
| S8 | Merchant submissions (Kenz directory) | Merchant | Shelf prices from verified local shops | Neighborhood | Built by us | **Core source for neighborhood precision.** No identity-document upload (roadmap constraint). |
| S9 | Crowd observations (users) | Crowd | "I paid X for Y at Z" | Neighborhood | Built by us | **Core source**, opt-in, with plausibility checks and k-anonymity (min 3 contributors). |
| S10 | Fuel and gas-bottle prices | Official | Government-set prices | National | Not verified in this audit | **Curated table** from official texts, like S2. |

## 2. Conclusions

1. **No verified source gives neighborhood-level shelf prices.** The audit confirms the plan's four-tier design: official baselines (S1–S4, S10) + merchant (S8) + crowd (S9), with scraping (S5–S7) as optional and only where permission is clear.
2. **The first ingest worker should not be an HTML scraper.** Build it around the **curated official tables** (S2, S10) and a **manual/semi-automated importer for S1** (an admin pastes or uploads the Ministry's published figures; the worker validates and stores them with provenance). This delivers real, defensible prices sooner and with no terms-of-service risk.
3. **Scraper framework stays in scope** (adapter interface, fixtures, health monitoring) but ships with zero enabled third-party adapters until a source passes the gate.
4. **Stale data must be labeled.** Regulated prices change; every observation carries `observed_at` / `effective_from` and the UI shows age.

## 3. Legal and privacy notes (Algeria)

Per a July 2026 law-firm summary (Gide) of Law 18-07 as amended by Law 25-11 — **single secondary source, verify with counsel**:
- Processing personal data generally needs express consent; prior notification to the data protection authority (ANPDP) is required, with prior authorization for high-risk processing; a data protection officer and a processing register are expected.
- Transfers of personal data abroad generally need prior ANPDP authorization.
- Penalties can include fines up to 500,000 DA and imprisonment depending on the offence.

Implications for Kenz:
- Crowd contributions and community posts are personal data processing: privacy notice, explicit opt-in, erasure of own posts/contributions, ANPDP declaration.
- **Where the Supabase project is hosted matters** (cross-border transfer). Check the region and get counsel's view before launching community features.
- Keep public data minimal: handle only, no email, no budget/income.

## 4. Source onboarding checklist (copy per source)

- [ ] Terms of use read by a human; clause on automated access and reuse recorded
- [ ] robots.txt checked and respected; crawl delay set
- [ ] Written permission / licence obtained if terms are restrictive
- [ ] Data fields, units, currency, update frequency, geographic granularity documented
- [ ] Parser fixture committed (saved sample, no live network in CI)
- [ ] Trust weight and staleness window set
- [ ] `price_sources.reviewed = true` set by an admin

## 5. Open actions

1. Read Ouedkniss terms and robots.txt in a browser (only if the source is wanted at all).
2. Ask the Ministry of Agriculture / Commerce for a structured price feed or published dataset.
3. Locate the current official texts for regulated prices (S2) and fuel/gas (S10) and record effective dates.
4. Confirm Supabase hosting region and the ANPDP declaration path with counsel.
5. Identify two or three pilot merchants (Alger + one inland wilaya) for the merchant tier.
