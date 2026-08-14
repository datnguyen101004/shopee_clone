## Why

T17 can now calculate authoritative merchandise and shipping totals, but buyers cannot apply Shopee-style promotions and future checkout has no safe way to validate or consume limited vouchers. T18 adds a server-owned voucher boundary before T19 so previewed discounts, rejection reasons, stacking, and eventual checkout consumption all use the same deterministic rules.

## What Changes

- Persist platform, shop, and free-shipping vouchers with fixed or percentage benefits, minimum spend, maximum discount, UTC activity windows, global and per-buyer limits, and optional shop/product scope.
- Add deterministic server-side eligibility and stacking that accepts voucher codes but never browser-supplied discount amounts.
- Extend the authenticated cart quote so a buyer can preview selected vouchers, see accepted benefits and stable rejection reasons, and receive exactly reconciled merchandise, shipping, discount, and payable totals.
- **BREAKING API CONTRACT:** Bump the strict quote response from `pricing-v1` to `pricing-v2` and add `voucher-v1` fields; the monorepo API and web consumer deploy together while the endpoint path remains unchanged.
- Add a transaction-ready voucher consumption service that future T19 checkout must call inside the same order-creation transaction; quote preview never reserves or consumes usage.
- Add a responsive cart voucher experience for entering/removing codes and reviewing applied or rejected promotions without calculating money in the browser.
- Seed deterministic vouchers for local verification and add eligibility-matrix, ordering, boundary-time, usage-limit, concurrency, contract, PostgreSQL API, component, and focused browser tests.
- Document the voucher calculation order, transaction boundary, endpoints, local fixtures, and T18 flow.

## Capabilities

### New Capabilities

- `marketplace-vouchers`: Defines voucher persistence, code normalization, scopes, activity and usage limits, eligibility reasons, preview-versus-consumption semantics, and concurrency-safe transaction consumption.
- `voucher-pricing`: Defines deterministic voucher stacking and calculation order within the authoritative cart quote, exact VND reconciliation, buyer-facing preview controls, and future checkout reuse.

### Modified Capabilities

None. There is no synchronized main OpenSpec capability for vouchers or promotion-aware pricing yet, so T18 introduces both behaviors as new delta specs while extending the existing T17 implementation contract.

## Impact

- **Persistence and seed data:** Prisma gains voucher definitions, product scopes, per-buyer/global usage counters, and redemption records with database constraints and indexes.
- **Backend:** A NestJS voucher module owns lookup, eligibility, calculation, and atomic consumption; the pricing module reloads current voucher facts in its repeatable-read snapshot.
- **API and contracts:** `POST /api/v1/cart/quote` accepts optional normalized voucher codes and returns applied/rejected voucher details plus reconciled discount totals; shared exact-key parsers and Problem Details conventions are extended.
- **Frontend:** The authenticated cart gains platform/shop/free-shipping voucher controls, pending/stale/error states, and server-confirmed savings only.
- **Future checkout:** T19 receives a transaction-scoped consumption API and must recalculate before consuming; no standalone public consume endpoint is added.
- **Testing and docs:** Unit matrices, PostgreSQL transaction/concurrency coverage, contract/component/quick E2E tests, OpenAPI, commerce docs, and `flow.md` are updated.
