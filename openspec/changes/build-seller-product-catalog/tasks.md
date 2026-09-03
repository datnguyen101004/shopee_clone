## 1. Data model and shared contracts

- [x] 1.1 Extend the Prisma product domain with seller lifecycle and moderation-compatible state, package dimensions, controlled category attribute definitions/values, ordered option groups/values, deterministic variant-combination identity, and additive indexes/constraints.
- [x] 1.2 Create and verify the PostgreSQL migration, including safe backfill/default treatment for existing canonical dataset products, media, variants, inventory, and public lifecycle state.
- [x] 1.3 Define strict framework-neutral seller-product request/response contracts, constants, normalizers, lifecycle transitions, media URL checks, and type guards.
- [x] 1.4 Add contract tests for exact request/response shapes, category attributes, price and dimension ranges, media validation, and deterministic combination generation.

## 2. Seller product backend

- [x] 2.1 Add the seller-products NestJS module, repository, service, DTOs, Problem Details exception filter, OpenAPI documentation, and authenticated seller-role routes under `/api/v1/seller/products`.
- [x] 2.2 Implement approved-shop resolution, owner-only product reads/mutations, stable cursor pagination, and Seller Center product summaries/details without leaking another shop's products.
- [x] 2.3 Implement atomic draft create/update with active-leaf-category lookup, controlled attribute validation, normalized product slug, ordered media, dimensions, inventory, and variant persistence.
- [x] 2.4 Implement deterministic one/two-level option-combination generation and updates, global SKU and per-product combination uniqueness, referenced-variant preservation, and stock/price invariants.
- [x] 2.5 Implement guarded publish, hide, and archive lifecycle operations plus a moderation-compatible disabled state that sellers cannot override.

## 3. Buyer availability integration

- [x] 3.1 Extract a single server-authoritative public listing and purchaseability predicate for seller lifecycle, moderation, shop, category, variant, and stock state.
- [x] 3.2 Apply the predicate to catalogue/search/homepage/shop storefront/product-detail queries and verify hidden, draft, archived, and moderation-disabled products are not public.
- [x] 3.3 Apply the predicate to cart, pricing quote, and checkout so a product changed after cart addition cannot be quoted or purchased.

## 4. Seller Center UI

- [x] 4.1 Add strict frontend seller-product API clients and route-level loading, authorization, and Problem Details handling.
- [x] 4.2 Build `/seller/products` with lifecycle filters, stable pagination, product summary cards/table, create action, and empty/error states.
- [x] 4.3 Build `/seller/products/new` and `/seller/products/[productId]` editor sections for basic information, active category attributes, HTTPS media ordering, package dimensions, and draft persistence.
- [x] 4.4 Build the option-group/variant editor with deterministic combination previews and per-variant SKU, price, compare-at price, stock, weight, dimensions, and media association inputs.
- [x] 4.5 Add publish, hide, and archive controls with state-specific confirmation, inline field errors, retained failed form input, and clear moderation-disabled presentation.

## 5. Verification and documentation

- [x] 5.1 Add backend unit/integration coverage for ownership, active-shop authorization, validation, lifecycle transitions, media, category attributes, variant generation, and atomic failure behavior.
- [x] 5.2 Add public-flow regression coverage proving hidden or moderation-disabled products are absent from public reads and unavailable in cart, quote, and checkout.
- [x] 5.3 Add frontend tests for list/editor rendering, generated combinations, retained validation errors, and lifecycle controls.
- [x] 5.4 Add Playwright seller journey coverage: approved seller creates a draft, completes and publishes it, confirms public availability, then hides it and confirms buyer unavailability.
- [x] 5.5 Update `flow.md`, seller documentation, local test commands, and API verification guidance for the new Seller Center product workflow.
