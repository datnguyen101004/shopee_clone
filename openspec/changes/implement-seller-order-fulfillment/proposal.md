## Why

Buyers can already place and track COD orders, but sellers still cannot see their shop's order queue or move an order through confirmation, packing, pickup readiness, and mock-carrier handoff. T25 closes that operational gap while preserving the lifecycle audit, ownership, idempotency, and inventory guarantees established by T20 and T24.

## What Changes

- Add seller-owned, cursor-paginated order queue and order-detail APIs with status/date filters, immutable checkout snapshots, buyer-safe delivery information, packing totals, fulfillment progress, and server-declared actions.
- Add a seller fulfillment workflow for confirm, start preparing, mark ready for pickup, hand off to mock shipping, and reject with a controlled reason.
- Keep order lifecycle and fulfillment preparation distinct: confirmation advances the order to `AWAITING_PICKUP`, preparation/readiness are audited fulfillment steps, and handoff advances it to `SHIPPING`.
- Require optimistic order/fulfillment versions and idempotency keys for mutations; lock the owned order and reject stale, repeated-with-different-input, foreign-shop, and invalid-transition commands without partial writes.
- On seller rejection, atomically cancel the eligible order, reverse its sold inventory exactly once, and record lifecycle, fulfillment, and inventory audit data without changing historical checkout snapshots; route the existing eligible buyer-cancellation path through the same compensation primitive so cancelled stock also remains coherent.
- Add a mock shipment record and printable packing/shipment summary containing only committed order/address/shop/shipping snapshots; no real carrier booking or label purchase is introduced.
- Add Seller Center `Đơn hàng` list/detail screens with Shopee-like tabs, action dialogs, packing summary, print view, timeline/progress, responsive states, and authoritative refresh after every mutation.
- Add API, contract, database concurrency, component, focused Playwright, documentation, and flow-diagram coverage.

## Capabilities

### New Capabilities

- `seller-order-management`: Seller-owned order listing, filtering, detail projection, packing/shipment summaries, private delivery data, pagination, and Seller Center screens.
- `seller-order-fulfillment`: Deterministic confirmation, preparation, pickup readiness, rejection, mock-shipping handoff, idempotency, audit, concurrency, and inventory-compensation behavior.

### Modified Capabilities

None. The repository has no synchronized main seller-order capability; this change composes the completed order-lifecycle and inventory-reservation delta artifacts without claiming to modify a missing baseline spec.

## Impact

- **Database:** Add seller fulfillment state/version and immutable fulfillment-event storage, mock shipment metadata, constraints, ownership/query indexes, and deterministic backfill for existing orders.
- **Backend:** Add a seller-order module under `/api/v1/seller/orders`, reuse the order lifecycle service, add shared transaction-safe cancellation inventory reversal for seller rejection and existing buyer cancellation, Problem Details mappings, Auth/Origin guards, OpenAPI, and no-store private responses.
- **Contracts:** Add exact seller order queue/detail/action/packing/shipment contracts, filters, reason codes, ETags, idempotency parsers, and state invariants.
- **Frontend:** Add `Đơn hàng` to Seller Center plus queue, detail, action dialogs, packing summary, print view, and accessible responsive states.
- **Quality:** Add unit, PostgreSQL integration/concurrency, component, focused seller-order Playwright, migration, typecheck, lint, and regression coverage.
- **Tracking:** Implements GitHub issue #26 (T25) and is unblocked by completed T20, T22, and T24.
