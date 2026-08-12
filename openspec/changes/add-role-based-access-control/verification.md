# T12 verification evidence

Issue: GitHub #13 — role-based access control.

## Acceptance summary

- Canonical additive roles are `buyer`, `seller`, `admin`; JWT claims remain identity/session-only and protected requests resolve current assignments from PostgreSQL.
- Guest, buyer, seller, and admin boundaries return sanitized `401`, `403`, or `409` categories. Admin does not implicitly become a seller.
- Seller shop access requires both current seller assignment and persisted ownership. Own/foreign/unknown ownership cases passed focused unit and PostgreSQL tests.
- First-admin bootstrap has no HTTP surface, uses an advisory lock, produced category-only `created` then `already-configured` outcomes, and competing attempts produced exactly one admin.
- Grants/revocations are idempotent and atomic. Duplicate grants, rollback on rejected audit state, concurrent admin revocations, last-admin protection, actor attribution, stable audit pagination, and append-only audit enforcement passed.
- Migration verification backfilled buyer for all eligible seeded users, seller for both shop owners, created no admin, deployed twice, and converged after two seeds.
- `/seller`, `/admin`, header role links, guest guidance, buyer forbidden state, stale-role response, accessibility, storage prohibition, and responsive layouts passed frontend and quick browser checks.

## Final gates

| Gate                                                        | Result                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Frozen pnpm 10.34.5 install                                 | Pass; lockfile unchanged                                                                                       |
| Prisma format/generate/validate                             | Pass                                                                                                           |
| Isolated migrate twice / seed twice / destructive DB verify | Pass                                                                                                           |
| Password + Google PostgreSQL suite                          | 2 passed                                                                                                       |
| Role/ownership/concurrency PostgreSQL suite                 | 6 passed                                                                                                       |
| Repository tests                                            | API 85, web 70, contracts 20, UI 10, infrastructure 6 passed; database suites intentionally focused separately |
| Format / lint / typecheck / build / CI validation           | Pass; lint retains only three pre-existing image optimization warnings                                         |
| `test:e2e:auth:quick`                                       | 6 passed across mobile/tablet/desktop; credential-creating cases skipped by quick mode                         |
| `test:e2e:homepage:quick`                                   | 3 passed across mobile/tablet/desktop                                                                          |
| Strict OpenSpec validation                                  | Pass                                                                                                           |

Tracked-file scans found zero runtime credential assignments, real bootstrap targets, runtime/database artifacts, or generated audit dumps. Automatic GitHub Actions triggers remain disabled (`workflow_dispatch` only). Local `.env` values were never printed or tracked; the real provider flow and unrelated historical full E2E suites were not rerun for T12.
