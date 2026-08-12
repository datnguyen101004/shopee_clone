## 1. Contracts, Dependencies, and Configuration

- [x] 1.1 Add pinned NestJS JWT, DTO validation, cookie parsing, and OpenAPI dependencies plus required type packages without introducing a native password-hashing build script.
- [x] 1.2 Define framework-neutral registration, login, refresh/session, current-user, forgot-password, reset-password, and authentication Problem Details contracts with strict runtime parsers.
- [x] 1.3 Add contract tests for valid payloads, normalized emails, safe user projections, token-response bounds, invalid additional properties, and sanitized failures.
- [x] 1.4 Implement typed authentication environment parsing for signing material, issuer/audience, lifetimes, allowed origins, proxy trust, cookie mode, hashing policy, limiter thresholds, and recovery delivery mode.
- [x] 1.5 Make production startup reject weak secrets, wildcard/untrusted origins, insecure cookies, test-only hashing settings, or development recovery delivery while keeping explicit safe test configuration.
- [x] 1.6 Enable global DTO validation, credentialed allowlist CORS, cookie parsing, trusted-origin checks, and OpenAPI auth documentation without changing public catalogue availability.

## 2. Authentication Persistence

- [x] 2.1 Extend Prisma `User` with nullable versioned `passwordHash` and relations to refresh sessions and password-reset credentials.
- [x] 2.2 Add `AuthSession` persistence for token digest, user, family, expiry, rotation, successor, revocation, creation, and bounded last-use metadata with required unique constraints and indexes.
- [x] 2.3 Add `PasswordResetToken` persistence for unique digest, user, expiry, use/revocation, creation, and delivery state with required indexes.
- [x] 2.4 Create a reviewed SQL migration that detects normalized-email collisions, lowercases/trims current emails, enforces canonical email storage, and adds the new credential tables without destructive data loss.
- [x] 2.5 Update deterministic local seed data with explicitly non-production demo credentials or locked no-credential identities while preserving idempotent upserts and existing shop ownership.
- [x] 2.6 Extend destructive `_test` database verification for email normalization/uniqueness, token-digest uniqueness, session/reset foreign keys, timestamp constraints, cascade/restrict behavior, and repeated migration/seed execution.
- [x] 2.7 Generate Prisma artifacts and prove format, schema validation, clean-database migration, repeated deploy, repeated seed, and database verification all pass.

## 3. Cryptographic and Security Foundations

- [x] 3.1 Implement one canonical email normalizer and password policy covering 8–128 untrimmed characters, common-password rejection, and safe field errors.
- [x] 3.2 Implement asynchronous versioned scrypt hashing and verification with random salts, production parameter floors, a bounded concurrency pool, timing-safe comparison, and dummy verification for unknown accounts.
- [x] 3.3 Implement signed 15-minute access-token issuance/verification with required `sub`, `sid`, issuer, audience, issue, and expiry claims plus malformed-claim rejection.
- [x] 3.4 Implement domain-separated random refresh/reset token generation, SHA-256 storage digests, constant-time-safe lookup behavior, and strict token format bounds.
- [x] 3.5 Implement centralized refresh-cookie creation/expiry with HttpOnly, SameSite, auth-only path, environment-derived Secure, explicit lifetime, and no response-body disclosure.
- [x] 3.6 Implement privacy-preserving limiter keys, trusted request-source resolution, configurable endpoint buckets, consecutive-login-failure clearing, 429 Problem Details, and `Retry-After`.
- [x] 3.7 Unit-test normalization, password envelopes and upgrades, dummy verification, JWT claims/signatures/expiry, token entropy/format/digests, cookie flags, origin policy, and limiter behavior.

## 4. Registration, Login, and Current User API

- [x] 4.1 Create a capability-oriented NestJS authentication module with repository, service, controller, guard, request context, exception filter, clock/randomness ports, and dependency-injected test seams.
- [x] 4.2 Implement race-safe registration that canonicalizes input, hashes the password, maps unique conflicts to sanitized registration Problem Details, and atomically creates the first refresh session.
- [x] 4.3 Implement login with equivalent unknown/wrong-password/unavailable-account behavior, timing mitigation, abuse limits, safe telemetry, and new refresh-family creation.
- [x] 4.4 Implement a bearer authentication guard that validates token claims and reloads the minimal active user/session state without trusting client user identifiers.
- [x] 4.5 Implement `GET /api/v1/auth/me` with the shared safe projection and sanitized 401 behavior for expired, revoked, suspended, deleted, or malformed identities.
- [x] 4.6 Implement register/login/current-user DTOs, status codes, cache headers, cookie effects, OpenAPI annotations, and stable `application/problem+json` mappings.
- [x] 4.7 Add service/controller tests for successful flows, validation bounds, normalized duplicate races, account-enumeration resistance, unavailable accounts, guard failures, safe projections, and error redaction.

## 5. Refresh Rotation and Logout

- [x] 5.1 Implement transactional refresh rotation with conditional invalidation, one successor, new access credential, new cookie, and no more than one winner for concurrent requests.
- [x] 5.2 Implement the five-second non-issuing concurrency tolerance and later rotated-token reuse detection that revokes the full refresh family.
- [x] 5.3 Reject unknown, malformed, expired, revoked, or wrong-family refresh credentials uniformly and clear an unusable browser cookie.
- [x] 5.4 Implement idempotent logout that revokes the current refresh session when present and always returns `204` with an expired cookie.
- [x] 5.5 Add bounded opportunistic cleanup for expired/revoked session rows without placing unbounded work on an authentication request.
- [x] 5.6 Add unit and PostgreSQL concurrency tests for rotation chains, one-winner races, tolerance behavior, family reuse revocation, expiry, repeated logout, and cleanup bounds.

