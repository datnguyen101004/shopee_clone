## Context

See `proposal.md` for motivation and `specs/buyer-profile-and-address-management/spec.md` for the behavior contract. T11 supplies rotating HttpOnly-backed sessions, bearer access tokens held only in memory, strict DTO validation, credentialed origin protection, and safe Problem Details. T12 reloads the current user and canonical roles for protected requests. The current `User` row contains email and display name but no checkout contact field, there is no address model or account API module, and the web has reusable account layout/session primitives but no authenticated account-management route.

T13 must establish data that later checkout can consume without implementing cart, order snapshots, address-provider lookup, maps, or third-party normalization. PostgreSQL remains authoritative, the NestJS API owns mutations, and automatic GitHub Actions triggers remain paused.

## Goals / Non-Goals

**Goals:**

- Add a small, stable profile and delivery-address domain on top of the existing authentication identity.
- Make ownership and the exactly-one-default invariant correct under retries and concurrent requests.
- Normalize enough Vietnamese contact input for checkout while keeping geographic fields provider-neutral and human-readable.
- Return owner-readable values through strict contracts while preventing contact/address data from reaching logs, errors, URLs, or browser persistence.
- Reuse current auth/session, Problem Details, shared-contract, OpenAPI, responsive UI, and isolated PostgreSQL test patterns.

**Non-Goals:**

- Changing login email, password, roles, account status, identity-provider links, or authentication token/cookie formats.
- Map pins, geocoding, live administrative-boundary lookup APIs, address codes, ward/commune auto-completion, or postal validation.
- Shared household addresses, guest checkout, seller pickup addresses, saved payment methods, or checkout/order creation.
- Immutable historical address snapshots; the later order task must copy the selected address into an order-owned snapshot.
- Encrypting individual address columns at application level; deployment/database encryption and retention policy remain production-hardening concerns.

## Decisions

### 1. Add one account capability module rather than extending authentication routes

Create a capability-oriented NestJS account module with an authenticated controller rooted at `/api/v1/account`. Use these operations:

- `GET /profile` and `PATCH /profile` for the safe buyer profile.
- `GET /addresses` and `POST /addresses` for the active address book.
- `PATCH /addresses/:addressId` and `DELETE /addresses/:addressId` for owned records.
- `PUT /addresses/:addressId/default` for idempotent explicit selection.

Every route uses `AuthGuard`; mutations also use the existing origin policy and global strict validation. Profile/address-specific exception mapping emits `application/problem+json`, `Cache-Control: no-store`, stable public types, and no echoed payloads. Address identifiers are canonical UUIDs, but an invalid, missing, deleted, or foreign identifier resolves to the same not-found outcome.

Authentication remains responsible only for proving identity and session validity. Mixing address CRUD into `/auth` was rejected because it would couple credentials to a growing account domain and make later checkout reuse less clear.

### 2. Keep the login identity contract stable and introduce separate account contracts

Add a framework-neutral account contract file exporting bounds, request/response shapes, strict runtime parsers, phone normalization, and account Problem Details parsing. `BuyerProfile` contains `id`, `email`, `displayName`, `phoneNumber`, `status`, and canonical roles so the profile page has one safe projection; profile mutation accepts only `displayName` and `phoneNumber`.

`AuthUser` and `AuthSessionResponse` remain structurally unchanged, avoiding a breaking T11/T12 contract change. After a successful display-name update, the frontend session coordinator replaces only the in-memory user's display name so the header is immediately coherent; the next refresh/authentication read remains authoritative. Phone/address values never enter auth tokens or auth session state.

Alternatives considered:

- Add phone to `AuthUser`: rejected because every login/refresh/Google flow would expose a checkout field and widen the authentication contract unnecessarily.
- Store a generic JSON profile: rejected because validation, indexing, migrations, and checkout typing would be weaker.

### 3. Extend User minimally and model owned addresses explicitly

Add nullable `User.phoneNumber` (`phone_number`, bounded varchar) and a `ShippingAddress` table with UUID id, `userId`, recipient name, normalized phone, province, district, ward, address line, optional label, `isDefault`, timestamps, and `deletedAt`. Use `onDelete: Restrict` for the owner relation and soft deletion so references can remain stable for later migration/audit work; active account reads always filter `deletedAt IS NULL`.

Indexes support owned active listing and deterministic promotion. A database partial unique index on `user_id WHERE is_default = true AND deleted_at IS NULL` enforces at most one active default even if an application bug bypasses the service. Check constraints enforce normalized phone shape, trimmed/non-empty bounded text, and prevent a deleted row from remaining default. Prisma models the table while the hand-authored migration adds partial/check constraints that Prisma cannot express.

Hard deletion was rejected because it weakens future traceability and makes safe order/address evolution harder. A separate `UserProfile` table was rejected because T13 adds only one optional account-level contact field and would introduce a one-to-one join without independent lifecycle value.

### 4. Canonicalize phones locally and keep geographic text provider-neutral

Shared normalization accepts a Vietnamese `+84` or local leading-zero number with supported presentation separators, converts it to `0` plus nine digits, and rejects every other shape. The server trims Unicode-edge whitespace, rejects control characters, and applies explicit bounds: display/recipient names 2–120 characters; province, district, and ward 2–100; detailed line 5–255; optional label 1–50 when present.

Address input stores human-readable province/district/ward values rather than persisting government codes. The web form ships a frontend-only snapshot from the National Statistics Office for 30 June 2025: the 63 province-level units immediately before the 2025 consolidation and their district-level units. Codes stay internal to that snapshot, selected display names are submitted through the unchanged string contract, and Nest DTO/service validation remains authoritative.

