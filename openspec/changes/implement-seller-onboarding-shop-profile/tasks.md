## 1. Shared seller-shop contracts

- [x] 1.1 Define onboarding, operational status including `suspended`, logistics address, private profile, workspace, create/update, approval, `canSell`, and safe Problem Details types and bounds.
- [x] 1.2 Add strict normalizers/parsers for kebab-case slug, live shop name, HTTPS media URLs, Vietnamese phone/address fields, normalized contact email, bounded decision reason, and exact unknown-key rejection.
- [x] 1.3 Add response guards for workspace and private profile while extending the existing four-field `SellerShop` status guard without leaking profile or owner identity.
- [x] 1.4 Export the new contracts from `@shopee-clone/contracts` and add valid/malformed create, patch, approval, workspace, media, address, normalization, and privacy tests.

## 2. Shop persistence and sellability

- [x] 2.1 Extend Prisma `Shop` with profile/contact/pickup/return fields, onboarding status/reason, and `SUSPENDED`; default new applications to inactive and pending approval.
- [x] 2.2 Add a forward-only migration that backfills existing non-deleted shops as approved, replaces global owner uniqueness with a live-shop partial unique index, and adds case-insensitive live-name uniqueness and lookup indexes.
- [x] 2.3 Keep slug globally unique, update deterministic seed/import data for complete approved shops, and verify current dataset shops remain sellable.
- [x] 2.4 Implement a shared non-deleted + approved + active sellability predicate and apply it to catalog, public storefront, cart admission/revalidation, authoritative pricing, and checkout confirmation.
- [x] 2.5 Extend existing seller ownership/status mapping to handle inactive and suspended shops without changing the T12 safe summary shape.
- [x] 2.6 Add schema/migration/seed tests for defaults, backfill, partial owner/name uniqueness, reserved slugs, indexes, rerun safety, and zero regression in marketplace relations.

## 3. Seller onboarding and admin API

- [x] 3.1 Add a seller-onboarding NestJS module with repository, service, DTOs, OpenAPI annotations, Problem Details filter, auth/role guards, origin protection, and no-store private responses.
- [x] 3.2 Implement `GET /api/v1/seller/shop/workspace` returning `shop: null` or only the authenticated seller's private profile.
- [x] 3.3 Implement `POST /api/v1/seller/shop` with active seller eligibility, user-row locking, server-derived ownership, canonical pending/inactive state, and safe conflicts for live owner, reserved slug, or live name.
- [x] 3.4 Implement `PATCH /api/v1/seller/shop` with persisted owner scope, partial validated updates, pre-approval activation rejection, and no seller-controlled suspended/onboarding fields.
- [x] 3.5 Implement `POST /api/v1/admin/shops/:shopId/approval` with admin authorization, row locking, approve/reject transitions, retained reason, exact-repeat idempotency, and sanitized unavailable-shop handling.
- [x] 3.6 Preserve `GET /api/v1/seller/shop` compatibility and add service/HTTP tests for guest, buyer, seller, admin, ownership, validation, no-store headers, and sanitized errors.
- [x] 3.7 Add guarded PostgreSQL HTTP tests for concurrent create, partial uniqueness, soft-delete replacement, decision races/idempotency, transaction rollback, foreign ownership, and sellability changes between cart and checkout.

## 4. Seller and admin web experience

- [x] 4.1 Add authenticated web API helpers for workspace, create, patch, and approval with strict response parsing and typed validation/conflict/unavailable errors.
- [x] 4.2 Expand `/seller` and add `/seller/shop` with session restoration, seller role gate, guest login handoff, buyer-forbidden state, loading, retry, and unavailable states.
- [x] 4.3 Build the onboarding form for identity, contact, logo/banner URLs, and legacy province/district/ward pickup and return addresses with accessible client validation.
- [x] 4.4 Build owner profile editing with pending/approved/rejected/inactive/suspended feedback, approved-only active/inactive control, retained input on failure, and duplicate-submit protection.
- [x] 4.5 Add the minimal `/admin` approval form for shop UUID, decision, and reason without adding a pending-shop listing or moderation console.
- [x] 4.6 Add component/API-helper tests for exact payloads, workspace states, role/ownership-gated rendering, field errors, pending controls, retries, duplicate prevention, accessibility, and no browser-storage persistence.

## 5. Documentation, flow, and browser coverage

- [x] 5.1 Document the seller/admin endpoints, request/response examples, status transitions, uniqueness rules, sellability boundary, media URL/address constraints, and local verification steps in `docs/seller-onboarding.md`.
- [x] 5.2 Update `flow.md` with Mermaid diagrams for seller application/approval/profile state transitions and the sellability revalidation path through catalog, cart, pricing, and checkout.
- [x] 5.3 Add `test:e2e:seller:quick` or extend the focused auth E2E to cover guest, forbidden buyer, seller create/edit, pending/rejected/approved states, and admin approval using intercepted APIs only.
- [x] 5.4 Verify onboarding/profile/admin forms at 360px, 768px, and 1440px for keyboard operation, announcements, visible focus, touch targets, and horizontal overflow.

## 6. Final verification

- [x] 6.1 Run focused contract, schema/migration, seller service, HTTP/PostgreSQL, ownership, sellability, and frontend component tests and fix regressions.
- [x] 6.2 Run database migrate/deploy, deterministic seed, `db:verify`, workspace lint, typecheck, full tests, and production builds with pinned pnpm 10.34.5.
- [x] 6.3 Run seller/auth/shop/cart/pricing/checkout quick E2E in that order against local services, then stop only the processes started for verification and record any environment-only skip.
- [x] 6.4 Run strict OpenSpec validation, confirm every checklist item has evidence, and prepare the implementation summary with endpoint/screen verification guidance.
