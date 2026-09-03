## Context

See `proposal.md` for motivation and `specs/account-authentication/spec.md` for the behavior contract. The NestJS API currently has no authentication module, global DTO validation, CORS credential policy, cookie handling, or signing configuration. Prisma has a normalized-looking but case-sensitive unique email and no password/session/recovery persistence. The Next.js `/login` route deliberately does not collect credentials, while product detail already emits a narrowly structured login intent.

T11 must establish a reusable identity boundary without taking over role authorization (T12), profile/address data (T13), cart persistence (T16), or checkout. PostgreSQL remains the durable source of truth; Redis is still deferred. CI workflows remain manual-only while the repository's temporary CI pause is in effect.

## Goals / Non-Goals

**Goals:**

- Make email/password registration, login, refresh, logout, current-user discovery, forgot-password, and reset-password complete and testable end to end.
- Keep raw passwords and reusable tokens out of storage, browser persistence, URLs where avoidable, errors, analytics, and logs.
- Make refresh rotation and password reset transactional, race-safe, revocable, and independently auditable through persisted timestamps.
- Introduce reusable API validation, authentication guard, cookie/origin policy, and frontend runtime session primitives for later roadmap tasks.
- Preserve the T10 purchase-intent boundary safely while returning the user to the product page after login.

**Non-Goals:**

- Username login, social login, passkeys, MFA, email verification, role/permission assignment, account lock administration, or user-facing session-device management.
- Executing add-to-cart or buy-now after login; those remain blocked on T16 and later checkout work.
- Distributed rate limiting, Redis, multi-region session replication, or a production transactional email vendor integration.
- Re-enabling automatic GitHub Actions triggers.

## Decisions

### 1. Use normalized email as the only T11 login identifier

Registration and login trim the address and store it lowercase in the existing `User.email` column. The migration normalizes current rows only after asserting that normalization creates no collision, then adds a database check that persisted emails are already normalized. The existing unique constraint therefore enforces concurrency-safe case-insensitive identity without adding a second lookup column.

`displayName` remains required. `passwordHash` is nullable so existing imported/seed placeholder identities can remain non-login accounts; self-service registration always writes a hash. Login treats a missing hash exactly like unknown or unavailable credentials.

Alternatives considered:

- PostgreSQL `citext`: correct but adds an extension and a database-specific Prisma mapping for a need handled by canonical storage.
- A separate `normalizedEmail`: explicit but duplicates data and permits drift unless additional constraints and synchronization are added.
- Username login: deferred because uniqueness, rename, reserved-name, and enumeration policies belong in a separate requirement.

### 2. Hash passwords with versioned asynchronous scrypt

Use Node's asynchronous `crypto.scrypt` with a random per-password salt and a versioned encoded format containing algorithm parameters, salt, and derived key. Production defaults follow the documented memory-hard policy; tests inject a lower-cost policy while exercising the same format and verification code. Comparison uses `timingSafeEqual`, and login performs a dummy verification when no usable account hash exists to reduce timing-based enumeration.

This avoids native build-script approval and platform-specific binaries while still providing a strong adaptive, memory-hard password hash. Argon2id was considered, but its native dependency adds Windows/Corepack installation risk to this repository. bcrypt was considered but has weaker memory-hardness and password-length behavior.

Passwords are accepted from 8 through 128 characters, are not trimmed, and are checked against a compact committed blocklist of common values. The server is authoritative even when the web form provides matching guidance.

### 3. Use signed short-lived access tokens and opaque rotating refresh tokens

Access tokens are HS256 JWTs signed by an authentication-only secret of at least 32 random bytes. Required claims are `sub` (user UUID), `sid` (session UUID), `iss`, `aud`, `iat`, and `exp`; the default lifetime is 15 minutes. The API returns an access token in the JSON session response, and the web client keeps it only in memory. A custom Nest guard verifies the token and reloads the minimal user/session state required to reject suspended, deleted, or revoked identities.

Refresh tokens are 32 random bytes encoded base64url. Only a SHA-256 digest is stored. The raw value is sent in a cookie named `sc_refresh` with `HttpOnly`, `SameSite=Lax`, an auth-only path, an explicit maximum age, and `Secure` in production. The default refresh lifetime is 30 days.

