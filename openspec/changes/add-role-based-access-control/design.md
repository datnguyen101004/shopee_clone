## Context

See `proposal.md` for motivation and `specs/role-based-access-control/spec.md` for required behavior. T11/T11.1 already provide identity-only access tokens, rotating local refresh sessions, a safe `AuthUser` projection, one optional shop per user, and public catalog/product reads. There are no seller/admin modules or order records yet, so T12 must create a reusable authorization boundary and only the smallest real protected surfaces needed to prove it.

The API remains the sole authority for identity, roles, ownership, and role mutation. PostgreSQL is the durable source of truth; Redis, external identity providers, browser storage, and frontend route state cannot be authorization authorities. Existing sessions and public storefront behavior must remain compatible through an additive database migration and coordinated monorepo deployment.

## Goals / Non-Goals

**Goals:**

- Make current role and ownership checks reusable across future capability modules without placing permissions in controllers or the frontend.
- Apply role changes immediately to otherwise valid access credentials by resolving roles with the current active user/session lookup.
- Model current assignments separately from immutable audit history so authorization queries stay small while privileged changes remain attributable.
- Prove the design through real seller-shop and admin-role surfaces plus a complete allowed/denied matrix.
- Preserve current users, shops, sessions, external identities, and public routes during migration.

**Non-Goals:**

- A generic ABAC/policy expression engine, organization hierarchies, delegated shop staff, custom roles, or per-field permissions.
- Seller onboarding, shop editing, product mutations, order creation/fulfillment, or public shop storefront work owned by later roadmap tasks.
- Embedding roles in JWTs, long-lived frontend storage, distributed authorization caches, or a production admin GUI.
- Automatic admin creation from an email, Google claim, deployment identity, or seed data.

## Decisions

### 1. Store active assignments and append-only audit events separately

Prisma gains canonical enums `MarketplaceRole` (`BUYER`, `SELLER`, `ADMIN`), `RoleAuditAction` (`GRANT`, `REVOKE`), and `RoleAuditSource` (`SYSTEM`, `MIGRATION`, `SEED`, `BOOTSTRAP`, `ADMIN`). `UserRoleAssignment` stores only current authority with composite identity `(userId, role)`, grant timestamp, source, and nullable granting-admin identifier. `RoleAuditEvent` stores an immutable UUID event with target, role, action, source, nullable actor, bounded reason, and UTC creation time.

Grant inserts the active row and audit event in one transaction. Revoke deletes the active row and appends its event in one transaction. Repeated grants/revocations return the already-converged role set without adding misleading duplicate events. Buyer is an invariant assignment and is not exposed to admin revoke/grant APIs.

This is preferred over a single temporal assignment table because every request needs only a small indexed active set and must not interpret overlapping history. It is preferred over a role column on `User` because roles are additive and future shop onboarding needs an independent seller grant. Audit events use foreign keys to soft-deleted users and have no update/delete application repository methods.

### 2. Backfill roles additively and create no production admin

One reviewed SQL migration creates the enums/tables/constraints/indexes, grants buyer to every current non-deleted user, grants seller to every current non-deleted shop owner, and writes matching migration-source audit events. Deterministic identifiers or conflict-safe selection make a repeated seed converge without duplicate current assignments or seed events. Existing shop-owner seed accounts remain buyer-seller; no seed or migration implicitly grants production admin.

New password and Google accounts create buyer in the same transaction that creates the user and first local session. An existing account missing buyer is treated as an invariant violation in verification rather than silently elevated during ordinary authentication.

This is preferred over deriving seller solely from `shops.owner_id`: the explicit role supports pre-onboarding and future operational state, while the ownership relation remains the independent resource check.

### 3. Keep JWTs identity-only and enrich the safe user projection

`AuthUser` gains a required, exact, deduplicated `roles` array in canonical order `buyer`, `seller`, `admin`. Registration, login, Google login, refresh, `/auth/me`, and session restoration all return that shape. `AuthTokenService` keeps the current `sub` and `sid` claims and does not sign roles.

