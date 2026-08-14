# T18 Verification — Marketplace vouchers

Verified on 2026-08-14 from `development` with pnpm 10.34.5, Node.js 22, PostgreSQL, NestJS,
Next.js 16.3, and the repository-local OpenSpec change `implement-marketplace-vouchers`.

## Commands and outcomes

| Gate                                                                                                                                                  | Result                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                      | Passed; pinned lockfile unchanged.                                                                                                                                                                                                                          |
| `pnpm db:format`, `pnpm db:generate`                                                                                                                  | Passed; Prisma schema formatted and client generated.                                                                                                                                                                                                       |
| `pnpm db:migrate:deploy` plus Prisma migration status                                                                                                 | Passed; 14 migrations applied and local schema reported up to date.                                                                                                                                                                                         |
| `pnpm db:verify`                                                                                                                                      | Passed from a recreated guarded test schema; all 14 migrations applied from empty, seed ran twice, and voucher definition/scope/usage/consumption/redemption counts reconciled.                                                                             |
| `pnpm format:check`                                                                                                                                   | Passed.                                                                                                                                                                                                                                                     |
| `pnpm lint`                                                                                                                                           | Passed with four pre-existing Next.js `<img>` optimization warnings and no errors.                                                                                                                                                                          |
| `pnpm typecheck`                                                                                                                                      | Passed for contracts, UI, API, and web.                                                                                                                                                                                                                     |
| `pnpm test`                                                                                                                                           | Passed: infrastructure 6, contracts 54, UI 10, web 135, and API 187 non-database tests; guarded suites were intentionally skipped by the default command.                                                                                                   |
| `pnpm build`                                                                                                                                          | Passed for contracts, UI, NestJS API, and Next.js production routes including `/cart`.                                                                                                                                                                      |
| `RUN_CART_DATABASE_TESTS=1 pnpm --filter @shopee-clone/api test -- test/cart-http.postgres.e2e.spec.ts test/voucher-consumption.postgres.e2e.spec.ts` | Passed 13/13: authenticated quote, strict body/Origin/ETag behavior, scopes, stacking, read-only preview, rollback, idempotency, limits, all-or-nothing consumption, and concurrent final capacity. One existing pg v9 deprecation warning was non-failing. |
| `pnpm test:e2e:vouchers:quick`                                                                                                                        | Passed 3/3 at 360×800, 768×1024, and 1440×900 using intercepted contract-valid responses; no developer data mutation.                                                                                                                                       |
| `openspec validate implement-marketplace-vouchers --strict`                                                                                           | Passed.                                                                                                                                                                                                                                                     |

## Acceptance evidence

- Persistence contains constrained platform/shop/free-shipping definitions, product scope, global and
  per-buyer usage, idempotent consumption references, and exact redemption audit rows.
- Seed codes `PLATFORM-50K`, `PLATFORM-10`, `SHOP-15`, `FREESHIP-30K`, `EXPIRED-10K`,
  `FUTURE-10K`, `EXHAUSTED-10K`, and `USED-10K` are deterministic and repeat-seed safe.
- Shared `pricing-v2` and `voucher-v1` parsers normalize codes, reject duplicate slots/codes and
  browser-supplied money, and reconcile line, shop, voucher allocation, shipping, and final totals.
- The pure engine covers half-open UTC windows, stable rejection precedence, scope/minimum spend,
  fixed/percentage/capped benefits, residual stacking, largest-remainder allocation, input-order
  independence, and safe-integer boundaries.
- `POST /api/v1/cart/quote` remains authenticated, Origin-guarded, ETag-bound, repeatable-read, and
  read-only. Repeated preview does not reserve or increment usage.
- `/cart` exposes explicit apply/remove controls for one shop code per selected shop plus platform
  and free-shipping codes; it retains relevant choices across requotes, prunes unselected shops,
  displays every stable rejection reason in Vietnamese, and renders only contract-validated server
  discounts and payable totals.
- Voucher consumption has no controller. T19 must call `calculateInTransaction` and
  `consumeInTransaction` inside its caller-owned order transaction with a server purchase reference;
  successful retries are idempotent and any lost eligibility rolls back all affected writes.
- Focused Playwright covers apply, stack, reject, remove, service-triggered requote, request shape,
  accessible state announcements, axe serious/critical checks, and horizontal overflow at all three
  supported viewports.

## Manual endpoint and screen check

1. Run `pnpm db:migrate:deploy`, `pnpm db:seed`, then `pnpm dev`.
2. Sign in, add/select the seeded scoped product, create or select a shipping address, and open
   `/cart`.
3. Apply `SHOP-15` in its shop card, `PLATFORM-10` under **Mã Shopee**, and `FREESHIP-30K` under
   **Mã miễn phí vận chuyển**. Confirm the server reports applied savings and the summary itemizes
   product, shop, platform, shipping voucher, shipping payable, and final payable amounts.
4. Replace a code with `EXPIRED-10K` and confirm the screen reports that it expired without treating
   the quote as a transport error. Remove a code and change shipping service to confirm the retained
   selections are requoted.
5. Inspect `POST /api/v1/cart/quote`: it must include bearer authentication, trusted `Origin`, the
   current `If-Match: "cart-<version>"`, and only address/services/voucher code selections—never a
   client discount, price, fee, or total.