Each refresh row belongs to a family and records expiry, rotation, revocation, successor, creation, and last-use timestamps. A transaction conditionally invalidates the current row and creates its successor; at most one concurrent request wins. Reuse within a five-second concurrency tolerance fails without issuing credentials or revoking the family, because another tab may already have replaced the shared cookie. Reuse after that tolerance revokes the whole family. Logout revokes the cookie's current session and always clears the cookie; already issued access tokens naturally expire within 15 minutes.

Alternatives considered:

- Persisted access tokens: immediate revocation is easier but adds a database lookup to every authenticated request without being required by T11.
- Long-lived JWT refresh tokens: harder to rotate and revoke safely than random opaque secrets.
- Browser local storage: rejected because script compromise would expose both credential tiers.

### 4. Keep session responses and shared contracts framework-neutral

`packages/contracts` owns registration/login/reset request shapes, safe session-user and session-response shapes, Problem Details extensions, and strict runtime parsers used by the web application. It contains no NestJS, Prisma, React, JWT, or cookie types.

The API exposes:

- `POST /api/v1/auth/register` → `201` session response plus refresh cookie.
- `POST /api/v1/auth/login` → `200` session response plus refresh cookie.
- `POST /api/v1/auth/refresh` → `200` rotated session response plus refresh cookie.
- `POST /api/v1/auth/logout` → idempotent `204` plus an expired cookie.
- `GET /api/v1/auth/me` → `200` safe user projection for a bearer access token.
- `POST /api/v1/auth/forgot-password` → generic `202`.
- `POST /api/v1/auth/reset-password` → `204` on a valid reset.

Nest DTOs plus a global validation pipe enforce input bounds and reject unsupported properties. Authentication errors use stable `application/problem+json` types. OpenAPI documents request/response DTOs, bearer authentication, cookie effects, rate-limit responses, and deliberately generic failures.

### 5. Store refresh sessions and reset credentials as separate durable records

Add `AuthSession` and `PasswordResetToken` models with UUID primary keys, `User` relations, unique token digests, UTC expiry/use/revocation timestamps, and indexes for active-user and expiry lookups. `User.passwordHash` stores only the versioned scrypt envelope.

Reset tokens use a separately domain-tagged 32-byte random value and SHA-256 digest, expire after 30 minutes by default, and are never returned by the public API. Requesting a new reset invalidates older unused tokens. Consuming one updates the password, marks all reset tokens unavailable, and revokes all user refresh families in one database transaction.

Expired token rows are pruned opportunistically with bounded deletes during auth writes, and retention behavior is documented for T38 operational scheduling. The migration and seed remain idempotent; local demo credentials are explicitly non-production fixtures, while production seeding creates no known password.

### 6. Introduce a replaceable recovery delivery port

The auth domain sends reset links through a `RecoveryMailer` interface. Tests inject an in-memory capture implementation that never prints a token. Local development may use a gitignored file outbox with restrictive file permissions so a developer can exercise recovery without a third-party account; the path is documented and never included in API responses. Production rejects capture/file delivery modes at startup. A future SMTP/vendor adapter can implement the same port without changing the auth service or contract.

If delivery fails, the newly issued reset record is revoked before returning sanitized 503 Problem Details. The API never logs the reset URL. Unknown or unavailable accounts still execute equivalent non-secret work and return the same generic 202 response.

### 7. Apply layered process-local abuse limits with privacy-preserving keys

T11 uses an injected in-process limiter because the deployment remains a single modular-monolith instance and Redis is explicitly deferred. Separate configurable buckets cover request source, HMAC-normalized identity, and refresh-session identity. Raw emails and raw tokens are never limiter keys or log fields. Proxy headers are trusted only when an explicit proxy configuration is enabled.

Safe defaults include tighter login and recovery windows and a higher refresh ceiling. Limited responses use stable 429 Problem Details and `Retry-After`. Successful login clears only the identity's consecutive-failure bucket. This is meaningful single-instance protection, not a claim of distributed enforcement; T38 must replace or externalize it before horizontal scale.

### 8. Require credentialed CORS, trusted origins, and fail-fast configuration

