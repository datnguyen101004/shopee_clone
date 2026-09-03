## 1. Shared Contracts and Versioning

- [x] 1.1 Define canonical voucher code, issuer, benefit, slot, selection, rejection-reason, allocation, and result types in the framework-neutral contracts package.
- [x] 1.2 Extend the cart quote request with strict optional platform, per-shop, and free-shipping code selections while rejecting unknown money or eligibility fields.
- [x] 1.3 Replace the strict `pricing-v1` response contract with `pricing-v2` plus `voucher-v1`, evaluation time, applied/rejected selections, allocations, and zero-valued no-voucher fields.
- [x] 1.4 Implement exact-key parsers that normalize codes, reject duplicate codes/shop slots, and recompute every line, shop, voucher, shipping, and quote invariant.
- [x] 1.5 Add contract tests for normalization, malformed structures, wrong versions, rejection evidence, zero vouchers, allocation sums, negative/unsafe values, and tampered totals.

## 2. Voucher Persistence and Migration

- [x] 2.1 Add Prisma enums and relations for voucher definitions, optional product scope, user usage, consumption references, and redemption audit records.
- [x] 2.2 Create the forward SQL migration with issuer/shop, benefit-column, UTC-window, VND, percentage, limit/counter, uniqueness, foreign-key, and index constraints.
- [x] 2.3 Add persistence contract tests that inspect all voucher tables, columns, constraints, indexes, restrictive history relations, and generated Prisma metadata.
- [x] 2.4 Add application validation for product-scope/shop consistency and canonical code writes that cannot be expressed by row-local database checks.

## 3. Deterministic Local Voucher Fixtures

- [x] 3.1 Extend the idempotent seed with documented platform fixed, platform percentage, product-scoped shop percentage, and capped free-shipping vouchers tied to stable dataset records.
- [x] 3.2 Add deterministic expired, not-yet-started, globally exhausted, and buyer-used fixtures suitable for guarded tests without relying on wall-clock races.
- [x] 3.3 Extend database verification to reconcile definitions, product scopes, global/user counters, consumption digests, redemption counts, and repeat-seed stability.
- [x] 3.4 Add or update seed/import tests proving fixture identity and existing canonical catalog data remain deterministic and unchanged.

## 4. Pure Voucher Eligibility and Pricing Engine

- [x] 4.1 Add an injectable UTC clock and canonical code helper so one evaluation uses one controlled instant.
- [x] 4.2 Define immutable evaluator snapshots for requested slots, voucher definitions, product scopes, buyer/global usage, residual pricing lines, and authoritative shipment fees.
- [x] 4.3 Implement the documented eligibility precedence and stable rejection reasons from server-owned facts only.
- [x] 4.4 Implement issuer, shop, product, selected-line, and pre-voucher minimum-spend scope calculations for merchandise and shipping vouchers.
- [x] 4.5 Implement checked fixed-amount, basis-point floor, maximum-discount, residual-value, and free-shipping calculations without floating-point rates.
- [x] 4.6 Implement proportional largest-remainder allocation across canonical line keys and shop fees with exact VND reconciliation.
- [x] 4.7 Implement deterministic stacking: shop vouchers in shop order, then platform merchandise, then free shipping, with one approved slot of each type.
- [x] 4.8 Add table-driven unit tests for time boundaries, eligibility precedence, limits, scope intersections, caps, rounding, overlap, empty selections, and wrong slots.
- [x] 4.9 Add property-style/order-independence tests for allocation remainders, input permutations, safe-integer overflow, non-negative residuals, and exact aggregate equations.

## 5. Authoritative Quote Integration

- [x] 5.1 Add a capability-oriented NestJS voucher module that exports pure evaluation and transaction consumption boundaries without a public consume controller.
- [x] 5.2 Refactor pricing orchestration to expose a transaction-owned calculation path while retaining the existing authenticated read-only quote wrapper.
- [x] 5.3 Load requested definitions, product scopes, global counts, and authenticated buyer counts inside the same repeatable-read snapshot as cart, catalog, address, and shipping facts.
- [x] 5.4 Feed voucher snapshots into the shared calculator and return fully reconciled `pricing-v2` shop, selection, discount, and payable totals.
- [x] 5.5 Update quote DTO validation, OpenAPI request/response schemas, cache headers, errors, and Problem Details handling for structural failures versus normal voucher rejection.
- [x] 5.6 Add service/controller tests for no-code quotes, mixed applied/rejected codes, current-definition reload, clock boundaries, stale ETags, address ownership, and browser money tampering.
- [x] 5.7 Extend guarded PostgreSQL HTTP tests for authentication, Origin precedence, strict request validation, shop/product scope, usage limits, multi-shop stacking, and read-only repeated preview.

