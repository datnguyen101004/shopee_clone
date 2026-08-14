## Why

T19 can create durable COD purchases, but buyers cannot yet find their past shop orders, understand their current state, inspect a trustworthy history, or cancel an eligible order. T20 adds the post-checkout experience required to turn a successful checkout into a coherent buyer order journey.

## What Changes

- Expand shop-order lifecycle states for pending confirmation, awaiting pickup, shipping, delivered, cancelled, and return/refund representation.
- Add an immutable order timeline that records every transition with its prior/new state, responsible actor, reason, and UTC timestamp.
- Add authenticated, cursor-paginated buyer order-list and owner-scoped order-detail APIs based entirely on committed T19 snapshots.
- Add status filters aligned with Shopee-like buyer tabs: all, pending confirmation, awaiting pickup, shipping, delivered, cancelled, and return/refund.
- Add buyer cancellation with strict reason validation, row locking, optimistic order versioning, an explicit transition matrix, and atomic timeline creation.
- Add `Tài khoản → Đơn mua` list/detail screens with responsive status tabs, totals, immutable product/address/shipping snapshots, timeline, and conditional cancellation controls.
- Backfill one creation timeline event for pre-existing T19 shop orders without changing their snapshots or totals.
- Add contracts, migration verification, state-machine/authorization/concurrency tests, focused browser coverage, endpoint documentation, and order-flow diagrams.
- Keep seller fulfillment actions, carrier synchronization, inventory release, payment refunds, and the operational return/refund workflow out of this change.

## Capabilities

### New Capabilities

- `order-lifecycle`: Valid shop-order state transitions, immutable audit timeline, buyer cancellation rules, actor attribution, and concurrency behavior.
- `buyer-order-history`: Authenticated buyer order listing, status filters, owner-scoped detail retrieval, snapshot presentation, and order-history screens.

### Modified Capabilities

None. The repository has no synchronized main order specs; this change builds on the T19 delta artifacts without claiming a modification to a missing baseline capability.

## Impact

- **Database:** Add lifecycle enum values, an order version, cancellation metadata where needed, and a restrictive `OrderTimelineEvent` relation with a deterministic backfill migration.
- **Backend:** Add an order capability under `/api/v1/account/orders`, an internal transition service/state machine, owner-scoped queries, cancellation transaction handling, OpenAPI, Problem Details, and project-wide Origin/AuthGuard integration.
- **Contracts:** Add framework-neutral list/detail/timeline/cancellation contracts, exact-key guards, cursor/status/reason constants, and safe integer total invariants.
- **Frontend:** Add account navigation for `Đơn mua`, paginated/filterable order list, order detail/timeline, cancellation confirmation UI, and stable loading/empty/error states.
- **Quality:** Add unit, PostgreSQL integration, component, focused Playwright, migration/seed, accessibility, authorization, concurrency, and snapshot-regression coverage.
- **Tracking:** Implements GitHub issue #21 (T20) and is unblocked by completed T19.
