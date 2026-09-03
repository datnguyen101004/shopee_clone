# Implementation notes

## Baseline — 2026-08-28

- Runtime: repository commands require Node 22; the host default Node 24 is incompatible, so verification uses `npx -y node@22 /opt/homebrew/bin/pnpm`.
- API checkout/inventory/voucher/seller unit baseline: 7 suites, 37 tests passed.
- Web checkout/seller baseline: 3 files, 8 tests passed.
- PostgreSQL test database `shopee_clone_test` was created, migrated through all 47 existing migrations, and seeded independently from the development database.
- PostgreSQL inventory/voucher baseline: 2 suites, 8 tests passed.
- PostgreSQL checkout HTTP baseline: 5 tests fail in the pre-existing cleanup helper because `seller_order_fulfillments` is not deleted before its parent `shop_orders`. This fixture defect predates MoMo implementation and must be repaired when the checkout integration test is extended.
- Existing user change `apps/web/next-env.d.ts` is out of scope and will be preserved.
