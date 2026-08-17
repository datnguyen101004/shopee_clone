## Context

See `proposal.md` for motivation and `specs/seller-onboarding-shop-profile/spec.md` for observable behavior. T12 already persists seller/admin roles, reevaluates them from PostgreSQL, and exposes `GET /api/v1/seller/shop` as a four-field owned-shop summary. T13 provides Vietnamese phone/address rules, T15 hides non-active shops from public storefronts, and checkout already revalidates commerce facts server-side. The current `shops.owner_id` and `shops.slug` fields are globally unique, `ShopStatus` has only `active`/`inactive`, and seeded shops must remain sellable after migration.

T22 spans contracts, Prisma, NestJS, Next.js, catalog/storefront/cart/checkout sellability, and admin authorization. Automatic GitHub Actions triggers remain paused; verification is local and PostgreSQL integration suites use only the isolated test database.

## Goals / Non-Goals

**Goals:**

- Extend the existing shop aggregate instead of creating a disconnected application record.
- Keep the T12 safe summary and public T15 contracts compatible.
- Make ownership, uniqueness, onboarding transitions, and sellability authoritative under retries and concurrency.
- Reuse existing authentication, role, origin, phone, address, and Problem Details boundaries.
- Provide a usable responsive seller workspace without treating UI route visibility as authorization.

**Non-Goals:**

- Self-service seller-role assignment; T12 admin role assignment remains the eligibility gate.
- Business documents, tax identifiers, identity verification, Shopee Mall certification, or automated risk review.
- Multiple live shops per owner, seller staff, shop transfer, or delegated permissions.
- Binary logo/banner upload; T22 accepts validated HTTPS URLs only.
- Product CRUD, inventory administration, seller order fulfillment, payouts, advertising, or chat.
- A full pending-shop administration console or public disclosure of private moderation reasons.

## Decisions

### 1. Keep onboarding state on the Shop aggregate

Extend `Shop` with description, optional logo/banner URLs, contact fields, explicit pickup/return address columns, `onboardingStatus` (`pending_approval`, `approved`, `rejected`), and optional `onboardingReason`. Add `suspended` to operational shop status. New applications default to `inactive` plus `pending_approval`; existing non-deleted shops are backfilled to `approved` so dataset products remain sellable.

A separate `ShopApplication` table was rejected because the initial policy has one application lifecycle per shop and a second aggregate would duplicate identity, addresses, and ownership. JSON address blobs were rejected because explicit columns retain validation, queryability, and migration visibility.

### 2. Enforce one live shop per owner with a partial database constraint

Replace the global `owner_id` unique constraint with a partial unique index on `owner_id WHERE deleted_at IS NULL`. Keep a normal owner lookup index. This matches the issue's “no duplicate active shop” policy while permitting a replacement after soft deletion. Add a partial case-insensitive unique index on `lower(name)` for live shops. Keep the existing global unique slug constraint so deleted slugs remain reserved and cannot create ambiguous historical URLs.

Shop creation runs in a transaction, locks the active user row, rechecks seller eligibility and live ownership, then inserts. PostgreSQL uniqueness violations map to safe `409` conflicts. Application-level checks provide useful errors, while constraints remain the concurrency authority.

Keeping the global owner constraint was rejected because it conflicts with the chosen soft-delete replacement policy. Reusing a deleted row was rejected because it would blur historical identity and timestamps.

### 3. Separate onboarding from operational status

Onboarding answers whether administration has accepted the profile; operational status answers whether an approved owner currently sells or administration has suspended the shop. Sellers may edit profile data in every onboarding state, but may choose only `active`/`inactive` after approval. They cannot set `suspended` or onboarding fields.

The approval placeholder accepts `approve`/`reject` plus a bounded reason, locks the target shop row, and writes the canonical state atomically. Approve sets `approved` + `active`; reject sets `rejected` + `inactive`. An exact repeated decision is idempotent. A later opposite admin decision is allowed as a replacement decision so rejected applications can be corrected and approved without a new shop.

Collapsing onboarding and operational status into one enum was rejected because “approved but temporarily inactive” differs from “awaiting approval” and “administratively suspended.”

### 4. Centralize the sellability predicate

Define one backend-owned predicate equivalent to `deletedAt IS NULL AND status = ACTIVE AND onboardingStatus = APPROVED`. Apply it to catalog discovery, public shop reads, cart admission/revalidation, pricing, and checkout confirmation. Existing historical order reads do not use this predicate. Buyer-facing failures normalize all non-sellable causes to the current unavailable behavior.

