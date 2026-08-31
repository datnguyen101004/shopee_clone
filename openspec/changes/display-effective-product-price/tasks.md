## 1. Price contract and presentation invariants

- [x] 1.1 Add a shared pure selector that returns `scheduledPrice.effectivePriceMinor` when a valid scheduled breakdown exists and otherwise returns top-level `priceMinor`, without calculating a discount amount in the client.
- [x] 1.2 Tighten catalogue, homepage, and product-detail contract validation so `priceMinor` equals `scheduledPrice.effectivePriceMinor` whenever scheduled pricing is present.
- [x] 1.3 Add contract tests for base-price responses, valid scheduled-price responses, mismatched effective/display prices, unsafe integers, invalid comparison prices, and invalid campaign metadata.

## 2. PostgreSQL-backed effective-price assembly

- [x] 2.1 Refactor catalogue scheduled-price enrichment to resolve all candidate variants in one PostgreSQL-backed batch using one captured UTC evaluation instant.
- [x] 2.2 Select the representative in-stock variant after effective-price enrichment by lowest effective price with a deterministic tie-breaker, keeping price, stock, compare-at, and campaign metadata from the same variant.
- [x] 2.3 Verify catalogue minimum/maximum filters, price-range facets, and `price-asc`/`price-desc` ordering operate on the effective `priceMinor` exposed by the selected variant.
- [x] 2.4 Align homepage product assembly with the same display-price, compare-at, scheduled-breakdown, and single-evaluation-instant invariants.
- [x] 2.5 Align public-shop catalogue assembly with the catalogue effective-price path instead of reading or reconstructing raw variant base prices separately.
- [x] 2.6 Align product-detail variant assembly with the same effective-price and comparison-price invariants for every sellable variant.
- [x] 2.7 Preserve normal base-price fallback for absent/inactive/invalid campaigns while allowing genuine PostgreSQL pricing failures to follow the existing API error path.

## 3. Buyer-facing effective-price display

- [x] 3.1 Route catalogue/search card price rendering through the shared server-value selector while preserving existing markup, currency formatting, comparison price, and discount label behavior.
- [x] 3.2 Route homepage and public-shop product card price rendering through the same selector without changing module composition or layout.
- [x] 3.3 Route selected product-detail variant price rendering through the same selector and update the displayed value when the buyer changes variants.
- [x] 3.4 Add component tests proving each covered surface displays the supplied effective price, falls back to base price without a campaign, and never derives a monetary price from `discountBasisPoints`.

## 4. PostgreSQL verification and scope guards

- [x] 4.1 Add catalogue service tests where a campaign changes the representative variant and changes price filtering, facet bounds, and ascending/descending ordering.
- [x] 4.2 Add homepage, public-shop, and product-detail service tests for active, disabled, archived, future, expired, and invalid effective-price cases at fixed UTC instants.
- [x] 4.3 Add a focused PostgreSQL integration test that creates a scheduled campaign and verifies cross-surface price, comparison, campaign, and evaluation metadata consistency without modifying stored variant `priceMinor`.
- [x] 4.4 Add a regression check proving the covered flow does not require or invoke the Elasticsearch client, index, mapping, or search feature flag.
- [x] 4.5 Run relevant formatting, lint, typecheck, contract tests, API unit/integration tests, frontend component tests, and production builds; record any unrelated pre-existing failures separately.
