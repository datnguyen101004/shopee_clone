# T02 Verification

Verified locally on 2026-08-12 with Node.js 22.12.0 and pnpm 10.34.5.

## Repository quality gates

| Check                            | Result                                                      |
| -------------------------------- | ----------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Passed from the repository root                             |
| `pnpm format:check`              | Passed                                                      |
| `pnpm lint`                      | Passed for web, API, and contracts                          |
| `pnpm typecheck`                 | Passed for web, API, and contracts                          |
| `pnpm test`                      | Passed: 2 contract tests, 1 web smoke test, 1 API HTTP test |
| `pnpm build`                     | Passed for Next.js, NestJS, and contracts                   |

## Runtime smoke checks

| Mode              | Endpoint                                  | Result                                                                 |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev:web`    | `GET http://localhost:3000/health`        | HTTP 200 with `Shopee Clone Web` and `Status: ok`                      |
| `pnpm dev:api`    | `GET http://localhost:3001/api/v1/health` | HTTP 200 with the shared health response contract                      |
| `pnpm dev`        | Both endpoints                            | HTTP 200; Turbo logs contained separate web and API workspace prefixes |
| Production builds | Both endpoints                            | HTTP 200 from `next start` and compiled NestJS `dist/main.js`          |

The API production payload was validated as `{ "status": "ok", "service": "api", "timestamp": "<ISO 8601>" }`.

## Pull request

The verification summary is recorded in [pull request #41](https://github.com/datnguyen101004/shopee_clone/pull/41).