## 6. Transactional Consumption Seam for T19

- [x] 6.1 Implement `consumeInTransaction` against the caller-owned Prisma transaction and require a server purchase reference plus the authoritative applied voucher result.
- [x] 6.2 Canonicalize and hash the buyer/voucher set, insert consumption references idempotently, and reject mismatched buyer or set reuse.
- [x] 6.3 Create missing per-buyer usage rows and lock voucher plus usage rows in canonical voucher order before updating counters.
- [x] 6.4 Revalidate current windows, enabled state, scopes, and limits under lock, then write all counters and exact redemption audit rows atomically.
- [x] 6.5 Add PostgreSQL integration tests for successful multi-voucher commit, forced outer rollback, identical retry, mismatched retry, and all-or-nothing failure.
- [x] 6.6 Add a real concurrent final-capacity test proving at most one transaction commits and neither global nor per-buyer counters exceed limits.

## 7. Authenticated Cart Voucher Experience

- [x] 7.1 Read the installed Next.js 16.3 App Router/client-component guidance required by `apps/web/AGENTS.md` before editing web code.
- [x] 7.2 Update the web pricing API and quote hook to send complete voucher selections, validate `pricing-v2`, retain relevant codes, prune removed shop slots, and preserve abort/sequence race protection.
- [x] 7.3 Add explicit platform and free-shipping code controls near the summary plus one shop voucher control in each shop group, with apply and remove actions rather than requests on every keystroke.
- [x] 7.4 Map every stable rejection reason to safe Vietnamese copy and expose accessible pending, applied, rejected, stale, empty, missing-address, conflict, and retry states.
- [x] 7.5 Render only validated server allocations and update the summary to itemize product discount, shop/platform merchandise vouchers, shipping voucher, shipping payable, and final payable.
- [x] 7.6 Add API/hook tests for normalization, apply/remove, retained/pruned selections, cart/address/service changes, out-of-order responses, malformed responses, and recoverable errors.
- [x] 7.7 Add component and stylesheet coverage for multi-shop stacking, rejection messages, keyboard/focus behavior, practical touch targets, and 360/768/1440 layouts without document overflow.

## 8. Focused Browser Coverage and Documentation

- [x] 8.1 Add focused Playwright journeys with contract-valid intercepted `pricing-v2` responses for applying, rejecting, removing, stacking, requoting, and viewing voucher totals at 360/768/1440.
- [x] 8.2 Add `test:e2e:vouchers:quick` to the existing quick runner so routine T18 checks do not rerun unrelated E2E suites or mutate developer data.
- [x] 8.3 Update shopping-cart/API documentation with the request shape, response algebra, rejection reasons, activity boundaries, calculation order, preview semantics, local seed codes, and T19 transaction contract.
- [x] 8.4 Add the T18 preview and future checkout-consumption diagram to `flow.md`, explicitly marking checkout/order creation as a T19 consumer rather than a T18 screen.
- [x] 8.5 Create `verification.md` with commands, fixture assumptions, endpoint/screen checks, and evidence for every T18 acceptance criterion.

## 9. Verification Gates

- [x] 9.1 Run Prisma format/generate, apply the migration to the local database, verify migration status, and run the clean migration/seed smoke path.
- [x] 9.2 Run repository formatting, lint, and type-check gates, documenting only pre-existing warnings.
- [x] 9.3 Run contract, UI, web, API, infrastructure, and build suites with no voucher regressions.
- [x] 9.4 Run the guarded PostgreSQL pricing/voucher suites, including rollback, idempotency, limit, and concurrency cases.
- [x] 9.5 Run only `test:e2e:vouchers:quick` for the final T18 browser gate and record all supported viewport results.
- [x] 9.6 Run strict OpenSpec validation and confirm every tracked task and acceptance criterion has verification evidence.
