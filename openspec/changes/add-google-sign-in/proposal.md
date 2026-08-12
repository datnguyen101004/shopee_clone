## Why

T11 currently supports only email/password authentication, while a Shopee-like storefront should let buyers enter quickly with an existing Google account. T11.1 adds a secure Google sign-in path that reuses the established in-memory access-token and HttpOnly refresh-session model without exposing OAuth credentials or provider tokens to browser storage.

## What Changes

- Add a backend-owned Google OpenID Connect authorization-code flow with an exact callback at `http://localhost:3001/login/oauth2/code/google`.
- Add one-time `state`, nonce, PKCE, safe return-path handling, verified Google ID-token claims, and sanitized cancellation/failure behavior.
- Persist a Google identity by the stable Google `sub` claim and create or reuse a local account and normal Shopee Clone refresh session.
- Refuse silent linking when an unlinked local account already owns the normalized Google email; T11.1 does not use an email match alone as proof that two identities should merge.
- Add an accessible "Continue with Google" action and callback-completion experience to the existing login page while keeping all access credentials in runtime memory.
- Load `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only from runtime environment configuration, never emit their values, persist them, or commit them; add non-secret placeholders and safe configuration checks.
- Add unit, API, PostgreSQL, frontend, quick E2E, and manual real-provider verification coverage without re-enabling automatic CI triggers.

## Capabilities

### New Capabilities

- `google-sign-in`: Google identity authorization, account resolution, local session creation, browser completion, security boundaries, and verification behavior.

### Modified Capabilities

None. The existing account-authentication behavior remains compatible; Google sign-in creates the same local session shape through an additional provider-specific capability.

## Impact

- NestJS authentication configuration, routing, controller/service boundaries, error mapping, and application global-prefix exclusions.
- Prisma user relations, a provider-identity model, migration, generated client, seed/verification scripts, and PostgreSQL integration tests.
- Next.js login and OAuth-completion routes, auth API/session coordination, shared contracts, accessibility tests, and Playwright journeys.
- A pinned Google-supported Node.js authentication library plus runtime network calls to Google authorization, token, and signing-key endpoints.
- Local setup must use the exact registered `localhost` origins and redirect URI; existing catalogue and email/password authentication remain available.
