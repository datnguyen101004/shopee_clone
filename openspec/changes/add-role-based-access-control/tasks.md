## 1. Role and Authorization Contracts

- [x] 1.1 Define canonical `buyer`, `seller`, and `admin` role values, ordering, membership helpers, and strict runtime parsing in the framework-neutral contracts package.
- [x] 1.2 Extend `AuthUser` and every session/current-user contract fixture with an exact, deduplicated, canonical-order roles array while keeping access-token claims unchanged.
- [x] 1.3 Add strict grant/revoke command contracts with canonical UUID targets, seller/admin-only mutation roles, and trimmed bounded reasons that reject actor or ownership fields.
- [x] 1.4 Add safe seller-shop, role-assignment result, audit-event, and bounded audit-page contracts with no credential, session, email, or password fields.
- [x] 1.5 Add authorization Problem Details types/categories for sanitized 403 denials, role conflicts, invalid commands, and protected-resource failures without exposing policy internals.
- [x] 1.6 Add contract tests for exact keys, canonical role order, duplicates/unknown roles, strict command inputs, pagination/cursors, safe projections, and rejection of privilege-escalation fields.

## 2. Role Persistence, Migration, and Seed Invariants

- [x] 2.1 Add Prisma role, audit-action, and audit-source enums plus `UserRoleAssignment` and append-only `RoleAuditEvent` relations with current-role uniqueness and bounded lookup indexes.
- [x] 2.2 Add database checks and foreign-key behavior for nonblank reasons, actor/source consistency, immutable audit shape, active assignment provenance, and safe user deletion constraints.
- [x] 2.3 Create one additive reviewed migration that preserves T11.1 data, backfills buyer for existing non-deleted users, backfills seller for existing shop owners, writes matching migration audit events, and creates no admin.
- [x] 2.4 Update password registration and first-time Google account creation so user, buyer assignment, first local session, and required audit state commit atomically under concurrent requests.
- [x] 2.5 Update deterministic local seed behavior so shop owners converge on buyer-seller, no implicit admin/production identity is introduced, and repeat seed produces no duplicate assignment or audit event.
- [x] 2.6 Extend destructive `_test` database verification for enum/check/FK/index invariants, role uniqueness, canonical backfill, shop-owner seller coverage, append-only audit behavior, and absence of credential-like columns.
- [x] 2.7 Generate Prisma artifacts and prove format, validation, migration deploy/redeploy, repeated seed, and destructive database verification pass on an isolated database.

## 3. Current-Role Resolution and Seller Ownership

- [x] 3.1 Extend auth repository reads to load current active assignments with the active user/session in one bounded query and return no role audit metadata.
- [x] 3.2 Update registration, login, Google login, refresh, access authentication, and `/auth/me` safe projections to return canonical current roles while preserving existing cookie/JWT behavior.
- [x] 3.3 Add typed `@RequireRoles(...)` metadata and a composable roles guard that runs after authentication, uses current request roles, supports declared any-of matching, and denies missing/invalid policy state.
- [x] 3.4 Add centralized sanitized authorization errors/mapping so missing identity remains 401 and insufficient role/ownership consistently returns 403 Problem Details with no protected body.
- [x] 3.5 Implement a persistence-backed marketplace ownership service for caller-owned shop lookup and explicit shop-ID checks that ignores every client-supplied owner assertion.
- [x] 3.6 Add `GET /api/v1/seller/shop`, requiring current seller and persisted ownership, with a strict safe shop projection and indistinguishable denial when no owned shop qualifies.
- [x] 3.7 Add unit tests for role matching, current-role revocation with an existing access token, admin-not-seller behavior, ownership allow/deny cases, unknown targets, and error redaction.

## 4. Auditable Admin Role Management

- [x] 4.1 Implement transactional idempotent seller/admin grants for eligible active targets, deriving the actor only from the authenticated admin and appending exactly one audit event on a real transition.
- [x] 4.2 Implement transactional revocation with absent-role idempotency, buyer-role prohibition, current-admin locking, and conflict-safe prevention of removing the last active admin.
- [x] 4.3 Implement bounded newest-first role-audit retrieval with stable cursor ordering and safe projections that do not join unrelated personal or credential data.
- [x] 4.4 Add admin-protected grant, revoke-command, and audit endpoints under `/api/v1/admin` with strict route/body/query validation and no alternate unprefixed aliases.
- [x] 4.5 Apply the trusted browser-origin boundary to admin mutations and prove unauthenticated, buyer, seller, stale-admin, and malformed requests make no persistence change.
- [x] 4.6 Add `auth:roles:bootstrap-admin` using repository environment loading, an existing active target, bounded reason, transaction advisory lock, no HTTP route, and permanent fail-closed behavior after the first active admin.
- [x] 4.7 Make bootstrap/admin command output category-only and extend redaction tests so environment input, actor/target details, database errors, credentials, tokens, and cookies cannot leak through logs or Problem Details.
- [x] 4.8 Add service/controller tests for grant/regrant, revoke/rerevoke, self-revoke with another admin, last-admin conflict, inactive/unknown targets, actor attribution, rollback, audit pagination, and bootstrap races.