The API enables credentialed CORS only for an explicit web-origin allowlist. Browser auth mutations validate `Origin` when present, cookies use environment-derived secure attributes, and production refuses wildcard origins, weak/missing signing material, insecure cookies, or development recovery delivery. `.env.example` documents placeholders and never contains a working production secret.

The exception boundary redacts database URLs and all credential/token fields. Authentication telemetry records event type, outcome, user/session identifiers only after authentication when appropriate, and coarse request metadata; it never records submitted credentials or raw tokens.

### 9. Restore browser sessions through one in-memory coordinator

A client-side `AuthSessionProvider` owns the access token and safe user projection. On storefront startup it performs at most one in-flight refresh request, then loads or accepts the returned user. API calls attach the bearer token; one 401 may trigger one coordinated refresh and one retry, after which state becomes guest. No authentication value is written to local storage, session storage, browser-readable cookies, or URLs.

The provider supplies authenticated account state to the marketplace header. `/login`, `/register`, `/forgot-password`, and `/reset-password` use accessible client forms inside the existing storefront shell. Password fields clear after failure and pending state blocks duplicate submission. The reset page uses a no-referrer policy while the one-time reset value is present.

The existing server-side product intent parser becomes a shared allowlist. After login, only an internally reconstructed product path is used; unsafe inputs fall back to `/`. T11 does not replay cart or checkout mutations.

### 10. Split fast feedback from isolated security verification

Unit and contract tests cover normalization, password envelopes, token claims, cookie policy, parser behavior, error redaction, limiter keys, and frontend session coordination. Supertest covers all public endpoints and guards with deterministic fakes. PostgreSQL integration tests cover unique normalized email races, refresh rotation/reuse, password-reset atomicity, revocation, and migration constraints.

`test:e2e:auth:quick` runs only non-mutating page, validation, accessibility, and guest-state checks against already-running services. `test:e2e:auth` owns an isolated Docker Compose project, migrates and seeds it, injects a capture mailer, exercises registration/login/refresh/logout/recovery/reset at three viewports, and cleans up in a `finally` path. Existing `test:e2e:homepage:quick`, catalogue, and product regressions remain required as proportionate gates. No task changes automatic CI triggers.

## Risks / Trade-offs

- [Process-local throttling can be bypassed across replicas or restarts] → Document the single-instance boundary, use layered keys now, and make a distributed limiter a T38 deployment prerequisite.
- [A stolen access token remains usable after logout until expiry] → Keep access lifetime short, validate user/session state on protected requests, and revoke refresh continuation immediately.
- [Refresh rotation races across tabs can look like token theft] → Permit a short non-issuing concurrency tolerance and coordinate refresh requests in the web client; revoke the family on later reuse.
- [Password hashing can consume CPU and memory under attack] → Use asynchronous scrypt, bounded input length, login limits, and a constrained hashing concurrency pool.
- [A local file outbox contains a usable reset link] → Keep it gitignored, development-only, permission-restricted, documented for cleanup, and forbidden in production.
- [Case normalization may collide with legacy email rows] → Make migration collision detection fail before changing data or constraints and document manual remediation.
- [Client-only session restoration briefly renders guest header state] → Expose an explicit loading state and avoid redirecting protected experiences until restoration settles; a future BFF/SSR session design can replace it without changing API behavior.

## Migration Plan

1. Add dependencies and fail-fast auth configuration with safe test/development defaults; do not enable routes until persistence exists.
2. In one reviewed migration, detect normalized-email collisions, normalize existing emails, add the normalization check, add nullable `password_hash`, and create refresh-session/reset-token tables and indexes.
3. Update deterministic local seed and destructive `_test` verification without assigning production-known credentials.
4. Deploy the API auth module and contracts, then the web session/forms/header changes. Existing public catalogue routes remain anonymous.
5. Run format, lint, typecheck, unit/API tests, database verification, production builds, quick regressions, and the isolated auth browser gate.

Rollback application code first. The added tables and nullable password column are backward-compatible with the pre-T11 application, so retain them during rollback to avoid destroying sessions or credential hashes. Remove them only through a later explicit data-retention migration after confirming rollback permanence.
