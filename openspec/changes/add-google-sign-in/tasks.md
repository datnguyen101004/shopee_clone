## 1. Dependencies, Contracts, and Safe Configuration

- [x] 1.1 Add a pinned `google-auth-library` dependency to the NestJS API with a frozen pnpm lockfile and no unrelated package upgrades.
- [x] 1.2 Define framework-neutral Google sign-in outcome, safe continuation, and sanitized Problem Details contracts with strict runtime parsing and no provider-token fields.
- [x] 1.3 Extend typed auth configuration for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, the exact local callback, transaction lifetime/cookie policy, and provider start/callback limiter buckets.
- [x] 1.4 Add `.env.example` non-working placeholders and a safe preflight that reports only `defined`, `non-empty`, `not-placeholder`, and basic-format booleans without printing, copying, or persisting either credential value.
- [x] 1.5 Make missing, empty, placeholder, malformed, or unsafe-production Google configuration fail closed with sanitized errors while deterministic tests inject synthetic values.
- [x] 1.6 Standardize the documented real-provider local flow on `http://localhost:3000` and `http://localhost:3001` so frontend calls, callback cookies, allowed origins, and Google registration use the same hostname.
- [x] 1.7 Extend secret-field redaction and tests for client credentials, codes, state, nonce, PKCE material, Google tokens, provider subjects, emails, and transient cookies.

## 2. Provider Identity and Login-Transaction Persistence

- [x] 2.1 Add `ExternalIdentityProvider.GOOGLE` and an `ExternalIdentity` relation keyed by case-sensitive `(provider, providerSubject)` with one identity per provider/user and no stored Google token.
- [x] 2.2 Add `GoogleLoginAttempt` persistence for state/browser/nonce digests, protected PKCE verifier material, validated return path, expiry, consumption, and UTC audit timestamps.
- [x] 2.3 Create one additive reviewed Prisma migration with identity ownership, attempt uniqueness, timestamp checks, foreign keys, and active/expiry lookup indexes without changing existing auth data.
- [x] 2.4 Update deterministic seed behavior so repeated seeding remains idempotent and introduces no real Google identity, credential, or known production account.
- [x] 2.5 Extend destructive `_test` database verification for identity uniqueness, provider-subject case sensitivity, attempt digests, expiry/consumption checks, cascades, indexes, and repeated migration/seed execution.
- [x] 2.6 Generate Prisma artifacts and prove schema format, validation, clean migration deploy, repeat deploy, repeat seed, and database verification pass.

## 3. OAuth Security and Google Provider Adapter

- [x] 3.1 Implement domain-separated generation/digests for state, browser binding, and nonce plus an RFC-compliant PKCE verifier and S256 challenge.
- [x] 3.2 Implement versioned authenticated encryption for transient PKCE verifier storage using a domain-separated key derived from strong existing auth material, with tamper and rotation failure tests.
- [x] 3.3 Add centralized short-lived Google transaction cookie creation/expiry with HttpOnly, SameSite=Lax, callback-only path, environment-derived Secure, and no JavaScript exposure.
- [x] 3.4 Implement repository operations that create an attempt, atomically consume exactly one live matching state/browser transaction, and prune expired rows with bounded work.
- [x] 3.5 Define an injected Google provider port, a deterministic fake, and a real `OAuth2Client` adapter so automated tests never need a Google account or real credential values.
- [x] 3.6 Generate authorization requests with only `openid email profile`, online access, state, nonce, PKCE S256, and the exact configured callback; never accept a request-provided callback.
- [x] 3.7 Exchange codes server-side and explicitly verify signature, issuer, audience, expiry, nonce, non-empty `sub`, normalized email, `email_verified`, and bounded display claims before returning a provider identity.
- [x] 3.8 Map cancellation, state mismatch, replay, invalid claims, exchange rejection, and upstream outage to sanitized internal outcomes without forwarding Google response bodies.
- [x] 3.9 Unit-test randomness bounds, digests, encryption, cookies, attempt expiry/consumption, exact provider parameters, claim validation, limits, and complete secret redaction.

## 4. NestJS Flow, Account Resolution, and Local Sessions

