# Account authentication (T11 and T11.1)

T11 adds email registration, login, session restoration, logout, and password recovery to the storefront. T11.1 adds Google OpenID Connect as an additional sign-in method. Roles, seller authorization, persistent cart, checkout, MFA, account linking, and distributed rate limiting remain out of scope.

## Local use

Copy `.env.example` to the ignored `.env`, start PostgreSQL, apply migrations, seed, and run both applications:

```bash
pnpm infra:up
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Account pages are `/login`, `/login/google/complete`, `/register`, `/forgot-password`, and `/reset-password`. OpenAPI documentation is available at `http://localhost:3001/api/docs`.

The deterministic seed users are locked identities: they have no password and cannot sign in. Create a development account through `/register`. This avoids committing a reusable demo password.

## HTTP endpoints

Versioned auth endpoints are under `/api/v1/auth` and emit `Cache-Control: no-store`. The Google callback is the single deliberate exception because its path must exactly match the URI registered in Google Cloud.

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| `POST` | `/register` | `201` | Create an active email account and first session |
| `POST` | `/login` | `200` | Verify credentials and create a new session family |
| `POST` | `/refresh` | `200` | Rotate the HttpOnly refresh cookie and issue access credentials |
| `POST` | `/logout` | `204` | Revoke the current refresh session and expire its cookie |
| `GET` | `/me` | `200` | Return the safe user projection for a bearer access token |
| `POST` | `/forgot-password` | `202` | Return a generic recovery acknowledgement |
| `POST` | `/reset-password` | `204` | Consume a single-use reset token, change password, revoke sessions |
| `GET` | `/google/start` | `302` | Create a browser-bound one-time transaction and redirect to Google |
| `GET` | `/login/oauth2/code/google` | `302` | Exact unprefixed Google callback; create a local session and return to the web app |

Failures use sanitized `application/problem+json`. Registration conflicts do not identify an existing account beyond the submitted operation failing. Unknown account, wrong password, suspended account, and deleted account share one login failure. Forgot-password returns the same public response for eligible and ineligible addresses.

## Credential lifecycle

- Passwords accept 8–128 untrimmed characters and reject a small common-password denylist. The API stores an asynchronous, versioned scrypt envelope with a random salt and can upgrade it after a successful login when policy changes.
- Access tokens are HS256 JWTs valid for 15 minutes. They contain bounded `sub`, `sid`, issuer, audience, issued-at, and expiry claims. The web client holds them only in React runtime memory.
- Refresh tokens are 32 random bytes, stored only as domain-separated SHA-256 digests. The browser receives `sc_refresh` as HttpOnly, SameSite=Lax, auth-path-only, 30-day cookie; `Secure` is mandatory in production.
- Every refresh rotates to one successor transactionally. At most one concurrent request wins. A second request within five seconds fails without clearing the winner's shared cookie; later reuse revokes the entire token family.
- Logout is idempotent. Password reset revokes every refresh session and all other reset tokens for that user.
- Reset tokens are random, stored only as digests, valid for 30 minutes, and single-use. Reset pages set a no-referrer policy and remove the token from the URL after success.
- Google authorization uses state, nonce, PKCE S256, a ten-minute single-use database transaction, and a callback-only HttpOnly binding cookie. The stable Google `sub` claim identifies the external identity; email is never its identity key.
- A first-time verified Google identity creates a passwordless local user when the normalized email is unused. An existing email account is never silently linked; the user is directed to its original sign-in method.
- Google authorization codes, ID tokens, access tokens, and any provider refresh token exist only transiently during backend verification and are discarded. They are not stored in PostgreSQL, cookies, frontend storage, URLs, logs, or analytics. Successful Google sign-in creates the same local T11 access/refresh session as password login.

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
| `GOOGLE_CLIENT_ID` | Google web OAuth client identifier; runtime only and never printed by project diagnostics |
| `GOOGLE_CLIENT_SECRET` | Google web OAuth client secret; runtime only and never printed or persisted by the application |
| `GOOGLE_CALLBACK_URL` | Exact callback; local default is `http://localhost:3001/login/oauth2/code/google` |
| `NEXT_PUBLIC_API_BASE_URL` | Browser-visible API origin compiled into the Next.js application |

Advanced lifetime, scrypt, proxy trust, issuer/audience, webhook, and test-capture settings are validated by `apps/api/src/auth/auth.config.ts`. Do not copy local placeholder secrets to shared environments. Do not paste `.env`, database URLs, cookies, tokens, or outbox contents into issues or logs.

The limiter is deliberately in-process for the current single API instance. Counts reset on process restart and are not shared across replicas. A distributed limiter is required before horizontally scaling the API. Opportunistic cleanup removes at most 100 expired or old-revoked session/reset rows per authentication operation; production should add a scheduled retention job before high volume.

## Verification

Fast browser checks use already-running services and never create accounts:

```bash
pnpm test:e2e:auth:quick
```

The quick gate checks the Google entry control, sanitized cancellation completion, URL cleanup, responsive behavior, accessibility, and existing email-login behavior. It never sends a real Google credential or performs an external provider login.

The security gate owns a unique Compose project, database, capture file, production builds, and three browser viewports, then cleans exact resources:

```bash
pnpm test:e2e:auth
```

### Safe real-provider smoke check

Google requires exact origins. For the real local journey use only `http://localhost:3000` for the web app and `http://localhost:3001` for the API. Do not mix `localhost` with `127.0.0.1`. In Google Cloud configure:

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3001/login/oauth2/code/google`

If the OAuth consent screen is in testing mode, add the signing-in Google account as a test user. Then:

```bash
pnpm auth:google:preflight
pnpm infra:up
pnpm db:migrate:deploy
pnpm dev
```

The preflight prints only boolean configuration status (`defined`, `nonEmpty`, `notPlaceholder`, `basicFormat`); it never prints either environment value. Open `http://localhost:3000/login`, choose **Tiếp tục với Google**, complete consent with an authorized test user, and confirm the authenticated account label appears. Record only `success` or one sanitized category: `configuration`, `consent`, `callback`, or `claim-validation`. Never paste `.env`, capture OAuth URLs, copy query strings, or take screenshots that may contain provider data.

`basicFormat: true` proves only local structure. Google accepting the authorization/code exchange is the only real credential-pair validation.

For safe troubleshooting, verify `pnpm infra:status`, `pnpm db:migrate:deploy`, the two application health URLs, and exact origins without printing secret values. `redirect_uri_mismatch` means scheme, hostname, port, path, or trailing slash differs from the registered callback. `access_denied` commonly means cancellation or an OAuth testing-mode user restriction. A sanitized callback failure covers state/nonce/PKCE/claim/provider failures by design. A 403 on browser mutations usually means the Origin is not allowlisted; a 401 on refresh means the local cookie is absent, expired, revoked, or reused. Error responses intentionally omit internal causes.
