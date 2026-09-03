## Context

T11 already owns account records, short-lived JWT access credentials, rotated opaque refresh sessions, an HttpOnly `sc_refresh` cookie, an in-memory web session coordinator, origin checks, sanitized Problem Details, and passwordless-capable users (`passwordHash` is nullable). See `proposal.md` for the T11.1 motivation and `specs/google-sign-in/spec.md` for the behavioral contract.

The API currently applies `/api/v1` as a global NestJS prefix, but the Google OAuth client is already registered with the exact callback `http://localhost:3001/login/oauth2/code/google`. Google requires exact redirect-URI matching, including scheme, host, port, path, and trailing slash. The registered browser origin is `http://localhost:3000`, so a real local OAuth run must consistently use `localhost`; mixing it with `127.0.0.1` would split cookies and origins.

The two Google credential values are local runtime secrets. Planning, diagnostics, tests, and verification may observe only sanitized presence/validity outcomes. They must never print, copy, commit, or retain either value outside the process configuration that uses it.

## Goals / Non-Goals

**Goals:**

- Add a server-side Google OpenID Connect authorization-code flow that fits the existing NestJS auth domain and local session lifecycle.
- Protect login CSRF, callback replay, authorization-code interception, unsafe redirects, provider-token leakage, and accidental account takeover.
- Create Google-only users and reliably recognize returning users by Google `sub`.
- Keep deterministic automated tests independent of Google accounts while providing one safe real-provider smoke procedure.

**Non-Goals:**

- Calling Google APIs, requesting offline access, or retaining Google access/refresh tokens.
- Silently merging a Google identity into an existing password account, adding an authenticated account-link/unlink screen, or supporting multiple providers.
- Replacing email/password registration, recovery, access-token, refresh-token, or logout behavior.
- Automating a real Google login in CI or re-enabling automatic GitHub Actions triggers.

## Decisions

### 1. Use a backend-owned authorization-code flow with the Google Node.js library

`GET /api/v1/auth/google/start` generates the provider request with `response_type=code`, scopes `openid email profile`, a nonce, state, and PKCE S256 challenge. It requests online access only, so Google has no reason to issue a reusable refresh token. The callback exchanges the one-time code server-side, verifies the ID token, and immediately discards all provider token material after identity resolution.

Use a pinned `google-auth-library` and its `OAuth2Client` for authorization URL generation, code exchange, signing-key handling, and ID-token verification. The provider adapter still performs explicit checks for `iss`, `aud`, `exp`, nonce, non-empty `sub`, normalized email, and `email_verified === true`; library success alone is not treated as the complete domain decision.

This is preferred over Passport strategies because the existing auth module already has explicit service, repository, clock, randomness, and test seams, and the direct adapter avoids introducing session middleware or hiding callback security decisions. A browser-posted Google Identity Services credential was considered, but the user has registered a web-server callback and the authorization-code flow matches that configuration.

### 2. Exclude exactly one callback route from the NestJS global prefix

The start route remains inside the versioned auth API. `configureApplication` excludes only `GET /login/oauth2/code/google` from the `/api/v1` prefix, and a dedicated callback controller owns that exact route. No broader prefix exclusion or duplicate callback alias is added.

Development configuration constructs the exact registered callback. Production can supply a separately validated HTTPS callback base/URI without changing the route contract. The callback never trusts a request-provided redirect URI. The comma shown after the URI in prose is punctuation and is not part of the configured path.

### 3. Persist an opaque, single-use login transaction and bind it to a short-lived cookie

Add `GoogleLoginAttempt` with digests for random state, browser binding, and nonce; protected PKCE verifier material; an allowlisted return path; UTC creation/expiry/consumption timestamps; and indexes for unique state and bounded expiry cleanup. The raw browser-binding value lives only in a short-lived HttpOnly, SameSite=Lax, Secure-in-production cookie scoped to the callback. SameSite=Lax permits the top-level Google callback while denying script access.

The PKCE verifier is encrypted at rest using an authenticated, domain-separated key derived from existing authentication signing material; it is never written to logs or verification evidence. The callback atomically marks a live attempt consumed before exchanging the code. A network or provider failure therefore requires a fresh start instead of allowing callback replay. Success, cancellation, validation failure, and expiry all clear the binding cookie, and auth writes prune only a bounded number of expired attempts.

A cookie-only self-contained transaction was considered, but a database consumption record gives restart-safe one-time semantics and works across future API replicas. A process-memory map was rejected because restarts would abandon all callbacks and multiple instances could not agree on replay.

### 4. Store a normalized provider identity keyed by Google `sub`

Add an `ExternalIdentityProvider` enum initially containing `GOOGLE` and an `ExternalIdentity` row with local user ownership, provider, case-sensitive provider subject, creation time, and last-login time. Unique constraints cover `(provider, providerSubject)` and `(provider, userId)`. No Google token or duplicate provider email is stored in this table.

For a returning subject, the repository reloads the linked active local user and creates a normal T11 refresh family. For a first-time subject, one transaction checks the normalized verified email, creates a passwordless `User`, creates the identity, and creates the initial refresh session. Unique conflicts are re-read so concurrent callbacks produce one identity/account.

