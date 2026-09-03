## 1. Shared buyer-price contracts

- [x] 1.1 Add `buyer-best-price-v1` applied-voucher, merchandise-preview, and nullable shipping-preview contract types using safe integer VND fields.
- [x] 1.2 Add strict validators that reconcile effective price, shop/platform discounts, merchandise payable, shipping discount, shipping payable, and estimated payable.
- [x] 1.3 Add a shared display selector that prefers validated authenticated `merchandisePayableMinor` and otherwise returns the scheduled effective product price.
- [x] 1.4 Extend catalogue, homepage, engagement, and product-detail product shapes with the optional preview while preserving the `priceMinor = scheduledPrice.effectivePriceMinor` invariant.
- [x] 1.5 Add contract tests for guest fallback, valid merchandise-only preview, address-aware shipping preview, unsafe values, inconsistent sums, invalid versions, and malformed voucher evidence.

## 2. Optional buyer context and response privacy

- [x] 2.1 Add a reusable optional-buyer request context that resolves valid authenticated sessions without requiring login for public product endpoints.
- [x] 2.2 Pass optional buyer identity through catalogue/search, homepage, public-shop, product-detail, favorites, and recently-viewed application boundaries.
- [x] 2.3 Apply private/no-store cache headers to personalized responses while retaining existing guest response behavior.
- [x] 2.4 Add endpoint tests for guest access, valid buyer personalization context, invalid/expired optional credentials, and cross-buyer cache isolation.

## 3. Pure best-voucher optimization

- [x] 3.1 Define framework-free product-preview input facts for one scheduled-price variant, one unit, one shop, optional shipping, voucher definitions, scopes, and usage.
- [x] 3.2 Reuse the existing voucher eligibility and exact integer allocation rules to evaluate one legal shop/platform/shipping combination without writing usage.
- [x] 3.3 Generate bounded combinations including the all-null fallback and enforce configurable candidate and combination ceilings.
- [x] 3.4 Implement the deterministic winner comparator: merchandise payable, address-aware estimated payable, total saving, then canonical voucher tuple.
- [x] 3.5 Add table-driven tests for fixed/percentage/capped discounts, shop-before-platform residuals, product scope, minimum spend, usage limits, shipping caps, input-order independence, and equal-price tie-breaking.
- [x] 3.6 Add tests proving the optimizer never raises price, never mutates facts, and never creates voucher usage or redemption writes.

## 4. Batched PostgreSQL preview facts

- [x] 4.1 Add a pricing-owned repository query that loads relevant shop, platform, and shipping voucher definitions for a bounded product/shop set in batches.
- [x] 4.2 Batch-load voucher product scopes, global availability, and current buyer usage without exposing internal counters in public results.
- [x] 4.3 Resolve the buyer's usable default address once per response and load required shop-origin and variant-weight facts.
- [x] 4.4 Produce quantity-one `STANDARD` shipping estimates only when every required address/origin/weight fact is valid.
- [x] 4.5 Add a preview orchestration service that combines scheduled prices, batched facts, optimizer results, and one captured UTC instant.
- [x] 4.6 Add a default-off local feature flag, candidate limits, combination limits, and sanitized fallback reason instrumentation.
- [x] 4.7 Add repository/service tests for active, disabled, future, expired, exhausted, buyer-used, wrong-shop, wrong-product, no-address, and incomplete-shipping cases.
- [x] 4.8 Add query-count tests proving collection enrichment performs no voucher, usage, address, or shipping query per product card.

## 5. Catalogue, search, and public-shop integration

- [x] 5.1 Enrich every eligible catalogue candidate after scheduled pricing and before personalized price-dependent operations.
- [x] 5.2 Keep representative variant, effective price, voucher evidence, stock, comparison price, and shipping facts from one coherent variant preview.
- [x] 5.3 Make authenticated minimum/maximum filters, price facets, and ascending/descending sorts use displayed merchandise payable when preview exists.
- [x] 5.4 Preserve exact existing effective-price behavior for guests and authenticated preview fallback.
- [x] 5.5 Route public-shop summaries and paginated shop products through the same batched preview path.
- [x] 5.6 Add catalogue/shop tests where shop and platform vouchers change filter boundaries, facet bounds, sort order, and deterministic pagination.

