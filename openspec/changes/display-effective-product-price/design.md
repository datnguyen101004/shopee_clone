## Context

See `proposal.md` for motivation and `specs/storefront-effective-product-pricing/spec.md` for observable behavior. The existing `ScheduledDiscountService` already reads active `ShopDiscountProduct` records from PostgreSQL and calculates a versioned breakdown containing base, effective, compare-at, campaign, rate, and evaluation values. Catalogue, homepage, and product detail currently enrich their own result shapes; most then overwrite `priceMinor` with the effective price, while React components continue rendering `priceMinor` directly.

This means the main calculation exists, but the relationship between the breakdown and the public display price is implicit and repeated. Representative catalogue variants are also selected from the variant order after price mutation, so a campaign can change the cheapest effective variant without changing which variant supplies the card. The change must harden these gaps without adding a migration, a new pricing engine, or any Elasticsearch dependency.

## Goals / Non-Goals

**Goals:**

- Make one effective-price invariant reusable across PostgreSQL-backed product assemblers and contracts.
- Ensure every covered UI displays the server value and never performs percentage arithmetic.
- Make representative selection, filters, facets, and explicit price sorts agree with the displayed effective price.
- Keep existing clients compatible with `priceMinor`.

**Non-Goals:**

- Changing campaign authoring, overlap rules, voucher ordering, cart quotes, checkout snapshots, or order totals.
- Adding `effectivePriceMinor` as a duplicate required top-level card property.
- Adding tables, backfills, caches, Elasticsearch documents, indexing hooks, search DSL, ML ranking, or UI redesign.

## Decisions

### 1. Keep `ScheduledDiscountService` as the only discount calculator

Each covered assembler supplies all candidate variants and one captured `evaluatedAt` value to the existing resolver. The resolver remains responsible for campaign eligibility and integer arithmetic. Presentation code consumes its result but does not repeat the formula.

Creating another catalogue-only calculator was rejected because it could drift from checkout. Calculating in React was rejected because the browser does not own campaign eligibility, time, or authoritative money.

### 2. Preserve `priceMinor` as the canonical display field

For an active campaign, assemblers set the public `priceMinor` to the resolved `effectivePriceMinor` and attach the optional `scheduledPrice` explanation. Shared validators enforce equality between them when the breakdown exists. UI code may use a small pure selector equivalent to `scheduledPrice?.effectivePriceMinor ?? priceMinor`, but it never derives a monetary value from `discountBasisPoints`.

Renaming `priceMinor` would be a breaking change across catalogue, homepage, shop, engagement, and product-detail consumers. Adding another required top-level field was rejected because two canonical prices could diverge. The nested breakdown already expresses the requested property without breaking old clients.

### 3. Resolve every sellable variant before choosing the representative offer

The catalogue path will enrich all in-stock variants with effective-price facts and then choose the lowest effective price, using the existing stable variant order or ID as a deterministic tie-breaker. The selected variant supplies `priceMinor`, comparison metadata, availability, and `scheduledPrice` together.

Choosing by base price before applying a campaign was rejected because the card could display a price higher than another purchasable variant. Mixing the price from one variant with availability or metadata from another was rejected as misleading.

### 4. Apply price-dependent operations after effective-price enrichment

Catalogue facets, price filters, and price sorting continue operating on card `priceMinor`, but card construction now guarantees that value is the representative effective price. This preserves the current query and response contracts while aligning observable ordering with display.

Adding a separate promotion-aware filter pass was rejected because it would duplicate the canonical card price. Performing any price operation on raw PostgreSQL variant order was rejected because it produces mismatched results during campaigns.

### 5. Capture one evaluation instant per public response

Each catalogue, shop, homepage, or product-detail request captures `new Date()` once at the application-service boundary and passes it through every resolver call used to assemble that response. Tests inject or match a fixed instant where deterministic campaign-boundary behavior matters.

Calling the clock separately per product was rejected because a response assembled across a campaign boundary could contain internally inconsistent prices.

### 6. Centralize presentation selection without centralizing surface ownership

A framework-neutral contract validator owns field invariants, while a small frontend pricing selector owns the choice of which server-provided value to render. Existing catalogue, homepage, shop, and product-detail components retain their layouts and surface-specific markup.

Building a new shared visual price component was rejected because the surfaces have different markup and this task does not authorize a UI redesign. Duplicating the effective-price selection expression in every component was rejected because it is easy to omit on a later surface.

### 7. Do not silently guess prices on PostgreSQL failure

Normal non-campaign states return the stored base price. A genuine PostgreSQL/resolver failure follows the existing API error path rather than silently pretending no campaign exists; checkout remains independently authoritative when a purchase is attempted.

Falling back to raw base prices on database errors was rejected because it can display a price inconsistent with an active campaign. Elasticsearch fallback is irrelevant to this change because Elasticsearch is never called.

## Risks / Trade-offs

- **[Existing consumers may assume `priceMinor` means stored base price]** → Preserve response shape, document it as the current displayed price, and add contract/component regression tests.
- **[Campaigns can reorder representative variants]** → Resolve all bounded product variants first and use deterministic tie-breaking.
- **[Repeated surface assemblers can drift]** → Reuse the resolver, shared invariant validation, and frontend price selector; cover every named surface with tests.
- **[Additional campaign lookup work can affect catalogue latency]** → Keep the existing batched product-ID lookup and prohibit per-product or per-variant queries.
- **[Time-boundary tests can be flaky]** → Pass a single captured UTC instant and use fixed test clocks/fixtures.

## Migration Plan

1. Tighten shared price-breakdown and product-card invariant tests without changing the public JSON shape.
2. Refactor PostgreSQL assemblers to resolve all relevant variants at one request instant and select representatives by effective price.
3. Route covered frontend price displays through the shared server-value selector and add component tests.
4. Run focused PostgreSQL integration tests for campaign states, price filters/facets/sorts, and cross-surface parity.
5. Roll back by reverting the presentation/selection refactor; no data rollback, index operation, or Elasticsearch cleanup is required.