## 6. Password Recovery and Safe Failure Handling

- [x] 6.1 Implement generic forgot-password behavior that performs equivalent public work for eligible and ineligible accounts and never exposes existence or a raw reset credential.
- [x] 6.2 Implement the `RecoveryMailer` port, in-memory test capture adapter, and gitignored permission-restricted local file outbox with production-mode rejection.
- [x] 6.3 Revoke prior reset credentials, create one hashed 30-minute credential, build an allowlisted no-referrer frontend reset link, and compensate safely when delivery fails.
- [x] 6.4 Implement transactional reset consumption that validates the password, updates its scrypt hash, invalidates all reset credentials, and revokes every refresh family for the user.
- [x] 6.5 Map expired, unknown, malformed, used, or delivery-failed recovery cases to stable sanitized Problem Details while keeping secrets and connection strings out of errors/logs.
- [x] 6.6 Apply distinct request-source and identity limits to forgot/reset endpoints without making response differences an account-existence oracle.
- [x] 6.7 Add service/API/PostgreSQL tests for generic recovery responses, single-use/expiry, prior-token invalidation, delivery compensation, atomic password/session revocation, limiter behavior, and secret redaction.

## 7. Frontend Session and Account Experiences

- [x] 7.1 Build a strict credentialed auth API client that parses shared contracts, keeps access credentials in memory, and never stores or logs authentication secrets.
- [x] 7.2 Add an `AuthSessionProvider` with one in-flight restoration/refresh, one guarded retry after 401, explicit loading/authenticated/guest states, and loop-free failure fallback.
- [x] 7.3 Integrate session state into the storefront layout and marketplace header so authenticated users see their display name and can log out while guests retain login links.
- [x] 7.4 Extract and test the T10 product login-intent allowlist so only matching canonical product fields reconstruct an internal return path and unsafe values fall back to `/`.
- [x] 7.5 Replace the login placeholder with an accessible responsive form that clears passwords on failure, prevents duplicate submission, shows generic errors, and returns safely after success.
- [x] 7.6 Add accessible responsive registration with client guidance, server-authoritative validation display, password confirmation only in the browser, and authenticated success handling.
- [x] 7.7 Add forgot-password and no-referrer reset-password pages with generic accepted messaging, one-time token handling, success navigation, and no secret persistence.
- [x] 7.8 Add frontend unit/integration tests for form labels/focus/live announcements, validation, pending states, password clearing, session restoration, single retry, logout, header state, storage prohibition, and redirect hardening.
- [x] 7.9 Update product-detail login continuation messaging so T11 returns to the product without falsely claiming add-to-cart or buy-now was executed.

## 8. Integrated Verification, Browser Coverage, and Documentation

- [x] 8.1 Add Supertest coverage for every `/api/v1/auth` endpoint, cookie attribute, bearer guard, Problem Details type, CORS/origin rejection, rate limit, and sanitized dependency failure.
- [x] 8.2 Add isolated PostgreSQL auth tests for canonical-email registration races, real scrypt envelopes, refresh rotation/reuse, logout, recovery/reset transactions, and foreign-key/index invariants.
- [x] 8.3 Add `test:e2e:auth:quick` for non-mutating guest/account-page rendering, client validation, responsiveness, and accessibility against already-running services.
- [x] 8.4 Add an isolated `test:e2e:auth` runner that owns a unique Compose project/database, applies migrations and seed, injects the capture mailer, starts production builds, and cleans exact resources in `finally`.
- [x] 8.5 Cover registration, login, restoration, invalid credentials, refresh, logout, valid/unsafe product return intent, forgot/reset, session revocation, and three responsive viewports in Playwright.
- [x] 8.6 Add stable mobile/tablet/desktop auth snapshots only to the isolated production-build gate; keep quick mode focused on behavior and accessibility.
- [x] 8.7 Run `test:e2e:homepage:quick`, `test:e2e:catalog:quick`, and `test:e2e:product:quick` as regressions for shell, public discovery, and T10 purchase entry points.
- [x] 8.8 Document endpoints, token/cookie lifecycle, password policy, local recovery outbox, environment variables, limiter limitations, cleanup/retention, safe troubleshooting, and demo-only credentials.
- [x] 8.9 Verify no automatic GitHub Actions trigger is re-enabled and no real secret, raw credential, reset link, runtime outbox, or local database artifact is tracked.

## 9. Final Quality Gates

- [x] 9.1 Install with the pinned package manager and frozen lockfile, then run Prisma format/generate/validate, migration deploy, idempotent seed, and destructive `_test` database verification.
- [x] 9.2 Run repository format check, lint, typecheck, contract/unit/frontend/API tests, and production builds with no authentication-secret output.
- [x] 9.3 Run focused `test:e2e:auth:quick` plus the homepage, catalogue, and product quick regressions against the intended local services.
- [x] 9.4 Run the isolated production `test:e2e:auth` gate from a clean database through cleanup and confirm refresh/recovery security cases and three viewports pass.
- [x] 9.5 Add concise T11 verification evidence, run strict OpenSpec validation, and confirm every checklist item and issue #12 acceptance/test requirement is satisfied before apply completion.
