## Why

The marketplace can price a selected cart but cannot yet turn that quote into a durable purchase. T19 completes the first end-to-end buyer transaction with COD while preserving pricing integrity, voucher limits, and all-or-nothing multi-shop order creation.

## What Changes

- Add an authenticated checkout preview that validates the selected cart lines, buyer-owned delivery address, per-shop shipping choices, voucher codes, and optional shop notes against current server data.
- Add COD confirmation with an explicit idempotency key; repeated submissions return the original purchase instead of creating duplicate orders.
- Persist one purchase group and one child order per participating shop, including immutable product, variant, price, address, shipping, voucher, discount, note, and total snapshots.
- Recalculate all totals inside the checkout transaction, consume approved vouchers atomically, and roll back the entire purchase when any validation or persistence step fails.
- Remove only the purchased cart lines after successful creation and expose an order-confirmation response/page for the resulting purchase reference and shop orders.
- Add database migrations, shared contracts, API/OpenAPI coverage, frontend checkout flow, automated tests, documentation, and an updated activity flow.
- Keep online payment capture, external fulfillment, shipment tracking, and seller order operations out of this change.

## Capabilities

### New Capabilities

- `cod-checkout`: Authenticated checkout preview and COD confirmation, including address/shipping/voucher validation, pricing revalidation, idempotency, and stable API errors.
- `multi-shop-orders`: Transactional purchase-group creation, per-shop order splitting, immutable snapshots, voucher consumption linkage, and post-success cart cleanup.

### Modified Capabilities

None. The repository currently has no synchronized main specs for cart, pricing, vouchers, or orders; this change introduces delta capabilities without claiming a modification to a missing baseline spec.

## Impact

- **Database:** Prisma models and migration for purchase groups, shop orders, order lines, address/shipping/discount snapshots, and idempotency uniqueness; relations to users, shops, vouchers, and cart data.
- **Backend:** New NestJS checkout/orders capability integrated with auth, cart, pricing, account addresses, and voucher consumption under `/api/v1`.
- **Contracts:** Framework-neutral request, response, snapshot, money, error, and order-status contracts in `packages/contracts`.
- **Frontend:** A signed-in checkout screen and purchase confirmation state/page based on server-authoritative totals.
- **Quality and operations:** Unit, PostgreSQL integration/E2E, browser quick-E2E, migration/seed verification, OpenAPI/docs, and `flow.md` updates.
- **Tracking:** Implements GitHub issue #20 (T19).
