## 1. Shared Catalogue Contract and Quick Test Loop

- [x] 1.1 Define framework-neutral catalogue query, pagination metadata, response, category, and product-card types in `packages/contracts`.
- [x] 1.2 Add conservative catalogue runtime parsing with valid, malformed, invalid-money, invalid-rating, and invalid-pagination contract tests.
- [x] 1.3 Add `test:e2e:homepage:quick` that checks local API/web health and runs only the existing homepage Playwright spec without migration, seed, build, or Docker lifecycle work.
- [x] 1.4 Document quick-versus-isolated E2E usage and keep GitHub Actions manual-only.

## 2. Catalogue Presentation Persistence

- [x] 2.1 Add shop location plus product rating-average, rating-count, and sold-count presentation fields to the Prisma schema with bounded defaults and useful catalogue indexes.
- [x] 2.2 Create one additive migration with database constraints for rating range and non-negative rating/sold counts.
- [x] 2.3 Extend deterministic Vietnamese seed data with catalogue metadata and enough stable active products/variants/images to exercise multiple pages and both root/leaf categories.
- [x] 2.4 Extend persistence verification for new counts, metadata constraints, local media, category coverage, ordering prerequisites, and idempotent reseeding.
- [x] 2.5 Recreate the isolated test database from empty, deploy the migration twice, seed twice, and verify existing homepage plus new catalogue records remain stable.

## 3. NestJS Catalogue Capability

- [x] 3.1 Add a catalogue module, controller, service, repository boundary, query parser, exception filters, and `AppModule` registration.
- [x] 3.2 Validate and normalize anonymous `category`, `page`, and `pageSize` input with defaults of 1/12, a maximum page size of 48, and sanitized Problem Details errors.
- [x] 3.3 Resolve active category descendant IDs and return a valid empty page for unknown or unavailable category slugs.
- [x] 3.4 Query deterministic active product candidates and map only products from active shops/categories with an in-stock active representative variant.
- [x] 3.5 Map price, compare-at price, server-computed discount, rating, sold count, shop location, category, primary media/fallback, and stable product links to the shared card contract.
- [x] 3.6 Paginate after eligibility mapping and return accurate metadata for default, middle, final, and beyond-final pages.
- [x] 3.7 Add service/repository tests for eligibility, category descendants, stable ordering, representative offers, promotion calculations, pagination boundaries, and empty results.
- [x] 3.8 Add Supertest and isolated-PostgreSQL coverage for anonymous success, query validation, seeded pages/category filtering, response contract, and sanitized data-source failure.

## 4. Next.js Catalogue Route and Components

- [x] 4.1 Implement a server-only catalogue adapter with safe URL construction, short timeout, `cache: 'no-store'`, runtime parsing, and typed timeout/transport/status/contract errors.
- [x] 4.2 Convert `/search` to dynamic catalogue rendering with allowlisted normalization of `category`, `q`, `page`, and `pageSize` parameters.
- [x] 4.3 Build reusable responsive catalogue header, product grid, product card, rating/price/promotion metadata, and media fallback components.
- [x] 4.4 Build accessible previous/next and bounded numbered pagination links that preserve supported active parameters while replacing only `page`.
- [x] 4.5 Add labelled route loading skeletons, context-aware empty actions, and explicit failure/retry presentation without removing the shared shell.
- [x] 4.6 Ensure every populated product card reaches the existing non-404 T10 handoff route and no hardcoded catalogue product fallback remains.

## 5. Frontend and Accessibility Tests

- [x] 5.1 Add adapter tests for query encoding, timeout, transport failure, non-success status, invalid contract, empty response, and successful response.
- [x] 5.2 Add Testing Library coverage for product metadata, discount/no-discount cards, missing media, category/keyword context, and response order.
- [x] 5.3 Add pagination tests for first/middle/final/single-page states, disabled controls, supported query preservation, and unsupported query removal.
- [x] 5.4 Add loading, empty, failure/retry, shared-shell, heading, accessible-name, keyboard-order, and 44 px target assertions.
- [x] 5.5 Run axe against populated, empty, and failure catalogue compositions and fix every serious or critical violation.

## 6. Focused Browser Verification

- [x] 6.1 Add a focused catalogue Playwright spec covering seeded product metadata, parent/leaf category browsing, page navigation, parameter preservation, product handoff, and zero broken primary links.
- [x] 6.2 Verify keyboard navigation, sticky header, 44 px targets, zero horizontal overflow, and axe at 360×800, 768×1024, and 1440×900.
- [x] 6.3 Add an isolated catalogue E2E selector to the existing full-stack runner while keeping quick local commands free of migration/build/Docker setup.
- [x] 6.4 Regenerate and manually review catalogue screenshot baselines at all reference widths for Shopee-like density, Vietnamese copy, card consistency, and state clarity.

## 7. Documentation, Gates, and Delivery

- [x] 7.1 Document the catalogue endpoint, pagination bounds, presentation-field ownership, category semantics, local prerequisites, and T09/T10 boundaries.
- [x] 7.2 During development use focused unit/integration tests plus `test:e2e:homepage:quick`; run frozen install, Prisma gates, migration/seed verification, format, lint, typecheck, all tests, production builds, isolated catalogue E2E, and strict OpenSpec validation before delivery.
- [ ] 7.3 Record verification evidence, commit and push T08 directly to `development` without a pull request, confirm no automatic GitHub Actions run was created, close issue `#9`, and confirm no issue branch remains.
