## 1. Shared review contracts

- [x] 1.1 Add framework-neutral constants/types for review visibility, rating, media, eligibility, summaries, filters, pagination, author mutations, and Problem Details.
- [x] 1.2 Add exact request parsers for create/update bodies, review/order/media UUIDs, ETags, idempotency keys, rating filters, limits, and opaque product/filter-bound cursors.
- [x] 1.3 Add exact private author, order-line capability, public review collection, media, product summary, and shop summary response guards with privacy/invariant checks.
- [x] 1.4 Export contracts without framework dependencies and add malformed/unknown-field, normalization, cursor, privacy, money-free aggregate, ETag, and idempotency tests.

## 2. Review persistence and migration

- [x] 2.1 Extend Prisma with review visibility/media enums, `ProductReview`, ordered `ReviewMedia`, append-only moderation events, relations, and product/shop aggregate fields.
- [x] 2.2 Add additive SQL migration checks for rating/version/text/media state, one review per order line, paired idempotency fields, ordered media uniqueness, actor/reason audit shape, and restrictive relations.
- [x] 2.3 Add indexes for owner reads, product/rating cursor pagination, media cleanup, and moderation history.
- [x] 2.4 Reset legacy seed product ratings, initialize shop ratings, and update canonical import/seed so visible reviews are the only rating source.
- [x] 2.5 Add migration/schema tests and verify clean migrate, seed, dataset import, aggregate zero state, and rerun-safe checks against PostgreSQL.

## 3. Media staging boundary

- [x] 3.1 Implement a configurable local review-media adapter with opaque storage keys and no credential/path leakage.
- [x] 3.2 Implement authenticated multipart staging with MIME signature, supported type, byte size, dimension, item-count, ownership, and 24-hour expiry validation.
- [x] 3.3 Implement attached-only public media serving plus explicit cleanup limited to expired `STAGED` records/files.
- [x] 3.4 Add media unit/HTTP/PostgreSQL tests for invalid images, foreign/expired IDs, path traversal, atomic attachment, serving privacy, and cleanup scope.

## 4. Review domain and API

- [x] 4.1 Add owner-scoped repository queries through purchase/order joins and visible public keyset pagination with rating/product-bound cursors.
- [x] 4.2 Implement delivered eligibility and transaction-scoped create with row lock, unique-line protection, request digest, idempotent replay, media attachment, and canonical response.
- [x] 4.3 Implement author detail/update with ETag version check, normalized replacement fields/media, one version increment, and non-enumerating ownership errors.
- [x] 4.4 Implement product/shop aggregate recomputation and repair helper from visible reviews inside the caller transaction.
- [x] 4.5 Add NestJS private/public controllers, DTOs, module wiring, OpenAPI, Problem Details, AuthGuard, project-wide Origin guard, and cache headers.
- [x] 4.6 Extend T20 order detail with review capability/existing review identity and extend catalog/product/shop projectors with authoritative summaries.
- [x] 4.7 Add unit and PostgreSQL HTTP tests for eligibility, privacy, duplicate/replay, different-input reuse, stale/racing edits, rollback, hidden reads, cursor/filter behavior, aggregate correctness, and corrupted persistence.

## 5. Buyer and public UI

- [x] 5.1 Add exact web clients/query helpers for media staging, author create/detail/update, order eligibility, and public review pagination/filtering.
- [x] 5.2 Add delivered-order review/create/edit actions with accessible rating input, text/media validation, stable idempotency key, ETag refresh, duplicate-submit guard, and retained form data on failure.
- [x] 5.3 Add responsive product-detail review section with summary, exact-rating tabs, verified labels, safe media gallery, pagination, loading, empty, and recoverable-error states.
- [x] 5.4 Update catalog cards and shop storefront to use authoritative rating/count fields with explicit zero-review presentation.
- [x] 5.5 Add component tests for eligibility, owner controls, filtering/pagination reset, media errors, replay/stale refresh, hidden author state, privacy, accessibility, and mobile layout.

## 6. Flow, docs, and E2E

- [x] 6.1 Add deterministic delivered-order/review/media fixtures without placing transactional orders in normal seed data.
- [x] 6.2 Add `test:e2e:reviews:quick` for delivered order → stage media → create review → browse/filter product reviews → edit review at 360px, 768px, and 1440px.
- [x] 6.3 Document private/public endpoints, headers/body, media limits/retention, visibility, aggregate rules, local storage limitations, cleanup, and manual screen checks.
- [x] 6.4 Update `flow.md` with eligibility, idempotent write, media ownership, aggregate refresh, edit conflict, moderation, and public privacy flows.

## 7. Verification

- [x] 7.1 Run focused contract, schema/migration, media, service, HTTP/PostgreSQL, aggregate, and frontend component tests and fix regressions.
- [x] 7.2 Run database migrate/seed/verify plus workspace typecheck, lint, tests, and production builds for all affected packages/apps.
- [x] 7.3 Run `test:e2e:reviews:quick` followed by `test:e2e:homepage:quick`, recording environment-only skips explicitly.
- [x] 7.4 Validate `add-verified-product-reviews` with strict OpenSpec validation and prepare the implementation summary plus endpoint/screen verification guide.