`AuthGuard` continues to validate the token/session, then `AuthService.authenticateAccess` loads the active user and current role assignments in one repository query. The attached authenticated request therefore carries the authoritative current `AuthUser`. Role revocation takes effect on the next protected request without token blacklists or forced family revocation.

This adds one indexed relation read to authenticated requests. The correctness and immediate revocation benefit is worth the cost at current scale; a measured short-lived authorization cache with explicit invalidation can be introduced later without changing contracts.

### 4. Compose authentication, role, and ownership policies explicitly

The auth module adds a typed `@RequireRoles(...)` metadata decorator and `RolesGuard`. Controllers apply `AuthGuard` before `RolesGuard`; missing authentication remains 401 and a current user without any accepted role becomes the new sanitized `AuthorizationDeniedError` (403). Role matching is any-of for declared roles, but T12 routes declare one canonical operational role. Admin does not implicitly satisfy seller.

Ownership is a separate `MarketplaceOwnershipService`, initially with `findOwnedShop(userId)` and `ownsShop(userId, shopId)` backed by joins/filters that include active, non-deleted users and the persisted owner. Future product and order modules extend typed methods that resolve through their stored shop relation. Controllers never compare a client-supplied owner ID.

The current real seller surface is `GET /api/v1/seller/shop`, which requires seller and returns the safe projection of the caller's owned shop or the same sanitized authorization denial used when no owned target qualifies. The lack of a target identifier removes an unnecessary enumeration path; ownership-service PostgreSQL tests still prove another seller's shop ID fails. Future identifier-based mutations must invoke the same service before work.

This explicit composition is preferred over a global guard because public homepage/catalog/product routes intentionally remain public and Nest metadata omissions would be difficult to distinguish safely. It is preferred over controller-local `if` statements because centralized guards/policies produce a testable, consistent matrix.

### 5. Use constrained command-style admin APIs and a one-time bootstrap

Admin role management uses:

- `POST /api/v1/admin/users/:userId/roles` with strict `{ role: "seller" | "admin", reason }`.
- `POST /api/v1/admin/users/:userId/roles/:role/revoke` with strict `{ reason }`.
- `GET /api/v1/admin/role-audit` with bounded cursor/limit filters and newest-first stable ordering.

All routes require current admin, validate canonical UUIDs and bounded trimmed reasons, reject unknown/inactive targets safely, and never accept an actor identifier from the body. Mutation routes also apply the existing trusted-origin boundary used by browser auth mutations. The service obtains the actor from `AuthenticatedRequest`, uses database transactions for assignment plus audit, and locks/checks the active-admin set before admin revocation so the last active admin cannot be removed. Revoking one's own admin role is allowed only when another active admin remains.

The first admin is created by `pnpm auth:roles:bootstrap-admin`, which reads an explicitly provided normalized target email and bounded reason from operator environment, loads repository `.env` through the existing safe loader, and emits only a sanitized success/conflict category. A PostgreSQL transaction-scoped advisory lock serializes the check that no active admin exists, the target is active, and the assignment/audit insert. Once any active admin exists, the command fails closed; later changes must use the authenticated admin API.

This is preferred over a seeded admin password or browser bootstrap endpoint, both of which create persistent elevation paths. A database advisory lock is chosen over an isolation-level-only count check because the invariant spans the absence of rows and must be explicit under concurrent first-admin attempts.

### 6. Keep audit retrieval safe and bounded

Audit responses expose event ID, target user ID, role, action, source, optional actor user ID, reason, and timestamp only. They do not join email/display name by default and never expose session/token data. Pagination uses a validated opaque or `(createdAt,id)` cursor with a hard maximum page size and stable `createdAt DESC, id DESC` ordering. There is no audit update/delete endpoint or repository method.

Database constraints enforce accepted enum values, nonblank bounded reasons, actor/source consistency (admin events require an actor; bootstrap/migration/seed do not), and role uniqueness. Verification performs destructive `_test` checks for constraints, indexes, cascades/restrict behavior, idempotent seed, and absence of credential-like columns.

