## 1. Shared Product-Detail Contract

- [x] 1.1 Define framework-neutral product identity, gallery media, flat variant offer, stock, shop, shipping-preview, related-card, and complete product-detail response types.
- [x] 1.2 Encode explicit `purchasable`, `initialVariantId`, variant `availableQuantity`/availability, preferred-image, safe integer money, and valid comparison-price/discount invariants.
- [x] 1.3 Add conservative runtime parsing that rejects malformed IDs, media associations, unsafe money/stock, inconsistent initial selection, invalid promotions, broken internal links, and malformed related cards.
- [x] 1.4 Export the product-detail contract independently from catalogue-list parsing and reuse the existing `CatalogProductCard` type only for eligible related items.
- [x] 1.5 Add contract tests for populated, no-media, product-wide unavailable, empty-related, and malformed response variants.

## 2. Variant Media Persistence and Seed Facts

- [x] 2.1 Extend Prisma so a product image can optionally reference a variant of the same product through a database-enforced composite relationship while generic images remain backward compatible.
- [x] 2.2 Generate and review an additive migration containing the nullable column, indexes/uniqueness, composite foreign key, and safe delete behavior without modifying earlier migrations.
- [x] 2.3 Extend deterministic seed data with ordered generic/variant gallery media, multiple gallery entries, and one active zero-available-stock variant while retaining list-displayable products.
- [x] 2.4 Update seed writes and expected counts so repeated seeding is idempotent and variant media associations remain stable.
- [x] 2.5 Extend persistence verification for gallery order, same-product relations, cross-product rejection, unavailable inventory facts, and every existing T08/T09 relation/constraint assertion.
- [x] 2.6 Recreate an isolated PostgreSQL schema, deploy migrations twice, seed twice, and prove the migration plus updated seed facts from an empty database.

## 3. NestJS Detail Read Pipeline

- [x] 3.1 Extract shared catalogue eligibility, representative-offer, safe-money, promotion, and card mapping helpers without changing T09 list/search behavior.
- [x] 3.2 Add strict canonical UUID parsing and typed invalid/not-found/unavailable data-source errors that map to sanitized `400`, `404`, and `503` Problem Details.
- [x] 3.3 Add repository queries for one public product with ordered media/active variants/inventory/shop/category facts, active shop-product count, and bounded same-category related candidates.
- [x] 3.4 Map ordered gallery items and each representable flat variant with authoritative price, valid discount, available quantity, availability, and deterministic preferred-image fallback.
- [x] 3.5 Compute `purchasable` and `initialVariantId` with price/ID ordering while retaining honest zero-stock variants and excluding inactive/deleted/unsafe offers.
- [x] 3.6 Build server-owned shop/rating/sales and non-binding anonymous shipping context without claiming review, order, address, carrier, or reservation authority.
- [x] 3.7 Map at most six related T08-displayable cards after eligibility, excluding the current product and retaining `createdAt DESC, id ASC` order.
- [x] 3.8 Expose anonymous no-store `GET /api/v1/catalog/products/:productId` without changing the existing list endpoint.
- [x] 3.9 Add focused repository/service tests for public eligibility, media fallback, variant prices/discounts/stock, initial selection, unavailable products, shop count, shipping context, related limits, and stable ordering.
- [x] 3.10 Add Supertest coverage for success, malformed UUID, every hidden-product cause, product-wide unavailability, no-media fallback, no-store headers, and sanitized data-source failures.

## 4. Real PostgreSQL Detail Verification

- [x] 4.1 Add a guarded PostgreSQL Supertest suite proving seeded generic/variant media, flat variant resolution, available-quantity calculation, initial selection, and related-product exclusion/order.
- [x] 4.2 Verify draft/archived/deleted products plus inactive shops/categories and inactive/deleted variants never leak through real database state fixtures.
- [x] 4.3 Verify a public product remains readable but non-purchasable when all active variant inventory is unavailable, with purchase-related fields internally consistent.
- [x] 4.4 Verify the database rejects an image association to a variant owned by another product and accepts generic or same-product associations.
- [x] 4.5 Restore every mutating fixture in `finally` blocks and keep real database tests restricted to the isolated product-detail runner.

## 5. Next.js Detail Adapter and Route States