Accepting arbitrary international phone numbers was rejected because T13 explicitly targets Vietnamese checkout data. A live lookup was rejected because address editing should work deterministically without adding a third-party runtime dependency. The legacy snapshot is intentionally pinned rather than described as current data; a future migration to the post-2025 two-level model can add a versioned adapter without changing stored address ownership/default semantics.

### 5. Serialize all address mutations on the owning user row

Run create, edit, delete, and select-default operations in a transaction that first locks the authenticated user's row with `SELECT ... FOR UPDATE`. This supplies one per-user serialization point without a new lock table or process-local mutex and works across API replicas.

Inside that transaction:

- The first active address is always created as default.
- An explicitly default new address clears the current default before inserting/selecting the new one.
- Selecting the current default is an idempotent success.
- Editing content never changes default state; default selection has its own unambiguous route.
- Deleting a non-default keeps the current default.
- Deleting the default clears/soft-deletes it and promotes the remaining active row ordered by `createdAt ASC, id ASC`.
- Deleting the last address leaves no default.

The service checks the invariant before commit, while the partial unique index protects the at-most-one side. Deferrable custom constraint triggers were considered but rejected because enforcing at-least-one inside intermediate SQL statements complicates valid default swaps; the user-row lock plus end-of-transaction service assertion is clearer and testable.

### 6. Treat address values as response-authorized but telemetry-prohibited data

Owners need full values to edit and later check out, so successful account responses are not masked. Instead, all responses are private/non-cacheable, routes never accept an owner id, and no list/detail endpoint exists outside the authenticated account boundary. Errors contain field names and stable types but never rejected values.

Account telemetry records event/action, coarse outcome, authenticated user id, and opaque address id only when safe. Repository/API exception sanitization gains profile/address keys so accidental error objects cannot expose recipient, phone, or street fields. Client code does not place form values in URLs, analytics, storage, or readable cookies and clears discarded form state on navigation/logout.

Masking successful owner responses was rejected because it would prevent editing and produce unusable checkout data. Logging partially masked street/phone values was also rejected because it adds no operational value for T13.

### 7. Build two protected account views on the existing session coordinator

Add `/account/profile` and `/account/addresses` under the storefront shell. Client account components wait for session restoration, present a safe sign-in link with an internal return path for guests, and call the API only through `authenticatedFetch`. The profile form keeps email read-only; the address view provides list, add/edit form, default action, and confirmed deletion with accessible pending/errors/success announcements.

The address form uses explicit Vietnamese labels and autocomplete attributes. Province/city and district render as searchable Radix-backed popup dialogs; district stays unavailable until a province can be resolved and is cleared when province changes. Search is case/accent-insensitive, existing abbreviated or unaccented stored values can resolve for editing, and no silent persistence occurs until submit. Ward remains plain text. Address cards put the default first and clearly identify it. Mutations replace local state only from parsed server responses; an error preserves editable input without leaking it elsewhere. No Next.js middleware is added because the access token intentionally exists only in client memory.

A single oversized `/account` form was rejected because profile saves and address mutations have different validation/pending/error lifecycles. Server-only account rendering was rejected because the API bearer token is not available to the server component without weakening T11's token boundary.

### 8. Verify the invariant and privacy boundary at every layer

Contract tests cover exact shapes, bounds, normalization, unknown-key rejection, and strict parsers. Account service/controller tests cover authentication, ownership, validation, no-store responses, sanitized errors, and idempotent routes. Isolated PostgreSQL tests cover migration-from-empty, first/default behavior, deterministic promotion, foreign IDs, soft deletion, concurrent creates/default swaps/deletes, partial uniqueness, and transaction rollback.

Frontend tests cover loading/guest/authenticated states, read-only email, field association, create/edit/default/delete flows, duplicate-submit prevention, and session display-name synchronization. Add a focused account Playwright quick suite for non-destructive route/session/accessibility checks against already-running services; mutation correctness remains in isolated PostgreSQL and UI tests so quick mode does not modify a developer database. Existing auth and homepage quick suites remain proportionate regressions.

## Risks / Trade-offs

- [At-least-one default is enforced by service logic rather than a pure database constraint] → Serialize every address mutation on the user row, assert before commit, retain a partial unique index, and cover raw/concurrent failure cases in PostgreSQL tests.
- [The pinned 30 June 2025 dataset becomes stale and intentionally differs from the post-consolidation model] → Label it as the legacy 63-province snapshot, keep codes out of persistence, test its integrity, and allow a later versioned normalization adapter without changing address ownership/default semantics.
- [Soft-deleted addresses retain personal data] → Exclude them from all active APIs, document retention as a production policy, and ensure future order snapshots do not depend on mutable address rows.
- [Profile display name can be momentarily stale in another browser tab] → Update the current tab's in-memory projection after save and rely on normal auth refresh/reload elsewhere; no cross-tab storage or broadcast is introduced.
- [Concurrent requests can deadlock if future code locks resources in a different order] → Make the user row the first lock for every account/address mutation and document this ordering for checkout work.
- [Detailed validation errors can aid field probing] → Expose only field names/rules for the authenticated owner, never values or ownership distinctions.

## Migration Plan

1. Add contracts and Prisma schema, then create a forward-only additive migration for `users.phone_number`, shipping addresses, indexes, partial uniqueness, and check constraints.
2. Apply the migration from empty and twice against isolated PostgreSQL. Existing users require no backfill; they start with null phone and no addresses, which validly means no default.
3. Add account module/services/routes, seed/verification updates, frontend account views/navigation, and focused tests. Deploy API and web together so strict contracts stay aligned.
4. Run formatting, lint, typecheck, unit/API/PostgreSQL suites, production builds, database verification, and focused auth/homepage/account quick browser regressions.
5. Roll back application code first if needed. The nullable user column and unreferenced address table are backward-compatible, so retain them and correct forward; do not drop stored personal data without an explicit retention/export review.