### 7. Add role-aware operational entry pages as UX, not enforcement

The session provider already owns the safe authenticated projection in memory. Header/navigation derives seller/admin link visibility from `state.user.roles`; buyer/guest behavior remains stable. Minimal `/seller` and `/admin` client entry pages use a shared role-aware state component: loading while restoration is in flight, sign-in guidance for guests, accessible forbidden state for an authenticated insufficient role, and the operational view only after the role is present.

The seller page requests its protected shop projection through `authenticatedFetch`. The admin page provides only an honest T12 capability summary/audit read surface, not a full admin console. Direct navigation does not loop or claim authorization, and every protected data call still passes through backend guards.

This is preferred over Next.js middleware because the refresh credential is HttpOnly and the access token intentionally exists only in client memory; middleware cannot authoritatively reconstruct the T11 session without weakening token handling.

### 8. Test the permission matrix at each boundary

Contract tests cover exact role arrays, role commands, shop/audit projections, pagination, and Problem Details. Guard/service unit tests cover missing metadata, any-of matching, current-role revocation, last-admin protection, idempotency, and redaction. Supertest covers exact `/api/v1` routes, 401 versus 403, origin checks, safe bodies, seller/admin allow/deny paths, and strict inputs.

PostgreSQL tests create buyer, seller-owner, other seller-owner, and admin fixtures to verify backfill, constraints, actor audit, transaction rollback, concurrent bootstrap/grants, last-admin protection, and shop ownership from stored relations. Frontend tests cover visible links, role gates, safe forbidden/loading states, and session regression. `test:e2e:auth:quick` gains non-mutating guest and role-visibility/accessibility assertions; `test:e2e:homepage:quick` remains the focused storefront regression. Full provider OAuth is not rerun for T12.

## Risks / Trade-offs

- [Per-request role queries add database work] → Use the composite role index and one joined safe-user query; defer caching until metrics justify it and preserve immediate revocation semantics.
- [A role assignment can drift from shop ownership] → Require both seller and persisted ownership; verify all existing shop owners have seller and make T22 responsible for transactional grant during onboarding.
- [First-admin bootstrap is security-sensitive] → Provide no HTTP bootstrap, serialize with an advisory lock, accept only an existing active account, emit no account/credential detail, and disable it permanently once an active admin exists.
- [Deleting active assignment rows could be mistaken for lost history] → Keep every successful transition in a separate append-only audit table and expose no audit mutation path.
- [Frontend role state can be briefly stale] → Backend reads current assignments on every protected call; a 403 triggers safe denial and the next restoration refreshes navigation.
- [The coordinated `AuthUser` contract change breaks old clients] → Deploy API and web together in the monorepo, update strict parsers/tests in the same commit, and keep JWT/refresh cookie formats unchanged.
- [T12 cannot exercise ownership for orders that do not exist] → Prove the typed ownership pattern against real shops now and require later product/order modules to add their relation-specific policy tests before exposing mutations.

## Migration Plan

1. Add shared role/authorization contracts and Prisma schema, then generate and validate the client.
2. Apply the additive migration in an isolated database; backfill buyer/seller assignments and migration audit events while preserving all current rows.
3. Update registration/Google creation, safe user queries, guards, role services, protected routes, frontend state/navigation, and deterministic seed/verification.
4. Run migration deploy twice, seed twice, destructive `_test` verification, permission-matrix PostgreSQL tests, repository quality gates, production builds, and focused quick E2E suites.
5. Deploy API and web together. Existing access/refresh credentials continue to work because token and cookie formats do not change; responses begin returning the required roles array.
6. An authorized operator runs the first-admin bootstrap once for an existing active account and records only the sanitized outcome in deployment evidence.

Rollback favors a forward fix: the additive role tables and backfill remain harmless to the previous application, so the application can roll back without dropping data. Do not down-migrate role or audit tables after real assignments exist. If bootstrap or authorization rollout fails, disable new seller/admin entry links, retain the audit evidence, correct the service/migration forward, and rerun verification.
