# Account authentication (T11)

T11 adds email registration, login, session restoration, logout, and password recovery to the storefront. It intentionally does not add roles, seller authorization, persistent cart, checkout, OAuth, MFA, or distributed rate limiting.

## Local use

Copy `.env.example` to the ignored `.env`, start PostgreSQL, apply migrations, seed, and run both applications:

```bash
pnpm infra:up
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Account pages are `/login`, `/register`, `/forgot-password`, and `/reset-password`. OpenAPI documentation is available at `http://localhost:3001/api/docs`.

The deterministic seed users are locked identities: they have no password and cannot sign in. Create a development account through `/register`. This avoids committing a reusable demo password.

## HTTP endpoints

All endpoints are under `/api/v1/auth` and emit `Cache-Control: no-store`.

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| `POST` | `/register` | `201` | Create an active email account and first session |
| `POST` | `/login` | `200` | Verify credentials and create a new session family |
| `POST` | `/refresh` | `200` | Rotate the HttpOnly refresh cookie and issue access credentials |
| `POST` | `/logout` | `204` | Revoke the current refresh session and expire its cookie |
| `GET` | `/me` | `200` | Return the safe user projection for a bearer access token |
| `POST` | `/forgot-password` | `202` | Return a generic recovery acknowledgement |
| `POST` | `/reset-password` | `204` | Consume a single-use reset token, change password, revoke sessions |

Failures use sanitized `application/problem+json`. Registration conflicts do not identify an existing account beyond the submitted operation failing. Unknown account, wrong password, suspended account, and deleted account share one login failure. Forgot-password returns the same public response for eligible and ineligible addresses.

## Credential lifecycle

- Passwords accept 8–128 untrimmed characters and reject a small common-password denylist. The API stores an asynchronous, versioned scrypt envelope with a random salt and can upgrade it after a successful login when policy changes.
- Access tokens are HS256 JWTs valid for 15 minutes. They contain bounded `sub`, `sid`, issuer, audience, issued-at, and expiry claims. The web client holds them only in React runtime memory.
- Refresh tokens are 32 random bytes, stored only as domain-separated SHA-256 digests. The browser receives `sc_refresh` as HttpOnly, SameSite=Lax, auth-path-only, 30-day cookie; `Secure` is mandatory in production.
- Every refresh rotates to one successor transactionally. At most one concurrent request wins. A second request within five seconds fails without clearing the winner's shared cookie; later reuse revokes the entire token family.
- Logout is idempotent. Password reset revokes every refresh session and all other reset tokens for that user.
- Reset tokens are random, stored only as digests, valid for 30 minutes, and single-use. Reset pages set a no-referrer policy and remove the token from the URL after success.

Neither application writes access tokens, refresh tokens, passwords, or reset tokens to local storage, session storage, logs, analytics, or browser-readable cookies.

## Recovery delivery

Development defaults to the gitignored `.runtime/mail-outbox` directory. Each JSON file contains a usable local reset link, so treat the directory as a secret and delete old messages when finished:

```powershell
Remove-Item -Recurse -Force .runtime\mail-outbox
```

Only delete that exact runtime directory. Production rejects file/capture delivery and requires an HTTPS webhook plus a separate 32-character-or-longer webhook secret. The isolated E2E runner uses a permission-restricted capture file in the operating-system temporary directory and removes it in `finally`.

## Configuration

| Variable | Local meaning |
| --- | --- |
| `AUTH_ACCESS_TOKEN_SECRET` | JWT signing secret; use at least 32 random bytes outside local development |
| `AUTH_LIMITER_SECRET` | Separate HMAC key for privacy-preserving limiter identifiers |
| `AUTH_ALLOWED_ORIGINS` | Exact comma-separated browser origins; wildcard is rejected |
| `AUTH_WEB_BASE_URL` | Trusted origin used to construct reset links |
| `AUTH_COOKIE_SECURE` | `false` for local HTTP, required `true` in production |
| `AUTH_RECOVERY_MODE` | `file` locally, `capture` in tests, `webhook` in production |
| `AUTH_RECOVERY_OUTBOX_DIR` | Gitignored local outbox directory |
| `NEXT_PUBLIC_API_BASE_URL` | Browser-visible API origin compiled into the Next.js application |

Advanced lifetime, scrypt, proxy trust, issuer/audience, webhook, and test-capture settings are validated by `apps/api/src/auth/auth.config.ts`. Do not copy local placeholder secrets to shared environments. Do not paste `.env`, database URLs, cookies, tokens, or outbox contents into issues or logs.

The limiter is deliberately in-process for the current single API instance. Counts reset on process restart and are not shared across replicas. A distributed limiter is required before horizontally scaling the API. Opportunistic cleanup removes at most 100 expired or old-revoked session/reset rows per authentication operation; production should add a scheduled retention job before high volume.

## Verification

Fast browser checks use already-running services and never create accounts:

```bash
pnpm test:e2e:auth:quick
```

The security gate owns a unique Compose project, database, capture file, production builds, and three browser viewports, then cleans exact resources:

```bash
pnpm test:e2e:auth
```

For safe troubleshooting, verify `pnpm infra:status`, `pnpm db:migrate:deploy`, the two application health URLs, and exact `AUTH_ALLOWED_ORIGINS`/`NEXT_PUBLIC_API_BASE_URL` values. A 403 on browser mutations usually means the Origin is not allowlisted; a 401 on refresh means the cookie is absent, expired, revoked, or reused. Error responses intentionally omit internal causes.
