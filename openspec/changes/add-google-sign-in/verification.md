# T11.1 Verification Evidence

Date: 2026-08-12

## Automated quality gates

- `npx --yes pnpm@10.34.5 install --frozen-lockfile`: passed with the pinned package manager and unchanged lock resolution.
- Prisma format, generate, validate, migration deploy, repeated seed, and destructive `_test` database verification: passed against local PostgreSQL.
- Repository format check, lint, typecheck, contract/unit/frontend/API tests, PostgreSQL auth tests, and production builds: passed. Lint retained only the three pre-existing T10 `<img>` warnings.
- Focused auth PostgreSQL suite: 2/2 passed, including two concurrent first-time Google callbacks resolving to one local user and one provider identity.
- `test:e2e:auth:quick`: 3/3 responsive guest-flow checks passed; 3 mutating credential flows were intentionally skipped in quick mode.
- `test:e2e:homepage:quick`: 3/3 storefront/header regression checks passed; 3 isolated failure-composition flows were intentionally skipped in quick mode.
- Automatic GitHub Actions triggers remain disabled through the repository validation policy.

## Security evidence

- Automated Google behavior uses an injected fake provider or synthetic test-only configuration; no real Google account is required.
- The database schema and verification prohibit persisted Google access tokens, refresh tokens, ID tokens, authorization codes, nonce values, state values, and raw PKCE material.
- The callback creates the existing local T11 refresh session and discards provider credentials after server-side validation.
- Tracked-source scanning and redaction tests cover Google credentials, provider responses, transient cookies, provider subjects, and email claims.
- No local runtime OAuth dump or database artifact is tracked.

## Real-provider smoke

The safe preflight confirmed that both required Google credential variables pass the `defined`, `nonEmpty`, `notPlaceholder`, and `basicFormat` checks. It emitted only boolean categories; no credential value was read into evidence, printed, copied, or persisted.

The real `localhost` flow was completed with an explicitly authorized Google test user and passed:

1. Google returned to the trusted `localhost` storefront without provider credentials in the visible URL.
2. The application restored the local T11 session, and logout succeeded.
3. A repeated Google sign-in restored the session and returned safely to the storefront.
4. Aggregate database counts remained at 4 users and 1 Google identity before and after the repeated sign-in, proving the returning subject reused the existing local identity instead of creating a duplicate.

Only pass/fail state and aggregate counts were recorded. No consent URL, callback parameter, account identifier, environment value, cookie, credential, provider response, or token was captured.

Do not capture `.env`, Google consent URLs, callback URLs containing parameters, cookies, provider responses, or credential/token values.
