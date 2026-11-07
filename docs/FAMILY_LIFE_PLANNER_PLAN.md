# Family Life Planner — مخطط ميزانية الأسرة

**Product area:** Kenz → Planning  
**Status:** Approved product plan; implementation starts with the foundation in this change.  
**Principles:** free-first, offline-capable, privacy-preserving, editable by the household, and integrated with Kenz's existing lavender design.

## Product goal

Expand the current household simulator into a practical monthly planner for the normal needs of a family—not only food prices. It should help a household plan income, essential obligations, meals, groceries, clothing, cleaning and hygiene, transport, education, healthcare, home upkeep, savings, and unexpected costs in one coherent budget.

The planner must never silently decide what a family should spend. It may propose a transparent draft, but users control categories, priorities, amounts, household details, and every generated list.

## Main capabilities

### 1. Family profile and budget engine
- Household size and optional member profiles (adults, children, dependants).
- Monthly income sources, pay dates, fixed bills, debts, savings goals, and emergency reserve.
- Flexible categories and subcategories with editable planned amounts and priorities.
- Budget balancing that clearly reports surplus or shortfall.
- Planned-versus-actual tracking and remaining amounts.
- Monthly rollover and recurring expenses, with explicit user confirmation for changes.

### 2. Daily meal and recipe planner
- Breakfast, lunch, dinner, and optional snacks for each day.
- Weekly and monthly calendars with serving counts based on household settings.
- Ingredient quantities, preparation steps, estimated cost, and per-serving cost.
- Affordable substitutions using available pantry items and locally relevant ingredients.
- Recipe import from community shares, with attribution and an option to save a private copy.
- Recipe ratings, tags (budget, quick, seasonal, vegetarian, etc.), and moderation/reporting.
- Recipes remain suggestions; users can replace or skip any meal.

### 3. Grocery and pantry manager
- Build a consolidated shopping list from chosen meals and household staples.
- Merge duplicate ingredients and subtract quantities already in pantry inventory.
- User-editable quantities, units, categories, and purchase status.
- Estimated prices with source, observation date, and freshness/reliability clearly visible.
- Mark uncertain or missing prices as estimates—never present them as verified current prices.
- Suggest cheaper alternatives only when the substitution is sensible and clearly explained.

### 4. Clothing planner
- Optional family-member clothing needs by season, school/work, and occasion.
- Plan essentials such as everyday clothes, shoes, jackets, school clothing, and replacement items.
- User-defined replacement timing, priorities, and spending caps.
- Track planned purchases separately from actual purchases; no assumptions about gender or required quantities.

### 5. Cleaning and personal hygiene
- Household cleaning supplies, laundry, dishwashing, bathroom cleaning, and home-care consumables.
- Personal hygiene and care essentials, managed privately by the household.
- Estimate replenishment from user-entered stock and usage; allow manual overrides.
- Recurring reminders are optional and must work without paid services.

### 6. Other family needs
- Transport and fuel, education and school supplies, healthcare/pharmacy, home maintenance, communications, subscriptions, and unexpected expenses.
- Custom categories for needs not covered by defaults.
- Recurring expense templates and due dates, with local notifications where supported.

### 7. Community sharing
- Import community recipes and practical household ideas into a private plan.
- Share an individual recipe or tip only after an explicit user action.
- Community content must not include household income, balances, member profiles, private lists, or purchase history.
- Provide attribution, reporting, moderation, and safe handling of untrusted user submissions.
- Core planning remains useful without an account or network connection.

## Main user journey

1. Set household size and optional preferences.
2. Enter income, fixed obligations, debts, and savings goals.
3. Review and edit a proposed category budget.
4. Create a monthly meal calendar from built-in or community recipes.
5. Generate one consolidated grocery list, deducting pantry stock.
6. Add clothing, cleaning, hygiene, education, transport, and other needs.
7. Review the complete monthly plan; resolve any deficit by editing priorities and amounts.
8. Track actual spending and stock changes during the month.
9. Review the month and carry forward only the items the user chooses.

## Budget categories (editable defaults)

- Housing and utilities
- Food and groceries
- Cleaning and household supplies
- Personal hygiene
- Clothing and footwear
- Transport
- Education and childcare
- Healthcare
- Communications and subscriptions
- Home maintenance
- Debt payments
- Savings and emergency reserve
- Other / custom

These are starter categories, not prescribed percentages. The app must not impose a sample allocation as financial advice.

## Data model direction

Use explicit household-scoped records and stable IDs. Keep planned amounts, actual transactions, pantry stock, meal plans, recipes, shopping-list items, and recurring expenses distinct so they can be edited and synchronized safely.

Community recipe records are public/shareable only after explicit publication and moderation. Household budgets, income, expenses, member details, inventory, and shopping history are private by default and must never be included in community payloads.

