## Why

The marketplace currently prices mock shipping only by broad province zones and stops shipment tracking at seller handoff, so a demo cannot show how an external carrier quote, registration, callback, retry, and final delivery update behave. T33 introduces one deterministic local Demo Carrier that exercises the real integration boundary without booking a courier or sending a physical parcel.

## What Changes

- Replace zone-only `mock-v1` shipping quotes with a versioned Demo Carrier quote whose fee is derived from a deterministic estimated route distance, selected service, and shipment weight.
- Resolve existing legacy Vietnamese pickup and delivery addresses into stable demo location identities without calling a public map or geocoding network.
- Introduce a carrier adapter boundary and reliable shipment-registration dispatch so seller handoff does not depend on a synchronous carrier response and equivalent retries cannot create duplicate carrier shipments.
- Expand normalized shipment tracking from the single handoff state into forward delivery, failed-delivery, retry, return, delivered, and returned paths while preserving one authoritative shop-order lifecycle.
- Accept authenticated, signed, replay-safe Demo Carrier callbacks and reconcile duplicate, delayed, or conflicting external events without duplicating marketplace timelines.
- Add buyer and seller shipment tracking projections with the Demo Carrier identity, tracking code, latest state, chronological events, estimated delivery window, and explicit simulation labeling.
- Add a dedicated `/carrier` portal inside the existing website, using the shared login/session system and a distinct `CARRIER_OPERATOR` permission, for dashboarding, finding and filtering all Demo Carrier shipments, advancing one valid state at a time, simulating delivery failure/retry/return, and running a client-controlled fast demonstration sequence.
- Preserve historical `mock-v1` order snapshots and existing monetary totals; only newly calculated checkout previews use the new versioned distance quote.

## Capabilities

### New Capabilities

- `distance-based-demo-shipping`: Deterministic Demo Carrier location resolution, route-distance estimation, service catalog, itemized fees, and authoritative checkout behavior.
- `carrier-shipment-dispatch`: Provider-neutral carrier adapter contracts and idempotent, recoverable shipment registration after seller handoff.
- `external-shipment-tracking`: Signed callback ingestion, normalized shipment state transitions, lifecycle reconciliation, and owner-scoped buyer/seller tracking views.
- `demo-carrier-operations`: Shared-auth `/carrier` portal, carrier-operator authorization, dashboard/list/detail UI, and commands for exercising valid success, failure, redelivery, and return journeys without physical delivery.

### Modified Capabilities

None. The repository's current main spec set does not yet contain the completed T17, T20, or T25 shipping/order capabilities; this change adds explicit T33 capability deltas that integrate with those implemented boundaries without rewriting unrelated main specs.

## Impact

- **Frontend:** checkout shipping cards and fee breakdown, purchase success, buyer order detail, seller order detail, and a dedicated responsive `/carrier` layout with dashboard, shipment list, and shipment detail.
- **Backend:** shared RBAC extension for `CARRIER_OPERATOR`, pricing orchestration, seller handoff, order-history and seller-order projections, carrier adapter/dispatch processing, signed callback ingestion, tracking reconciliation, and private carrier-operations endpoints.
- **Persistence:** additive shipment state/event, carrier identity, external event identity, registration-attempt/outbox, quote snapshot, and query-index changes; existing order financial snapshots remain immutable.
- **Shared contracts:** versioned distance quote, carrier shipment/tracking, callback, operations command, strict response guards, OpenAPI schemas, Problem Details, and ETag/idempotency helpers.
- **Local infrastructure:** one isolated Demo Carrier service in Docker Compose with no real-carrier credentials or production network calls.
- **Testing:** deterministic distance/rate tables, migration and PostgreSQL concurrency/failure tests, adapter contract tests, callback signature/replay/order tests, responsive component coverage, and focused checkout-to-delivery browser journeys.