If an unlinked local user already owns the email, the flow fails with sanitized guidance to use the original method. It does not silently link by email: Google documents that `sub` is stable while email can change, and a verified non-Gmail/non-Workspace address is not always authoritative forever. An explicit authenticated linking flow can be proposed later.

The local user's normalized email and display name are initialized from verified provider claims with the same length and safety bounds as registration. Later provider email/name changes do not change identity ownership or automatically overwrite local profile fields.

### 5. Finish with the existing local refresh cookie, never an OAuth value in a URL

On success the callback sets `sc_refresh` using the existing centralized policy and redirects to `http://localhost:3000/login/google/complete` with only a sanitized result and an already-validated local return path. Authorization codes, state, nonce, ID tokens, Google tokens, and local access/refresh credentials never enter the frontend URL.

The completion page asks `AuthSessionProvider` to perform the existing coordinated refresh, which rotates the cookie and stores the returned access credential only in memory. It then uses `history.replaceState` to remove outcome parameters and navigates to the allowlisted local path. Failure settles as guest and offers retry/email login without a loop.

Returning the access token directly from the callback was rejected because it would cross a browser-visible URL or page boundary and bypass the established in-memory coordinator. A frontend code exchange was rejected because it would move the client secret and provider tokens toward the browser.

### 6. Fail closed while keeping secret checks non-disclosing

Extend typed auth configuration with Google client ID/secret, callback URI, transaction TTL, cookie name, and start/callback limiter buckets. The local callback defaults to the exact registered URI; production requires an explicitly validated HTTPS URI. Google sign-in is part of T11.1 rather than an implicit half-enabled mode, so a missing, empty, placeholder, or structurally invalid required credential fails startup with only the key/capability name.

`.env.example` contains variable names and non-working placeholders only. Test helpers inject synthetic values directly. A safe diagnostic checks `defined`, `non-empty`, `not-placeholder`, and basic format and prints only those booleans. It cannot prove that Google accepts the credential pair; only a real authorization/code exchange can establish that. The manual smoke records only a pass/fail category.

The provider adapter maps Google errors to a small internal category and never forwards upstream bodies. Existing auth exception filtering and telemetry rules extend to code, state, nonce, provider tokens, subjects, emails, client credentials, and transaction cookies.

### 7. Keep local hostnames and automated verification deterministic

Local documentation and example frontend/API auth bases use `http://localhost:3000` and `http://localhost:3001` for the real Google journey. Test-owned servers may still bind loopback dynamically, but their fake provider configuration must not claim to validate the registered real-provider callback.

Unit tests cover configuration, claim verification, safe path handling, cookie policy, redaction, and frontend completion. Supertest uses an injected fake Google adapter and deterministic clock/randomness for start/callback/cancel/replay/rate-limit cases. PostgreSQL tests cover identity and attempt uniqueness, atomic account/session creation, consumption, races, and cleanup. `test:e2e:auth:quick` checks the entry control and non-mutating safe behavior against already-running services; the isolated auth gate uses a local fake provider. One documented manual run verifies the real credentials without screenshots or logs containing secrets.

## Risks / Trade-offs

- [Existing password users cannot immediately choose Google when emails match] -> Refuse unsafe silent linking now and propose an authenticated linking flow separately if needed.
- [A signing-secret rotation invalidates protected in-flight PKCE material] -> Keep attempts short-lived and fail safely; users can restart sign-in.
- [Google or its signing-key endpoint is unavailable] -> Return a generic retryable failure, create no partial identity/session, and retain email login.
- [Local `localhost` and `127.0.0.1` mixing loses cookies] -> Standardize the documented real-provider flow on `localhost` and add a configuration test for exact origins/URI.
- [OAuth app testing mode rejects non-test users] -> Document the Google test-user prerequisite and classify `access_denied` without exposing account data.
- [An encrypted transient verifier adds key-management complexity] -> Derive a domain-separated authenticated-encryption key from existing strong auth material and keep the format versioned for rotation.

## Migration Plan

1. Add pinned provider dependency, typed Google configuration, redaction keys, exact callback-prefix exclusion, and injected fake-provider seams before exposing UI.
2. Add the identity and login-attempt models in one additive Prisma migration, generate artifacts, and extend destructive `_test` verification and cleanup coverage.
3. Implement provider adapter, transaction repository/service, start/callback controllers, account resolution, local session issuance, and sanitized outcome mapping.
4. Add the login control, completion route, session-provider hook, documentation, and deterministic test layers. Update local example hosts to `localhost` for the real flow.
5. Run the full static/unit/API/database/build gates, then `test:e2e:auth:quick` and relevant homepage regressions. Finish with an explicitly initiated manual Google smoke using an authorized test user and record only sanitized status.

Rollback removes the UI entry and routes first, leaving additive identity/attempt tables harmlessly unused. A later explicit migration may remove those tables only after confirming no rollback is needed; it must not delete local users created through Google without a separate account-retention decision.

## Reference Basis

- Google OAuth 2.0 web-server applications: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OpenID Connect and ID-token validation: https://developers.google.com/identity/openid-connect/openid-connect
- Google server-side ID-token guidance: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