For offline-first behavior, persist local edits immediately, queue sync operations, and make conflict resolution visible and deterministic. Do not silently overwrite newer edits from another device.

## Implementation phases

### Phase 1 — Budget foundation
- Audit current Planning/simulator code and reuse existing models and persistence.
- Add flexible family budget categories, income, fixed expenses, savings goals, planned/actual amounts, and deficit/surplus calculation.
- Add validation, currency-safe integer minor units (DZD centimes where appropriate), and tests.
- Preserve current simulator behavior and existing design.

### Phase 2 — Meals and recipes
- Meal calendar, recipe model, serving scaling, ingredient aggregation, cost estimates.
- Community recipe import/share flow with attribution, reporting, and moderation.
- Offline recipe browsing for saved content.

### Phase 3 — Grocery and pantry
- Consolidated shopping list, duplicate merging, pantry deduction, purchase tracking.
- Price provenance and freshness indicators, with explicit estimate states.

### Phase 4 — Clothing, cleaning, hygiene, and other needs
- Seasonal clothing plans, household consumables, replenishment, and custom needs.
- Recurring expenses and optional reminders.

### Phase 5 — Dashboard, sync, and quality
- Monthly overview, planned-versus-actual charts, remaining budget, and actionable alerts.
- Offline and multi-device conflict tests, privacy review, accessibility, Arabic/French localization.
- Full regression tests and Android APK build.

## Acceptance criteria

- Existing simulator and Planning features continue to work.
- A household can create and edit a complete monthly budget across all listed needs.
- The plan visibly identifies surplus/shortfall and never silently changes user allocations.
- Meal plans generate accurate, editable ingredient quantities and consolidated lists.
- Pantry stock reduces suggested purchases without creating negative quantities.
- Price estimates show provenance and observation date; stale/missing prices are not represented as live facts.
- Community imports never expose private household financial or family data.
- Core functions work offline; sync conflicts are not silently destructive.
- Free functionality only: no paid API, subscription, or mandatory paid service.
- Automated tests cover calculations, edge cases, persistence, privacy boundaries, and regression behavior.

## UX and localization

- Integrate into the existing Kenz Planning area; do not create a disconnected second app.
- Retain the current enhanced lavender visual system and improve hierarchy with clear category icons.
- Support Arabic RTL and French, with English as appropriate to the current app.
- Use Algerian DZD as the default display currency while allowing future currency configuration.
- Use inclusive, user-editable labels and avoid assumptions about family structure or spending habits.

## Non-goals / guardrails

- No paid data feeds or paid AI dependencies.
- No fabricated or guaranteed current market prices.
- No public exposure of private family finances.
- No forced budget percentages or prescriptive lifestyle rules.
- No automatic purchases or external sharing without explicit user action.


## Implementation progress — 2026-11-07

### Delivered to the main branch (implementation stage; runtime verification pending)

- Added the family budget foundation to Kenz Planning, with monthly household income, adult/child counts, 13 editable envelopes, planned-versus-actual amounts, and surplus/shortfall calculations.
- Added month-specific offline storage, user scoping, strict amount validation, and safe-integer overflow checks.
- Added a family meal calendar with five starter recipes, recipe instructions, serving scaling, and an optional seven-day lunch/dinner suggestion action that does not overwrite existing meals.
- Added a consolidated grocery list that merges repeated ingredients and subtracts pantry stock.
- Added Arabic/French/English ingredient aliases for common starter ingredients so pantry entries can match recipe ingredients across those languages.
- Added pantry stock entry and removal.
- Added a detailed monthly needs list for clothing, cleaning, hygiene, school, transport, health, home maintenance, and custom needs, including optional family-member assignment, due date, planned amount, and actual amount.
- Added manual recipe JSON import/export. Imported recipes are private and saved in a user-level local library so they remain available across planning months.
- Added domain tests for calculations, recipe scaling, shopping aggregation, pantry deductions, validation, legacy-plan migration, and overflow cases.
- Added a GitHub Actions quality workflow to run tests, TypeScript checks, and the web build on relevant changes.

### Remaining before calling the family planner complete

- Confirm the new CI workflow passes; no successful run has yet been verified in this delivery.
- Build and install-test the Android APK, including Arabic RTL and small-screen layouts.
- Implement a moderated, online community recipe feed; current share/import is manual JSON and does not publish household data.
- Add price-backed recipe costing only when a dated, trustworthy price observation exists; do not invent live prices.
- Add richer clothing season/size/replacement planning and recurring cleaning/hygiene replenishment.
- Connect detailed purchase lines to budget envelopes with a clear single-counting model.
- Complete privacy, offline, and multi-device synchronization tests before enabling family-data sync.