Storing a separate `canSell` boolean was rejected because it can drift from status and onboarding state. Checking only at UI/catalog time was rejected because a shop can change state after a buyer adds an item to cart.

### 5. Add a dedicated seller-onboarding module without replacing T12 routes

Create a capability module containing DTOs, controller, service, repository, and Problem Details mapping. Planned endpoints are:

- `GET /api/v1/seller/shop/workspace`
- `POST /api/v1/seller/shop`
- `PATCH /api/v1/seller/shop`
- `POST /api/v1/admin/shops/:shopId/approval`

Retain existing `GET /api/v1/seller/shop` as the minimal T12 ownership summary. All private reads use `Cache-Control: no-store`; mutations reuse authentication, role guards, and the project-wide origin guard. Owner identity always comes from the verified session. The admin route takes an opaque shop UUID, not seller identity.

Adding profile mutations to `AuthModule` was rejected because shop onboarding is a commerce capability. Expanding the existing summary response was rejected because current clients depend on its narrow contract.

### 6. Share strict contracts and reuse address normalization

Add framework-neutral types, constants, normalizers, request parsers, response guards, and safe problem types under `packages/contracts`. Nest DTOs whitelist the same surface, and services normalize again before persistence. Address rules reuse the existing legacy Vietnamese province/district/ward selector data and phone/address bounds, while seller logistics addresses remain separate from the buyer `ShippingAddress` table.

Logo and banner values accept HTTPS URLs with no embedded credentials and bounded length. A media-upload service was rejected for T22 because it would introduce storage, image processing, cleanup, and security scope unrelated to onboarding.

### 7. Expand the existing seller/admin entry areas

Keep `/seller` as the role-gated landing page and add `/seller/shop` for onboarding/profile management. The workspace response decides whether to show a create form or owned profile. The UI renders pending, approved, rejected, inactive, and suspended states and explains why selling is unavailable without exposing private details publicly. `/admin` gains a minimal shop-id/decision/reason form, not a listing or moderation dashboard.

All calls use the existing in-memory authenticated fetch boundary. No shop payload or owner identity is copied to browser storage or query strings. Component state retains valid input after recoverable failures and prevents duplicate mutations.

### 8. Verification is layered and non-destructive

Contract tests cover normalization and exact shapes; service tests cover state rules; Supertest covers authentication, roles, headers, and Problem Details; guarded PostgreSQL tests cover partial uniqueness, concurrency, ownership, and transaction rollback. Component tests cover forms and state rendering. Quick Playwright intercepts APIs and verifies seller/admin flows at 360px, 768px, and 1440px without mutating the developer database. Apply completion also updates `docs/seller-onboarding.md` and `flow.md`.

## Risks / Trade-offs

- **Existing seeded shops could become unapproved after migration** → Backfill every non-deleted existing shop to approved in the same migration and verify dataset sellability.
- **Sellability checks could diverge across modules** → Export one predicate/query fragment and add regression tests at catalog, storefront, cart, pricing, and checkout boundaries.
- **Soft-deleted slugs remain permanently reserved** → Document this intentional compatibility rule; reclaiming URLs requires a later explicit migration.
- **Profile columns make `shops` wider** → Accept the simpler aggregate for the initial one-shop policy; extract logistics addresses only when independent lifecycle/history is required.
- **The admin placeholder can change decisions without document evidence** → Restrict it to current admins, require a bounded reason, retain the latest reason, and explicitly keep verification/certification out of scope.
- **A seller role can exist without a shop** → Treat that as the valid pre-onboarding workspace state rather than an authorization error.

## Migration Plan

1. Add contracts and Prisma enums/fields, replace owner uniqueness with a partial live-shop index, add live-name uniqueness, and backfill existing shops as approved.
2. Apply committed migrations from empty state and against current seed data; regenerate Prisma and confirm migration/seed rerun safety in the isolated test database.
3. Add the seller-onboarding module, approval placeholder, shared sellability rule, seed/verification updates, and frontend workspace.
4. Run focused and full contract/API/PostgreSQL/UI suites, lint, typecheck, production builds, `db:verify`, and seller/auth/shop/cart/pricing/checkout quick E2E.
5. Roll back application routing first if necessary. Additive profile columns can remain dormant; do not drop populated seller data without explicit approval. The enum addition and uniqueness-index replacement require a forward corrective migration rather than destructive rollback.
