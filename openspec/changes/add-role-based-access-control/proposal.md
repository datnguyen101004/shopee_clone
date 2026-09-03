## Why

T11 proves who a user is, but every authenticated account still has the same effective authority. T12 must establish durable buyer, seller, and admin boundaries before seller-center, commerce, and administration work can expose ownership-sensitive operations.

## What Changes

- Define canonical buyer, seller, and admin roles with a deny-by-default permission matrix; self-service registration and Google sign-in never accept or grant elevated roles.
- Persist current role assignments and append-only assignment/revocation audit events, backfill buyer access for existing users, and derive seller access from explicit assignment plus current shop ownership.
- Extend safe authenticated-user/session contracts with sorted roles while keeping access tokens identity/session-only so every protected request evaluates current database authorization.
- Add reusable NestJS role metadata, guards, ownership policies, and consistent 401/403 Problem Details for future shop, product, order, and admin modules.
- Add minimal real protected surfaces for the current domain: seller-owned shop lookup plus admin role assignment, revocation, and audit inspection.
- Establish a constrained first-admin bootstrap and admin-managed role workflow that is auditable, concurrency-safe, prevents browser-controlled elevation, and avoids removing the last active admin.
- Make storefront navigation and access states role-aware without treating frontend visibility as a security boundary.
- Add migration, seed, contract, unit, Supertest, PostgreSQL permission-matrix, and focused browser coverage for allowed and denied paths.

## Capabilities

### New Capabilities

- `role-based-access-control`: Durable marketplace roles, current-role projection, backend role and ownership enforcement, auditable administration, and role-aware frontend behavior.

### Modified Capabilities

None.

## Impact

- PostgreSQL/Prisma gains role-assignment and immutable role-audit persistence plus additive migration/backfill rules.
- Shared auth contracts and every T11 session response gain a strict role collection.
- The NestJS auth boundary gains authorization decorators, guards, policies, admin role-management routes, and seller ownership enforcement under `/api/v1`.
- The Next.js storefront gains role-aware navigation/access feedback while all authoritative decisions remain in the API.
- Deterministic seed/verification, authentication documentation, quick auth E2E, and CI validation inputs are extended; automatic GitHub Actions triggers remain disabled.
- No fine-grained organization permissions, delegated seller staff, seller onboarding, shop/product/order mutation workflows, or generalized policy engine is introduced.
