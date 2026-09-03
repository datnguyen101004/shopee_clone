## Why

Authenticated buyers currently have a safe login identity but no checkout-ready profile or delivery destination. T13 adds an owned account surface now so cart and checkout work can rely on validated, server-backed recipient data instead of collecting unstructured details later.

## What Changes

- Add an authenticated buyer profile projection with editable display name and optional Vietnamese phone number while keeping the login email read-only.
- Add create, list, update, delete, and explicit default-selection operations for Vietnamese shipping addresses.
- Enforce ownership, strict server-side validation, and an invariant that exactly one active address is default whenever a user has addresses.
- Promote a deterministic replacement when the default address is deleted and serialize competing address mutations safely.
- Add responsive account profile/address pages with authenticated, loading, empty, validation, success, and failure states.
- Replace free-text province and district entry in the web address form with searchable dependent popups backed by a pinned pre-consolidation snapshot of Vietnam's 63 province-level units and their districts as of 30 June 2025.
- Add shared framework-neutral contracts, OpenAPI documentation, Problem Details errors, persistence migration/verification, and focused unit, API, PostgreSQL, UI, and quick browser tests.
- Keep account and address values out of logs except for opaque identifiers and coarse outcomes; never expose another user's address through existence-sensitive errors.

## Capabilities

### New Capabilities

- `buyer-profile-and-address-management`: Authenticated self-service profile and Vietnamese shipping-address management, including validation, ownership, and deterministic default selection.

### Modified Capabilities

None.

## Impact

- **Database:** Extend `User` with an optional phone number and add an owned, soft-deletable shipping-address model plus indexes/constraints for active default selection.
- **Backend:** Add a NestJS account module under `/api/v1/account`, reuse authentication/origin guards, and add transactional profile/address services and sanitized errors.
- **Shared contracts:** Add strict profile, address, mutation, and Problem Details types/runtime parsers in `packages/contracts` without framework dependencies.
- **Frontend:** Add protected account routes, forms, address cards, default controls, and account navigation integrated with the in-memory auth session coordinator.
- **Administrative data:** Commit a frontend-only legacy snapshot sourced from the National Statistics Office; continue sending and storing human-readable strings without changing account API or database schemas.
- **Verification:** Update deterministic seed/database verification and add ownership, validation, concurrency/default-invariant, UI form, and focused quick E2E coverage.
- **Dependencies:** Builds on completed T11 authentication and T12 authorization; provides checkout-ready account data for later cart/checkout tasks.