## 5. Role-Aware Storefront Experience

- [x] 5.1 Update session-provider and auth API parsing/tests for required roles while preserving access tokens in memory and the existing coordinated refresh/logout behavior.
- [x] 5.2 Make marketplace navigation expose seller and admin operational links only for the corresponding validated roles, with buyer/guest/header regression coverage.
- [x] 5.3 Add a shared accessible operational role gate with stable loading, guest sign-in guidance, authenticated forbidden feedback, no protected-data flash, and no refresh/redirect loop.
- [x] 5.4 Add a minimal `/seller` entry page that loads only the caller's protected seller-shop projection through `authenticatedFetch` and handles 401/403/unavailable states safely.
- [x] 5.5 Add a minimal `/admin` entry page that exposes an honest T12 role/audit capability view without implementing the later full admin console.
- [x] 5.6 Add strict frontend API helpers for seller shop and bounded admin audit reads without accepting actor, owner, or role authority from browser state.
- [x] 5.7 Add frontend tests for canonical role visibility, keyboard/focus/live-region behavior, direct-route guest/forbidden states, seller/admin isolation, stale-role denial, responsive layout, and storage prohibition.

## 6. Integrated Permission Matrix and Documentation

- [x] 6.1 Extend Supertest coverage for exact seller/admin routes, public-route regression, strict inputs, trusted origins, safe projections, and consistent 401/403/409 Problem Details across guest, buyer, seller-owner, seller-non-owner, and admin callers.
- [x] 6.2 Add PostgreSQL permission-matrix tests for buyer defaults, shop-owner seller backfill, no implicit admin, own/foreign shop authorization, current-role resolution, and unchanged existing sessions/external identities.
- [x] 6.3 Add PostgreSQL concurrency tests for first-admin bootstrap, duplicate grants, simultaneous admin revocations, and the last-active-admin invariant.
- [x] 6.4 Add PostgreSQL rollback/audit tests proving assignment and event atomicity, stable pagination, actor/source checks, no audit mutation path, and no credential-like persisted fields.
- [x] 6.5 Extend `test:e2e:auth:quick` only with non-mutating guest/role-navigation, direct forbidden-state, and accessibility checks against already-running services; do not rerun the real Google provider flow.
- [x] 6.6 Retain `test:e2e:homepage:quick` as the focused public storefront/header regression and do not rerun unrelated historical full E2E suites.
- [x] 6.7 Document the permission matrix, ownership rule, 401/403 semantics, first-admin bootstrap, admin grant/revoke/audit workflow, last-admin protection, and future T22/T23/T25 integration obligations.
- [x] 6.8 Verify automatic GitHub Actions triggers remain disabled and no bootstrap target, role mutation input, audit runtime dump, credential, token, cookie, local database artifact, or environment value is tracked.

## 7. Final Quality Gates

- [x] 7.1 Install with `npx --yes pnpm@10.34.5 install --frozen-lockfile` and confirm no unrelated dependency or lockfile upgrade.
- [x] 7.2 Run Prisma format/generate/validate and inspect the generated migration for additive-only changes, reviewed backfill SQL, constraints, indexes, and no implicit admin creation.
- [x] 7.3 Run isolated migration deploy twice, seed twice, destructive `_test` database verification, and focused role/ownership PostgreSQL suites.
- [x] 7.4 Run repository format check, lint, typecheck, contract/unit/frontend/API tests, CI validation, and production builds with no sensitive output.
- [x] 7.5 Run `test:e2e:auth:quick` for the added role-aware journey and `test:e2e:homepage:quick` for public header/storefront regression against the intended local services.
- [x] 7.6 Exercise first-admin bootstrap only in an isolated authorized test database, record category-only outcomes for success/repeat/concurrency, and prove no bootstrap HTTP surface exists.
- [x] 7.7 Add concise T12 verification evidence covering issue #13 acceptance criteria, the allowed/denied matrix, role backfill, ownership, audit atomicity, and tracked-secret/runtime-artifact scans.
- [x] 7.8 Run strict OpenSpec validation and confirm every T12 checklist item is satisfied before apply completion.
