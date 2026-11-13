# Kenz: real household costs + peer-to-peer community

## Product outcome

Kenz should answer two questions, not just suggest a meal:
1. What will each meal, shopping basket, clothing need, and household service cost in my wilaya?
2. Can I discover, publish, follow, and share practical ideas without Kenz becoming a large media-hosting platform?

All monetary estimates must be traceable to a dated observation. Never turn a missing price into a guessed price.

## Work completed in this branch

- The family meal planner now requests public market aggregates for its supported ingredient catalog and displays a per-ingredient estimate and meal total.
- It only calculates a line when both the product mapping and measurement unit are compatible. Missing prices and incompatible units remain visibly unpriced; partial totals are marked with a lower-bound indicator.
- It uses the user's wilaya code and the existing local cache/offline fallback in `priceStore`.
- Community posts now have a WhatsApp share action that sends a text recipe/list summary. This is a share/export action, not a claim that WhatsApp exposes its private transport protocol or that Kenz stores media.

## Phase 1 — finish dependable meal and shopping prices

1. Normalize every recipe ingredient against the canonical product catalog (including Arabic, French, and English aliases).
2. Standardize units end-to-end: kg, litre, and piece; store quantities as integer milli-units; convert only compatible units. Add explicit gram-per-piece conversions only when backed by a verified recipe/catalog specification.
3. Price each planned meal for the selected serving count, each planned day, and the full month. Show ingredient line costs, subtotal, cost per serving, and an uncertainty band (P25 / median / P75).
4. Price the shopping list after subtracting pantry stock. Show the missing-price count and priced coverage so a partial subtotal is never mistaken for a full bill.
5. On every displayed price show observation date, area level (commune/wilaya/national), observation count, contributor count, source tier, and freshness. Flag stale or thin data.
6. Add receipt-based user contributions and merchant-confirmed price lists to a moderation queue. Require consent, deduplicate, rate-limit, and do not publish personal identities.
7. Add tests for quantity scaling, unit conversions, missing prices, stale observations, zero pantry stock, and household servings.

## Phase 2 — clothing and services price intelligence

Create separate canonical catalogs rather than forcing services into food units.

- Clothing: item, size/age range, quality/brand tier, new/second-hand, season, and price range (e.g. trousers, school uniform, shoes, coat).
- Services: service type, unit (visit/hour/job/month), locality, provider verification, and quoted amount (e.g. tailoring, plumbing, appliance repair, transport, tutoring).
- Each observation must include wilaya/commune, currency, observed date, source, seller/provider type, and optional notes. Do not collect a home address or publish a contributor's phone number.
- Show median and range only when the minimum independent observations threshold is met; otherwise label it as a single quote, not a market average.
- Add comparison cards and let a user save a planned household need with a dated price estimate. Keep actual spending separate from estimates.

## Phase 3 — Kenz community: short-form discovery, not a media warehouse

### Feed and creator channels
- Vertical, swipeable cards for recipes, meal-prep clips, household tips, and price-saving ideas.
- Creator channel pages, follow/unfollow, categories, searchable tags, and a feed filtered by wilaya or topic.
- Recipe posts keep structured ingredients, portions, steps, and a computed price card; the media is optional.
- Start with photos and short clips, upload/transfer limits, lazy loading, thumbnails, and a low-data mode.

### Peer-to-peer media transfer
WhatsApp's end-to-end encrypted transport is not a public transport API for third-party apps. Kenz must not pretend to reuse WhatsApp's internal protocol.

Use two honest sharing paths:
1. WhatsApp share intent for text, recipe cards, and ordinary shareable links (already added for community posts).
2. WebRTC DataChannels for optional direct device-to-device photo/clip transfer. Use Supabase Realtime only for short-lived offer/answer/ICE signaling, authenticate both peers, expire sessions quickly, and avoid persisting media blobs. Use a public STUN server for connection discovery and an optional TURN relay only as a connectivity fallback; disclose that TURN can relay data. If no direct connection is possible, fall back to WhatsApp's own share sheet or a normal opt-in upload.

Do not build an always-on background relay or silently transfer files. Require an explicit sender action and receiver acceptance. Show file size, estimated data use, transfer progress, cancel, and expiry. Keep media in temporary app cache only and clear it after transfer/expiry. Small metadata (caption, creator, timestamps, moderation state, content hash) can remain in the database.

### Safety, moderation, and privacy
- Report, block, delete, rate limits, spam detection, and human moderation before broad discovery.
- Validate file type/size, strip EXIF location metadata, scan uploaded files if any, and never expose private profile identifiers.
- No public phone numbers, home locations, private financial data, or automatic contact-book uploads.
- Provide age-appropriate defaults and restrict direct messaging/unknown-person contact. The feed is public content discovery, not a private chat feature.

## Phase 4 — growth and later monetization

- Let creators share a channel/profile link and recipe cards outside Kenz; use opt-in follows and topic subscriptions to build an audience.
- Measure only privacy-respecting aggregate metrics: views, saves, shares, follows, and recipe completion feedback.
- Monetization is deliberately later: clearly labelled sponsored recipe placements or local merchant promotions, with creator consent and transparent disclosure. Do not sell personal budget, household, or location histories; do not introduce targeted financial ads or pay-to-rank price observations.
- Keep core meal planning, price comparisons, and community browsing usable in the free tier. Validate moderation and user trust before monetization.

## Release gates

- Meal costs: every displayed amount is reproducible from source observations and tested unit conversions; incomplete totals are explicit.
- Clothing/services: source/date/area and quote-vs-market distinction is visible.
- P2P: transfer works between two real Android devices on different networks, with consent, cancellation, timeout, and fallback tests; no media blob is written to Supabase.
- Community: moderation, blocking, deletion, privacy, low-bandwidth and accessibility checks pass.
- Only after those gates: produce and test a signed/release APK.

## Live blocker found during implementation

A read-only check of the connected production project on 13 Nov 2026 found 83 catalog products, 30 price observations (all pending, observed 2–4 Nov 2026), zero approved observations, and zero rows in `price_stats`. This is why the live price RPC returns no prices.

The scheduled GitHub Actions ingestion run on 12 Nov 2026 failed before scraping because `SUPABASE_SERVICE_ROLE_KEY` was empty/not configured. The push-triggered run on 13 Nov passed its scraper dry-run, but correctly skipped database writes. Its workflow log confirms the missing secret. The source adapters themselves have a separate dry-run success path; no production price rows were written during this check.

**Required operator step:** add the Supabase service-role secret to the repository's GitHub Actions secrets (never to Vite env vars, source code, or an APK), then rerun the scheduled/manual ingestion path. Keep the review gate: new observations must remain pending until a moderator checks them. After approval, refresh `price_stats` and verify `get_area_prices` returns current DZD values. Do not approve the existing 30 pending rows in bulk without checking their provenance, dates, units, and source records.