## 6. Homepage, detail, related, and engagement integration

- [x] 6.1 Batch-enrich all homepage product modules once per response without changing curated module composition or order.
- [x] 6.2 Enrich every product-detail variant and recompute the selected variant preview when the buyer changes variants.
- [x] 6.3 Enrich related-product cards through the canonical buyer preview path rather than a separate price calculation.
- [x] 6.4 Enrich favorites and recently-viewed products in bounded batches while retaining their existing eligibility and ordering rules.
- [x] 6.5 Add cross-surface service tests proving equivalent buyer/product/address/evaluation facts produce identical merchandise and voucher evidence.
- [x] 6.6 Add fallback tests proving optional preview failures preserve effective prices on homepage, detail, related, favorites, and recently viewed.

## 7. Cart and checkout automatic best selection

- [x] 7.1 Extend cart quote orchestration so empty voucher slots are auto-filled from the best eligible combination for actual selected lines and quantities.
- [x] 7.2 Preserve explicit buyer-entered voucher codes as slot constraints while optimizing remaining unfilled shop, platform, and shipping slots.
- [x] 7.3 Allow merchandise best-voucher calculation without an address and prohibit shipping voucher claims until a usable address and shipping quote exist.
- [x] 7.4 Recalculate the canonical chosen set inside checkout and atomically consume only vouchers still eligible in the purchase transaction.
- [x] 7.5 Add parity tests where quantity, multiple products, multiple shops, address, shipping service, caps, or minimum spend make cart results differ legitimately from quantity-one previews.
- [x] 7.6 Add transactional tests for expiry/limit races, explicit overrides, idempotent retries, and zero consumption during product browsing or cart preview.

## 8. Buyer-facing rendering

- [x] 8.1 Update catalogue/search and public-shop cards to use the shared buyer-price selector and label voucher-adjusted values as best estimated merchandise price.
- [x] 8.2 Update homepage, related-product, favorites, and recently-viewed cards with the same selector and compact applied-voucher evidence.
- [x] 8.3 Update product detail to show selected-variant merchandise payable plus a separate address-aware standard-shipping and shipping-voucher estimate.
- [x] 8.4 Keep cart/checkout line merchandise payable, shipping payable, applied voucher breakdown, and final total visibly separate and server-confirmed.
- [x] 8.5 Ensure seller/admin product prices and historical order/return/purchase screens remain unchanged.
- [x] 8.6 Add component tests for guest, authenticated merchandise-only, address-aware shipping, variant switching, manual cart override, stale preview, and invalid-preview fallback states.

## 9. PostgreSQL, privacy, performance, and release verification

- [x] 9.1 Add PostgreSQL integration fixtures covering one scheduled campaign plus competing shop, platform, and shipping vouchers with buyer usage and product scopes.
- [x] 9.2 Verify guest effective price, authenticated best merchandise price, no-address shipping omission, address-aware shipping, cross-surface parity, and unchanged stored variant base price.
- [x] 9.3 Verify personalized browsing creates no voucher usage/redemption and checkout consumes the recalculated winning set exactly once.
- [x] 9.4 Add regression checks proving no buyer, address, voucher, usage, or personalized price data is written to or requested from Elasticsearch.
- [x] 9.5 Benchmark a 48-card local PostgreSQL response, enforce bounded combinations, and meet the 75 ms additional authenticated p95 target or record an approved adjustment.
- [x] 9.6 Run formatting, lint, typecheck, contracts, API unit/integration tests, frontend components, focused browser tests at 360/768/1440, and production builds.
- [x] 9.7 Document preview-versus-final semantics, quantity-one assumptions, automatic versus explicit voucher selection, shipping-address behavior, feature flags, metrics, and rollback.

## 10. Seller self-purchase prevention

- [x] 10.1 Reject own-shop products in cart mutation, pricing, and checkout without creating cart or purchase writes.
- [x] 10.2 Show a dismissible warning dialog for blocked Add to cart and Buy now actions.
- [x] 10.3 Add focused backend and frontend tests for the new guard and dialog.
