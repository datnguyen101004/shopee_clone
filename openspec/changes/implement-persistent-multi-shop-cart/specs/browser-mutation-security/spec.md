## Purpose

Defines the default-deny browser mutation boundary that protects cookie-backed and authenticated marketplace writes consistently while preserving narrow, explicitly verified external callback flows.

## ADDED Requirements

### Requirement: Default-deny untrusted browser mutations

Every application endpoint using `POST`, `PUT`, `PATCH`, or `DELETE` SHALL require a syntactically valid `Origin` header that exactly matches a configured trusted browser origin unless the route declares a narrow reviewed non-browser classification. Missing, `null`, wildcard-derived, malformed, or untrusted origins SHALL be rejected before controller business logic. Ordinary `GET`, `HEAD`, and `OPTIONS` application resources SHALL NOT mutate state; the only safe-method exception in current scope is an explicitly classified OAuth redirect callback protected by its dedicated verifier.

#### Scenario: Accept a trusted browser mutation

- **WHEN** an unsafe request carries an exact configured trusted origin
- **THEN** origin enforcement permits subsequent authentication, validation, and business guards to evaluate it

#### Scenario: Reject a cross-site form or fetch

- **WHEN** an unsafe request originates from an untrusted site while the browser holds a refresh or other credential cookie
- **THEN** the API returns sanitized 403 Problem Details before reading or mutating the protected resource

#### Scenario: Reject a missing origin by default

- **WHEN** an unsafe application route receives no Origin header and has no explicit non-browser classification
- **THEN** the API fails closed with the same sanitized origin denial and performs no mutation

#### Scenario: Keep ordinary reads side-effect free

- **WHEN** a public or private resource other than an explicitly classified OAuth callback is requested with GET or HEAD
- **THEN** the operation performs no persistence mutation, credential rotation, merge, or selection change

### Requirement: Centralize secure cookie policy

Credential or browser-identity cookies SHALL be configured through reviewed shared policy that makes them HttpOnly when scripts do not require access, Secure in production, SameSite=Lax for the supported same-site web deployment, scoped to the narrowest practical path, bounded by explicit lifetime, and expired using matching attributes. Production startup SHALL reject wildcard origins, insecure credential cookies, or cross-site `SameSite=None` credential mode until a separate CSRF-token contract exists.

#### Scenario: Issue a browser credential cookie

- **WHEN** the API creates a refresh, OAuth transaction, or other browser credential
- **THEN** the response applies the documented environment-safe flags and never exposes the raw credential in a response body, URL, log, analytics event, localStorage, or sessionStorage

#### Scenario: Expire a credential cookie

- **WHEN** a credential is logged out, consumed, rotated, or invalidated
- **THEN** the API expires it with the same name, path, security, and same-site attributes used when it was issued

#### Scenario: Start production with unsafe cookie configuration

- **WHEN** production configuration requests insecure credential cookies, wildcard trusted origins, or unsupported cross-site credential mode
- **THEN** application startup fails with a sanitized configuration error before serving traffic

### Requirement: Enforce strict mutation media types and shapes

Unsafe browser application routes SHALL accept only their documented media types, reject method-override parameters and headers, reject unknown input fields, bound request body size, and emit sanitized validation Problem Details. Form-compatible or text payloads SHALL NOT be silently coerced into JSON mutation DTOs.

#### Scenario: Submit documented JSON

- **WHEN** a trusted browser sends a bounded `application/json` mutation matching the exact documented DTO
- **THEN** the request proceeds to business validation

#### Scenario: Submit a simple cross-site form shape

- **WHEN** an unsafe JSON endpoint receives form-urlencoded, multipart, text/plain, method override, unknown fields, or an oversized body
- **THEN** the API rejects it before business mutation and returns no internal parsing detail

### Requirement: Classify non-browser callbacks explicitly

A non-browser mutation or externally redirected callback that cannot present a trusted browser Origin SHALL be permitted only through explicit route metadata naming its security class and a dedicated verifier appropriate to that class. OAuth browser callbacks SHALL use state, nonce, PKCE, browser binding, expiry, and single-use consumption. External webhooks SHALL use provider signature verification, timestamp/replay bounds, and idempotency before any domain mutation. The system SHALL NOT provide an unrestricted skip-security annotation.

#### Scenario: Complete the Google callback

- **WHEN** Google redirects through the documented callback without a trusted application Origin
- **THEN** the callback remains usable only after its existing state, nonce, PKCE, browser-binding, expiry, and single-use checks succeed

#### Scenario: Receive a future signed webhook

- **WHEN** an external provider calls a route classified for that provider without Origin
- **THEN** the route proceeds only after the named signature, replay, and idempotency checks succeed

#### Scenario: Misclassify an ordinary mutation

- **WHEN** an application mutation lacks trusted Origin and has no recognized dedicated verifier classification
- **THEN** it is rejected rather than bypassing global protection

### Requirement: Keep CORS and origin policy consistent

CORS SHALL reflect the same exact trusted-origin configuration as mutation enforcement, SHALL enable credentials only for a matching origin, SHALL reject wildcard credential access, and SHALL return only documented methods and headers. CORS behavior SHALL NOT be treated as the sole CSRF defense because a request can mutate state without its response being readable by the attacker.

#### Scenario: Preflight from a trusted frontend

- **WHEN** the configured web origin preflights a documented credentialed API mutation
- **THEN** the response permits only that origin and the required method and headers

#### Scenario: Preflight from an untrusted frontend

- **WHEN** an untrusted origin preflights or sends a mutation
- **THEN** CORS does not grant response access and origin enforcement independently prevents the business mutation

### Requirement: Preserve sanitized observability and compatibility

Origin, media-type, and classification failures SHALL use stable Problem Details codes and safe structured event categories without recording cookie values, bearer credentials, CSRF material, passwords, provider tokens, full request bodies, or unnecessary personal data. Existing auth, account, role, engagement, shop-follow, and future cart mutation tests SHALL prove trusted requests continue to work and untrusted or missing-origin requests fail before domain services.

#### Scenario: Record a denied mutation safely

- **WHEN** global mutation protection denies a request
- **THEN** observability may record route class, method, sanitized source digest, outcome code, and trace identifier but no raw secret, cookie, authorization header, body, or submitted identity

#### Scenario: Regress an existing trusted mutation

- **WHEN** a completed browser flow sends its documented trusted Origin after global protection is enabled
- **THEN** it retains its prior authorization, validation, idempotency, and response behavior after passing the shared boundary