- [x] 5.1 Build a server-only product-detail adapter with canonical URL construction, short timeout, `cache: no-store`, runtime parsing, and typed not-found/timeout/transport/status/contract errors.
- [x] 5.2 Add adapter tests for valid populated/unavailable responses, malformed contracts, UUID encoding, no-store behavior, timeout, transport, `404`, and other status failures.
- [x] 5.3 Replace the product placeholder route with UUID validation, server data loading, framework not-found handling, recoverable retry composition, and the shared storefront shell.
- [x] 5.4 Add product-detail loading and route-local not-found compositions with safe links back to the exact discovery route.
- [x] 5.5 Render server-backed description, category, rating/sales, shop summary/count, shipping preview, and eligible related cards without hardcoded commerce claims.
- [x] 5.6 Extend the T11 login placeholder to display only allowlisted T10 intent context and a safe return-to-product action while still collecting no credentials or creating a session.
- [x] 5.7 Add route/adapter Testing Library coverage for success, no media, no related items, unavailable, not-found, invalid path, retry, safe login context, and one-main-landmark continuity.

## 6. Interactive Gallery, Variant, Quantity, and Purchase Handoff

- [x] 6.1 Implement pure selection/quantity helpers for deterministic initialization, variant changes, media fallback, whole-number validation, stock bounds, and error messages.
- [x] 6.2 Build an accessible gallery with primary media fallback, ordered thumbnails, current-state semantics, keyboard operation, and variant-driven image activation.
- [x] 6.3 Build flat variant controls that expose name, selected/unavailable state, SKU, price, comparison price, discount, and current stock without synthesizing option axes.
- [x] 6.4 Build decrement/input/increment quantity controls that enforce `1..availableQuantity`, reset invalid quantity on variant change, and announce validation/selection changes.
- [x] 6.5 Build allowlisted add-to-cart and buy-now login handoff URLs from trusted product/variant/quantity state and disable both for invalid or unavailable selections.
- [x] 6.6 Present a clear product-wide unavailable composition without removing public product/shop/gallery information or implying a reservation.
- [x] 6.7 Add responsive Shopee-like detail styling with 44 px controls, visible focus, stable media aspect ratio, dense desktop composition, mobile stacking, and no horizontal overflow.
- [x] 6.8 Add component/helper tests for every media/variant/quantity transition, invalid input, unavailable selection, safe handoff serialization, live announcements, and disabled purchase behavior.

## 7. Product-Detail Browser and Runner Coverage

- [x] 7.1 Add a focused Playwright spec for gallery thumbnails, variant-driven SKU/price/media/stock, quantity limits, related links, and both anonymous login intents.
- [x] 7.2 Cover direct public, malformed/not-found, product-wide unavailable, no-media, empty-related, and recoverable data-source failure journeys with zero broken primary links.
- [x] 7.3 Verify keyboard order/current states, 44 px targets, sticky shell, one main landmark, no horizontal overflow, and zero serious/critical axe violations at 360Ã—800, 768Ã—1024, and 1440Ã—900.
- [x] 7.4 Add `test:e2e:product:quick`, isolated `test:e2e:product`, and screenshot-update scripts by safely generalizing the existing runner suite selector.
- [x] 7.5 Prove quick product-detail E2E only uses already-running services and never migrates, seeds, builds, starts Docker, or mutates local data.
- [x] 7.6 Generate and manually review product-detail screenshot baselines at all reference widths for Shopee-like hierarchy, gallery clarity, offer context, action visibility, and fallback states.

## 8. Documentation, Gates, and Delivery

- [x] 8.1 Document the product-detail endpoint/contract, flat-variant model, stock and media authority, anonymous intent, shipping limitations, local commands, and T10 non-goals.
- [x] 8.2 During development run focused tests plus `test:e2e:homepage:quick`, `test:e2e:catalog:quick`, and `test:e2e:product:quick`; retain manual-only GitHub Actions.
- [x] 8.3 Run frozen install, Prisma format/validate/isolated verification, format, lint, typecheck, all tests, production builds, isolated product PostgreSQL/browser E2E, and strict OpenSpec validation.
- [x] 8.4 Record verification evidence, commit and push T10 directly to `development` without a pull request, confirm no automatic Actions run, close issue `#11`, and confirm no issue branch remains.
