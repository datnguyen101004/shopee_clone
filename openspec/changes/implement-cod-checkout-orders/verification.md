# T19 implementation verification

## Implemented scope

- Shared strict `checkout-v1` requests, previews, purchases, Problem Details and ID-only draft contracts.
- Prisma purchase graph with immutable JSON/line/money snapshots, buyer idempotency uniqueness, voucher allocations, direct redemption linkage and restrictive history relations.
- Authenticated preview, atomic COD confirmation and owner-scoped purchase retrieval under `/api/v1/checkout`.
- Serializable multi-shop write, advisory intent lock, bounded `40001` retry, request-digest replay, voucher consumption and selective cart cleanup in one transaction.
- `/cart` handoff, `/checkout`, and `/checkout/success/[purchaseReference]` with server totals, service/address/note controls, retry-safe submission and responsive accessible UI.
- Focused PostgreSQL, unit/component, Playwright, docs and Mermaid flow coverage.

## Endpoint verification

| Endpoint | Evidence |
| --- | --- |
| `POST /api/v1/checkout/preview` | Auth/Origin, ETag, owned/foreign address, unknown money field, ready/blocker and current-data tests pass. |
| `POST /api/v1/checkout/cod` | `201` first commit, `200` replay, request conflict, expiry change, selective/full cleanup, forced rollback and simultaneous replay tests pass. |
| `GET /api/v1/checkout/purchases/:purchaseReference` | Owner result equals committed snapshot; foreign buyer receives identical `404`. |

## Screen verification

| Screen | Verification |
| --- | --- |
| `/cart` | Ready quote creates ID-only draft and navigates to checkout. |
| `/checkout` | Two-shop address/service/note review, server totals, stale/blocker recovery and duplicate-click lock covered by Testing Library and Playwright. |
| `/checkout/success/:purchaseReference` | Displays purchase/child-order snapshots and COD amount; reload performs owner-scoped GET. |

## Executed gates

- Contracts checkout tests: 8 passed; contracts full suite: 62 passed.
- API full unit/default E2E suite: 195 passed, database-gated unrelated suites skipped by default.
- Guarded checkout + voucher + persistence PostgreSQL suites: 14 passed, including direct redemption/allocation linkage, rollback and concurrent replay.
- Public `/api/v1/cart/quote` compatibility regression passes unit, guarded PostgreSQL HTTP, and live-server shared-contract validation while checkout retains the full internal address snapshot.
- Web full suite: 151 passed; focused checkout/cart set: 15 passed.
- Prisma `db:verify`: migrations from empty, idempotent deploy/seed and constraints passed; transactional purchase tables stay empty after seed.
- Workspace typecheck passed; lint passed with six existing/non-blocking Next `<img>` optimization warnings; production build passed and emitted both checkout routes.
- `test:e2e:checkout:quick`: 3/3 passed at 360/768/1440 with accessibility and overflow checks.
- `test:e2e:homepage:quick`: 3 passed, 3 scenario tests intentionally skipped by quick mode.

## Deliberate boundary

Inventory is revalidated at confirmation but is not reserved or decremented in T19. Cross-buyer no-oversell remains assigned to T24. Online payment, carrier fulfillment and general order history are also outside this change.
