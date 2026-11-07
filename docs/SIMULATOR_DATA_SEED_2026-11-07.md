# Simulator public-price seed — 7 November 2026

## Status

- Supabase project: Kenz
- Source: Algerian Ministry of Agriculture, daily Mercuriale bulletins
- Bulletins transcribed: 2 November 2026 and 4 November 2026
- Observations staged: 30 (15 catalog products × 2 bulletin dates)
- Geography: national averages only; no wilaya, commune, or neighborhood location is inferred
- Currency and storage: DZD, stored as integer centimes per catalog base unit
- Review status: **pending moderator review**; no public aggregate is published by this seed

## Included catalog products

Potato, tomato, dry onion, garlic, carrot, turnip, bell pepper, hot pepper, zucchini, green beans, lettuce, local apple, local beef, broiler chicken, and eggs.

The generic date entry in the bulletins was intentionally excluded because the catalog's date product is specifically Deglet Nour. Cow milk was also excluded because the bulletin does not establish the sachet packaging represented by the current catalog product.

## Source documents

- 2 November 2026: https://madr.gov.dz/wp-content/uploads/2026/11/prix_02_Nov_2026_MADRP.pdf
- 4 November 2026: https://madr.gov.dz/wp-content/uploads/2026/11/prix_04_Nov_2026_MADRP.pdf

The bulletin's national retail average column was used, not its minimum or maximum column. Values were converted from DA to integer centimes without changing the stated observation date.

## Moderation and quality

All 30 records carry official-bulletin, manual-transcription, and awaiting-moderator-review flags. They remain pending because Kenz's review RPC requires an authenticated community moderator. The simulator's public price RPC only reads accepted observations; therefore the seed does not yet appear as a public market-price aggregate. After moderator approval, refresh the 14-day price statistics. With two observations per product, the simulator will correctly flag these starter estimates as thin until more daily bulletins or verified local observations are accepted.

No ONS CPI values, classifieds, inferred prices, or synthetic observations were used.
