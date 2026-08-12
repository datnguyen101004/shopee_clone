# T11 verification evidence

Verified on 2026-08-12 from branch `development`.

## Persistence and configuration

- `pnpm install --frozen-lockfile` through pinned pnpm 10.34.5: passed.
- `pnpm db:format`, `pnpm db:generate`, and `pnpm db:validate`: passed.
- `pnpm db:migrate:deploy`: applied the committed authentication migration to the development database.
- `pnpm db:seed` twice: passed idempotently; deterministic users remain locked with no production-like demo password.
- `pnpm db:verify`: passed from an empty guarded `_test` schema, repeated migration deployment and seed, email/digest/timestamp/foreign-key/cascade constraints.
- `RUN_AUTH_DATABASE_TESTS=1` PostgreSQL suite: passed canonical-email registration race, one-winner refresh race, tolerance and late family reuse, idempotent logout, reset replacement/single use, password update, and session revocation.

## Repository quality

- `pnpm format:check`: passed.
- `pnpm lint`: passed with only three pre-existing T10 `no-img-element` warnings and zero errors.
- `pnpm typecheck`: passed across contracts, UI, API, and web.
- `pnpm test`: passed infrastructure helpers plus 16 contract tests, 10 UI tests, 59 web tests, and 65 active API tests; database suites are intentionally isolated from the ordinary test command.
- `pnpm build`: passed for contracts, UI, NestJS API, and Next.js production routes.
- `pnpm ci:validate`: passed; `.github/workflows/ci.yml` remains manual `workflow_dispatch` only.

## Browser and security gates

- `pnpm test:e2e:auth:quick`: 3 guest/account behavior and accessibility tests passed on mobile, tablet, and desktop; 3 mutation tests skipped by design.
- `pnpm test:e2e:homepage:quick`: 3 passed; mutation cases skipped by design.
- `pnpm test:e2e:catalog:quick`: 9 passed; mutation cases skipped by design.
- `pnpm test:e2e:product:quick`: 9 passed.
- `pnpm test:e2e:auth`: 6 passed against unique Compose/database resources and production builds across mobile, tablet, and desktop. It covered registration, restoration/refresh, invalid credentials, logout, valid and unsafe product return intents, forgot/reset, old-password rejection, and session revocation. Snapshot comparison passed and exact Docker/capture-file cleanup completed.
- Tracked-file review found no runtime outbox, `.env`, local database, raw session/reset credential, or real secret. Matches from the connection-string scan were documented placeholders or redaction fixtures only.

## Outcome

All 63 implementation checklist items and issue #12 acceptance/test requirements are satisfied. T12 roles/authorization, T16 cart persistence, and distributed rate limiting remain explicitly out of scope.
