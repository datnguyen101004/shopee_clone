## Why

The PostgreSQL pricing resolver already calculates scheduled campaign prices, but buyer-facing components still render the generic `priceMinor` field and the invariant tying it to `scheduledPrice.effectivePriceMinor` is not explicit across every product surface. This change makes the effective price the unambiguous displayed, filtered, and sorted price before Elasticsearch is introduced, preventing raw variant base prices or duplicate client-side discount calculations from leaking into the storefront.

## What Changes

- Resolve active scheduled product campaigns exclusively through the existing PostgreSQL-backed `ScheduledDiscountService` at the server boundary.
- Make catalogue/search cards, homepage product cards, public-shop cards, and product-detail variants display `scheduledPrice.effectivePriceMinor` when a valid active campaign exists and otherwise display the existing base `priceMinor`.
- Preserve the current public contracts: top-level `priceMinor` remains the canonical displayed price and SHALL equal `scheduledPrice.effectivePriceMinor` whenever `scheduledPrice` is present; no duplicate top-level effective-price field is added.
- Keep `compareAtPriceMinor` greater than the displayed effective price and derive discount labels from server-authoritative campaign data.
- Apply price filters, price facets, representative-offer selection, and price sorting to the same effective price shown to the buyer.
- Evaluate all campaign prices in one response against a single server-generated UTC instant and fall back to the base price when a campaign is absent, disabled, archived, not started, expired, or produces an invalid effective price.
- Add contract, backend, frontend, and focused PostgreSQL integration tests covering active/inactive boundaries, multi-variant products, display consistency, and effective-price sorting/filtering.
- Exclude Elasticsearch documents, indexing, search DSL, personalized ranking, database schema changes, seller campaign management, vouchers, cart totals, and checkout calculations from this change.

## Capabilities

### New Capabilities

- `storefront-effective-product-pricing`: Defines server-authoritative PostgreSQL effective-price resolution and consistent buyer-facing display, filtering, facets, representative-offer selection, and sorting behavior.

### Modified Capabilities

None. The existing seller-promotion and product-discovery behavior is recorded only in unsynchronized change artifacts, so this change introduces a focused capability instead of claiming to modify a missing main spec.

## Impact

- **Backend:** Catalogue, homepage, public-shop, and product-detail assemblers continue using the centralized scheduled-discount resolver and gain explicit effective-price consistency checks.
- **Contracts:** Existing `priceMinor`, `compareAtPriceMinor`, `discountPercent`, and `scheduledPrice` shapes remain compatible; validators enforce their relationship more strictly where needed.
- **Frontend:** Existing product price components select the server-provided effective price without recalculating discounts or adding a UI/UX redesign.
- **Persistence:** Reads existing PostgreSQL variant and scheduled-campaign records; no migration or new table is required.
- **Search:** The current PostgreSQL catalogue path uses effective price for price-dependent behavior. Elasticsearch and T34 indexing remain untouched.
- **Quality:** Adds deterministic unit, component, contract, and focused PostgreSQL tests for price correctness and campaign time boundaries.
