## 1. Shared account contracts

- [x] 1.1 Add framework-neutral profile, shipping-address, mutation, list, and account Problem Details types with documented field bounds in `packages/contracts`.
- [x] 1.2 Implement pure Vietnamese phone normalization and bounded trimmed-text validation helpers without logging or retaining rejected values.
- [x] 1.3 Add strict runtime parsers for profile/address responses, address lists, mutation requests, canonical timestamps, UUIDs, and account problems with unknown-key rejection.
- [x] 1.4 Export the account contract surface from the package entry point and add contract tests for valid, invalid, normalized, nullable, and extra-property cases.

## 2. PostgreSQL account persistence

- [x] 2.1 Extend Prisma `User` with nullable `phoneNumber` and an owned `ShippingAddress` relation/model with soft-delete, default, and UTC timestamp fields.
- [x] 2.2 Create an additive migration with the address table, foreign key, active-list indexes, default lookup index, partial unique active-default index, phone/text checks, and deleted-default prevention.
- [x] 2.3 Generate, format, and validate Prisma artifacts and prove the committed migration applies from empty and remains idempotent on repeat deploy.
- [x] 2.4 Extend deterministic seed/verification fixtures with representative Vietnamese profile/address data while preserving no-address users as a valid state.
- [x] 2.5 Add database verification assertions for relations, normalized values, soft-delete visibility, and exactly one active default for every seeded user with addresses.

## 3. Account backend domain

- [x] 3.1 Create a capability-oriented NestJS account module and register it in the application without changing authentication token or cookie formats.
- [x] 3.2 Add strict profile/address DTOs, canonical UUID parameter validation, stable domain errors, and a sanitized Problem Details exception filter.
- [x] 3.3 Implement an account repository that reads only the authenticated user's safe profile and active owned addresses in deterministic default-first order.
- [x] 3.4 Implement profile update behavior for display name and optional normalized phone while preventing email, status, roles, identities, and credentials from mutation.
- [x] 3.5 Implement transactional address creation with a user-row lock, first-address defaulting, optional explicit default selection, and an end-of-transaction invariant assertion.
- [x] 3.6 Implement owned address editing that normalizes mutable content and cannot change owner, identifier, creation time, or default state.
- [x] 3.7 Implement idempotent explicit default selection that atomically clears the prior default and preserves exactly one active default.
- [x] 3.8 Implement owned soft deletion with deterministic oldest-address promotion when deleting the default and no default after deleting the final address.
- [x] 3.9 Ensure invalid, missing, deleted, and foreign address identifiers share the same not-found behavior and never expose ownership information.

## 4. Authenticated account API

- [x] 4.1 Expose `GET/PATCH /api/v1/account/profile` with bearer authentication, mutation origin checks, strict response contracts, and `Cache-Control: no-store`.
- [x] 4.2 Expose `GET/POST /api/v1/account/addresses` with owner-derived scope, deterministic list responses, and first/explicit default semantics.
- [x] 4.3 Expose `PATCH/DELETE /api/v1/account/addresses/:addressId` and idempotent `PUT /api/v1/account/addresses/:addressId/default` with correct status codes.
- [x] 4.4 Document all account operations, bearer/origin requirements, DTO bounds, success shapes, no-content responses, validation, authentication, not-found, and conflict failures in OpenAPI.
- [x] 4.5 Extend exception/log sanitization and tests so phone, recipient, geographic, address-line, label, credential, and complete payload values cannot enter errors or telemetry.

## 5. Frontend account data boundary

- [x] 5.1 Add account API helpers that call only through `authenticatedFetch`, set JSON headers safely, parse strict shared contracts, and map Problem Details without storing contact data.
- [x] 5.2 Extend the in-memory auth session coordinator with a narrowly scoped display-name synchronization method after profile save, without adding phone/address data or browser persistence.
- [x] 5.3 Add shared protected-account loading, guest sign-in, unauthorized, and recoverable-error compositions with safe internal return paths.
- [x] 5.4 Add account navigation entries that reflect restored authenticated state and link to profile/address routes without exposing values in URLs.

## 6. Profile and address user experience

- [x] 6.1 Build `/account/profile` in the storefront shell with read-only email/status, editable display name/phone, accessible validation, pending, success, and retry states.
- [x] 6.2 Build `/account/addresses` with default-first address cards plus loading, guest, empty, failure, and refreshed-success states.
- [x] 6.3 Build an accessible Vietnamese address add/edit form for recipient, phone, province/city, district, ward, detailed line, optional label, and create-as-default selection.
- [x] 6.4 Add default-selection and confirmed-delete controls with duplicate-submit protection, focus management, action-specific errors, and deterministic UI refresh from server responses.
- [x] 6.5 Add responsive account styles for mobile, tablet, and desktop using existing design tokens and verify keyboard focus, semantics, contrast, and touch targets.

## 7. Automated behavior verification

- [x] 7.1 Add account service/repository unit tests for profile isolation, normalization, ownership, deterministic ordering/promotion, idempotency, rollback, and privacy-safe failures.
- [x] 7.2 Add Supertest coverage for every exact account route, 401 versus not-found behavior, strict DTO rejection, origin enforcement, cache headers, status codes, and safe bodies.
- [x] 7.3 Add isolated PostgreSQL tests for first/default creation, foreign ownership, soft deletion, partial uniqueness, concurrent default creates/selections/deletions, invariant preservation, and unrelated-user isolation.
- [x] 7.4 Add frontend unit/integration tests for restoration states, read-only profile fields, normalization guidance, field errors, create/edit/default/delete flows, duplicate-submit prevention, and in-memory name synchronization.
- [x] 7.5 Add a non-mutating account Playwright quick suite and pinned `test:e2e:account:quick` command covering guest/authenticated route behavior, accessibility, responsive layouts, and storage/URL privacy.

## 8. Documentation and delivery gates

- [x] 8.1 Document account endpoints, Vietnamese normalization rules, default-address invariant/lock order, privacy boundary, local verification commands, and the later checkout snapshot responsibility.
- [x] 8.2 Run migration deploy twice, deterministic seed twice, destructive guarded `db:verify`, and focused account PostgreSQL suites against the isolated `_test` database.
- [x] 8.3 Run formatting, lint, typecheck, all contract/API/web unit suites, and production builds with the pinned pnpm version; resolve every new error or warning.
- [x] 8.4 Run `test:e2e:account:quick`, `test:e2e:auth:quick`, and `test:e2e:homepage:quick`, documenting intentional quick-mode skips and leaving automatic CI triggers unchanged.
- [x] 8.5 Review the final diff for scope, committed secrets, personal-data fixtures/logging, generated artifacts, and complete traceability to every T13 acceptance criterion.

## 9. Legacy province and district popup follow-up

- [x] 9.1 Add a pinned 30 June 2025 National Statistics Office snapshot covering all 63 legacy province-level units and their district-level units, plus integrity and known-mapping tests.
- [x] 9.2 Build a reusable searchable, accent-insensitive, keyboard-accessible popup selector for province/city and dependent district choices.
- [x] 9.3 Integrate the selector into add/edit address forms, clear incompatible districts on province changes, preserve resolvable legacy stored values, and keep ward/API/database contracts unchanged.
- [x] 9.4 Add component and focused browser coverage for selection, filtering, dependent clearing, responsive popup layout, and privacy; rerun proportionate frontend gates without changing CI triggers.
