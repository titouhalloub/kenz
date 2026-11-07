# Price Source Audit (Phase 0 / Phase 1 onboarding)

Audit date: 2026-11-07. Scope: official and partner sources for Algerian consumer prices used by Kenz's simulator.

**Method and limits.** Public pages and indexed official bulletins were reviewed. Finding a published document does not itself grant permission to bulk-copy or republish its contents. Terms, reuse licences, robots rules and any API access must be confirmed by a human before automated ingestion. This is an engineering audit, not legal advice.

**Gate rule.** A source may be enabled in `price_sources` (`reviewed = true`) only after: (1) reuse terms/licence or written permission recorded, (2) robots/access rules checked where relevant, (3) scope and geographic granularity documented, (4) parser fixture committed, and (5) an operator reviews a sample import. Until then it stays disabled.

## 1. Findings

| # | Source | Type | What it provides | Granularity / cadence | Evidence | Verdict |
|---|---|---|---|---|---|---|
| S1 | Ministry of Commerce — Observation des prix platform | Official | Daily wholesale and retail prices for selected products | Per wilaya; described as daily | Official ministry page says access is via the ministry's MCIRMN intranet: [FR](https://www.commerce.gov.dz/fr/observation-des-prix), [AR](https://www.commerce.gov.dz/observation-des-prix) | **Do not automate from the public page.** Ask the ministry for an authorised export/API or data agreement. |
| S2 | Ministry of Agriculture — Mercuriale des produits agricoles | Official | Daily retail average, minimum and maximum for fresh produce, fruit, meat, eggs and some dairy | National averages in reviewed November 2026 bulletins; not neighborhood prices | Official ministry-hosted PDFs indexed for 2 and 4 Nov 2026 (see links below) | **Best first baseline candidate.** Manual reviewed import only until reuse permission / feed terms are confirmed. |
| S3 | Directorate of Commerce, Tizi Ouzou — daily and monthly price statements | Official local directorate | Wholesale/retail and min/max retail prices for staple products | Tizi Ouzou wilaya; dated daily pages and monthly PDF statements | [Daily price statement](https://www.dcwtiziouzou.dz/fr/index.php?Itemid=77&id=76&option=com_content&view=article); [February 2026 monthly statement](https://www.dcwtiziouzou.dz/fr/images/stories/bilan/doc%202026/releve%20du%20prix%202026/Prix%20Fevrier%202026.pdf) | **Pilot manual import candidate.** Verify current publication cadence, reuse permission and product/unit consistency. |
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

## 2. Phase 1 decision

1. **No unattended scraper is authorised by this audit.** No third-party source is enabled in the database.
2. The first integration is a **human-reviewed CSV import**. An operator transcribes or exports values from an official bulletin, includes the source URL and observation date, and reviews the normalized preview before any database write.
3. `workers/price-ingest/manualImport.ts` accepts the documented CSV columns: `title,quantity,price,currency,observed_at,source_reference`; optional columns are `wilaya_code,commune_code`. It rejects non-DZD values, invalid dates, non-HTTPS provenance and malformed wilaya codes. It makes no network request and does not enable a source.
4. Each imported row retains its source URL and observation date. Unit normalization is delegated to the existing unit parser; unmatched product names remain review-only.
5. Start with the Ministry of Agriculture bulletin and the Tizi Ouzou directorate statement only after reuse permission is confirmed. The Ministry of Commerce intranet platform is an outreach/API request, not a scraper target.
6. Never treat ONS CPI as a shelf price, and never publish a national estimate as a commune/neighborhood observation.

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