- [x] 4.1 Add `GET /api/v1/auth/google/start` with safe return-intent parsing, privacy-preserving source limits, attempt creation, binding cookie, no-store headers, and provider redirect.
- [x] 4.2 Exclude only `GET /login/oauth2/code/google` from the NestJS global prefix and implement that exact callback without a duplicate `/api/v1` alias or trailing-slash variant.
- [x] 4.3 Implement callback handling that consumes the transaction once, clears its cookie on every outcome, validates provider identity, and redirects only to the trusted frontend base.
- [x] 4.4 Atomically create a passwordless local user, Google identity, and first refresh family for a new subject whose normalized email is unused.
- [x] 4.5 Reuse the linked active local user for a returning Google `sub`, tolerate later verified-email/name changes without changing ownership, and reject suspended/deleted users safely.
- [x] 4.6 Refuse a first-time subject when an unlinked local account already owns the normalized email, creating neither a duplicate nor a silent link and returning sanitized original-method guidance.
- [x] 4.7 Handle concurrent first-time callbacks and unique conflicts so exactly one provider identity/account is retained and losing requests resolve safely.
- [x] 4.8 Issue the established local refresh session/cookie on success, discard provider tokens immediately, and redirect with no code, state, nonce, ID token, Google token, or local credential in the URL.
- [x] 4.9 Add service/controller tests for start, success, returning identity, first-time registration, email collision, cancellation, replay, expiry, invalid claims, account status, rate limits, cookies, headers, and redaction.
- [x] 4.10 Add PostgreSQL transaction tests for account/session atomicity, subject and email races, one-time attempt consumption, rollback, and bounded cleanup.

## 5. Storefront Login and Completion Experience

- [x] 5.1 Add a safe frontend Google-start URL builder that forwards only the existing allowlisted local continuation and never reads or embeds a Google credential.
- [x] 5.2 Add a responsive accessible "Continue with Google" control and visual separator to the current login form while preserving email/password, registration, and recovery paths.
- [x] 5.3 Add `/login/google/complete` with no-store/no-referrer behavior, accessible pending/cancelled/failed states, duplicate-completion protection, and a safe retry route.
- [x] 5.4 Extend `AuthSessionProvider` with one coordinated OAuth-completion restoration that rotates the local refresh cookie, stores access state only in memory, and cannot form a refresh/redirect loop.
- [x] 5.5 Navigate successful completion only to the validated local path, fall back to `/`, and remove all transient outcome/continuation parameters from browser history after reading them.
- [x] 5.6 Add frontend tests for labels, keyboard/focus/live-region behavior, responsive layout, pending protection, safe URL construction, session restoration, failure fallback, history cleanup, storage prohibition, and existing credential-login regression.

## 6. Integrated Verification and Documentation

- [x] 6.1 Extend Supertest coverage for exact prefixed/unprefixed routes, redirects, fake-provider exchange, cookies, CORS/origin behavior, callback replay, rate limits, Problem Details, and sanitized dependency failures.
- [x] 6.2 Add contract and PostgreSQL integration coverage for safe outcomes, normalized new-account creation, returning-subject resolution, collision refusal, concurrency, and absence of persisted Google token material.
- [x] 6.3 Extend `test:e2e:auth:quick` with non-mutating Google entry, accessibility, safe continuation, and sanitized completion checks against already-running services; do not turn it into a real external-provider run.
- [x] 6.4 Keep provider behavior deterministic through injected fakes in automated suites and retain `test:e2e:homepage:quick` as the focused storefront/header regression instead of rerunning every historical full E2E flow.
- [x] 6.5 Document the exact Google Console origin/callback, `localhost` requirement, OAuth testing-mode test-user prerequisite, runtime variables, account-collision policy, token lifecycle, and safe troubleshooting categories.
- [x] 6.6 Add a manual real-provider smoke procedure that displays only pass/fail categories and explicitly forbids credential/token output, screenshots containing sensitive URLs, or copying `.env` values into evidence.
- [x] 6.7 Verify automatic GitHub Actions triggers remain disabled and no real credential, provider token, transient cookie, runtime OAuth record dump, or local database artifact is tracked.

## 7. Final Quality Gates

- [x] 7.1 Install with `npx --yes pnpm@10.34.5 install --frozen-lockfile` and confirm the pinned dependency graph without changing the global pnpm installation.
- [x] 7.2 Run Prisma format/generate/validate, clean migration deploy, idempotent seed, and destructive `_test` database verification.
- [x] 7.3 Run repository format check, lint, typecheck, contract/unit/frontend/API/PostgreSQL tests, and production builds with no secret-bearing output.
- [x] 7.4 Run focused `test:e2e:auth:quick` for the added journey and `test:e2e:homepage:quick` for header/storefront regression against the intended local services.
- [x] 7.5 With an explicitly authorized Google test user, execute the manual `localhost` provider smoke and record only success or a sanitized configuration/consent/callback/claim category; never record either environment value.
- [x] 7.6 Add concise T11.1 verification evidence, run strict OpenSpec validation, and confirm every checklist item is satisfied before apply completion.
