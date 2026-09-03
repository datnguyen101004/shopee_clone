## Context

See `proposal.md` for motivation and the four delta specs for observable behavior. T17 currently owns the pure `mock-v1` price boundary and quotes by province zone plus weight. T19 persists immutable per-shop shipping snapshots and totals. T20 owns the coarse buyer order lifecycle and immutable order timeline. T25 owns seller preparation, creates one `MOCK` shipment atomically at handoff, and stops tracking at `HANDED_OFF`.

T33 must demonstrate a real carrier integration shape without contacting a real carrier or map service. It crosses pricing, checkout, seller handoff, a separately running local carrier, asynchronous dispatch, signed callbacks, order lifecycle reconciliation, buyer/seller projections, a dedicated shared-auth carrier portal, two PostgreSQL ownership boundaries, and responsive web UI. Existing `mock-v1` order snapshots and legacy shipments must remain readable and financially immutable.

## Goals / Non-Goals

**Goals:**

- Establish a provider-neutral quote/register/track adapter boundary exercised over HTTP by one local Demo Carrier.
- Make distance pricing deterministic, server authoritative, explainable, and independent of public geocoding.
- Decouple seller handoff from carrier availability with durable, idempotent dispatch.
- Reconcile signed external events exactly once into one shipment state and the existing order lifecycle.
- Provide a safe local demonstration console without giving normal marketplace actors carrier authority.
- Preserve all committed historical totals and snapshots while introducing versioned new behavior.

**Non-Goals:**

- Real courier booking, labels, driver assignment, GPS, route optimization, pickup scheduling, carrier billing, or recipient contact.
- Production enablement of the simulated `/carrier` operations portal.
- Multiple parcels per shop order, split fulfillment, partial delivery, cross-docking, or delivery rescheduling dates.
- Automatic inventory restock after an undelivered parcel returns to the shop.
- Replacing the T29 buyer-return shipment flow or using outbound carrier return states for post-delivery returns.
- Guaranteeing that synthetic demo distance equals a real road route or a carrier's commercial tariff.

## Decisions

### 1. Run Demo Carrier as an isolated local workspace service

Add `apps/demo-carrier`, a small NestJS service with its own Prisma schema and PostgreSQL database (`shopee_clone_demo_carrier`) in Docker Compose. It owns the external-looking quote, shipment, operation-command, event, and command-idempotency records. The marketplace owns only normalized shipment projections, dispatch state, callback receipts, and order effects.

The marketplace communicates through a versioned transport contract in `packages/contracts`; no marketplace service imports Demo Carrier persistence or domain services. Demo Carrier requires no public network and is not started or routed as a production dependency. Its operations UI remains in the existing Next.js app under a dedicated `/carrier` route group and reaches the carrier only through `CARRIER_OPERATOR`-protected marketplace proxy endpoints.

The local service contract uses `POST /internal/v1/quotes`, `POST /internal/v1/shipments`, `GET /internal/v1/shipments`, `GET /internal/v1/shipments/:shipmentReference`, and `POST /internal/v1/shipments/:shipmentReference/actions`. Every route is service-authenticated and is never called directly by browser code.

Putting carrier tables in the marketplace database was rejected because transaction sharing would hide the failure, retry, signature, and reconciliation behavior T33 is intended to exercise. An in-memory carrier was rejected because restart tests could not prove idempotency or recovery.

### 2. Use a deterministic district-level synthetic location snapshot

Create a versioned, generated, framework-neutral Demo Carrier location resource containing:

- the existing 63 legacy province identities and stable approximate province anchors;
- the existing 696 legacy district identities and aliases;
- one committed synthetic district point deterministically derived inside a bounded radius of its province anchor;
- a snapshot version and digest verified by tests.

The marketplace canonicalizes pickup/delivery province and district text into codes before calling the carrier. The carrier receives only codes, not names, phone numbers, wards, or address lines. Unknown or ambiguous district resolution blocks that shop quote; there is no cheaper “unknown region” fallback. Same-district pairs use the versioned local estimate and the 3 km minimum.

For `demo-distance-v1`, Demo Carrier calculates Haversine distance between the committed points, multiplies by `1.25`, rounds up to an integer kilometer, enforces a 3 km minimum, and rejects results beyond 2,000 km. Floating point is allowed only for geographical estimation; all monetary calculations use checked integers.

Runtime Nominatim/Google Maps calls were rejected because they add credentials, privacy exposure, rate limits, unstable test results, and network dependency. Province-only centroids were rejected because every trip inside one province would collapse to the same distance.

### 3. Version the exact distance and weight tariff

Demo Carrier owns `demo-distance-v1` with the service and price table declared in `distance-based-demo-shipping/spec.md`. It returns:

- provider and simulation identity;
- calculation and location-snapshot versions;
- canonical pickup/delivery location identities and resolution level;
- straight-line and billable route kilometers;
- service, weight, delivery window;
- base, near-distance, long-distance, weight, and total integer VND components.

Near-distance blocks cover each started 5 km above the included 5 km through 50 km. Long-distance blocks cover each started 100 km above 50 km. Extra-weight blocks cover each started 500 g above 500 g. Shared contract guards assert the exact equations rather than accepting a carrier total blindly.

The existing `PricingQuoteService` still loads a repeatable authoritative commerce snapshot and groups one shipment per shop, but delegates the shipping portion through `CarrierQuotePort`. Cart quote, checkout preview, and checkout confirmation use the same port; confirmation recalculates and persists the accepted response in `ShopOrder.shippingSnapshot`. The browser never calculates distance or money.

Editing `mock-v1` in place was rejected because historical contract guards, tests, and order snapshots must remain interpretable. Persisting ephemeral cart quotes was rejected because checkout already has a fingerprint/recalculation boundary and Demo Carrier rates are deterministic.

### 4. Extend strict shared contracts without breaking historical snapshots

Use a discriminated shipping union keyed by `provider` and `version`:

- legacy `{ provider: "MOCK", version: "mock-v1", ... }` remains readable;
- new `{ provider: "DEMO_CARRIER", version: "demo-distance-v1", ... }` carries distance components.

Checkout and pricing responses move to a new outer version while historical order projectors continue accepting both snapshot variants. New seller/buyer shipment projections similarly accept historical `MOCK/HANDED_OFF` shipments read-only and new `DEMO_CARRIER` tracking shipments.

A loose object with optional distance fields was rejected because it could combine legacy and new formulas or silently omit an invariant. Rewriting legacy JSON snapshots was rejected because it would change committed evidence.

### 5. Make seller handoff a local transaction plus durable outbox

Keep the current seller action endpoint and ETag/idempotency semantics. The `HAND_OFF` transaction still locks the owned `ShopOrder` and fulfillment, then atomically:

1. moves fulfillment to `HANDED_OFF` and order to `SHIPPING`;
2. creates one `DEMO_CARRIER` shipment in `REGISTRATION_PENDING` with a deterministic public `DEMO-...` tracking code and version 0;
3. appends the initial shipment, fulfillment, and order events;
4. creates one `CarrierDispatchOutbox` row containing only immutable bounded shipment facts.

The tracking code is generated from the order reference and seller handoff idempotency identity, so it is visible immediately and stable across replay. The outbox dispatcher claims due rows in small batches with PostgreSQL `FOR UPDATE SKIP LOCKED`, records a lease/attempt, commits the claim, calls Demo Carrier outside the transaction, then applies the strict response in a short second transaction. It uses the shipment reference as carrier idempotency identity.

Calling Demo Carrier inside the seller transaction was rejected because a slow or lost HTTP response would hold locks and leave an unknowable external side effect. Moving the order to `SHIPPING` only after remote acceptance was rejected because the seller has already completed the local handoff and an outage should be visible as registration pending, not undo the business action.

### 6. Bound retry, failure, and manual recovery

Dispatch uses exponential backoff with jitter, capped delay, a finite automatic-attempt budget, `nextAttemptAt`, short claim leases, and recovery of abandoned leases. Safe response categories are:

- success or equivalent replay: apply remote identity and `CREATED` exactly once;
- temporary timeout/5xx: schedule another bounded attempt;
- terminal schema/idempotency conflict: mark `REGISTRATION_FAILED` and retain a sanitized operator code;
- exhausted temporary failures: mark `REGISTRATION_FAILED` while retaining the same shipment and outbox history.

A carrier-operator retry action can request another attempt by creating a new dispatch cycle for the same shipment identity; it cannot create a new shipment. Metrics expose queue depth, oldest due age, attempts, success, temporary failure, conflict, and callback outcomes without shipment/customer labels.

Infinite retry was rejected because poisoned records could churn forever. Reverting seller handoff or manufacturing carrier acceptance after exhaustion was rejected because either behavior lies about committed external state.

### 7. Authenticate service calls and callbacks with timestamped HMAC

Marketplace-to-carrier internal requests use `X-Demo-Carrier-Timestamp`, `X-Demo-Carrier-Key-Id`, and `X-Demo-Carrier-Signature`. Demo Carrier callbacks use the equivalent headers. Signature v1 is HMAC-SHA256 over:

```text
<unix-seconds>.<HTTP-method>.<path>.<raw-body-bytes>
```

Validation uses the exact raw body, constant-time digest comparison, an active key ID, a five-minute clock window, bounded body size, JSON content type, and strict payload contracts. Secrets come from local environment/CI secret injection, never repository files or browser code. A previous key ID can be accepted during local rotation while new emissions use only the active key.

User-session authentication was rejected for service callbacks because no browser user exists. A static bearer token without request signing was rejected because it cannot detect body tampering or bound captured-request replay.

### 8. Separate callback receipts from effective tracking events

Marketplace persistence adds:

- shipment provider, normalized status, version, external ID, registered/delivered/returned/last-update timestamps;
- immutable effective `SellerOrderShipmentEvent` rows with previous/result status, shipment version, external event ID, public reason, carrier occurrence time, and marketplace receipt time;
- `CarrierCallbackReceipt` keyed by `(provider, externalEventId)` with payload digest, bounded outcome (`APPLIED`, `DUPLICATE`, `STALE`, `CONFLICT`, `REJECTED`), and safe linkage;
- `CarrierDispatchOutbox` with attempts, lease, next attempt, result, and safe error code.

An exact duplicate event ID/digest replays the stored acknowledgement. Reusing the event ID with another digest conflicts. A valid but stale transition stores only a receipt outcome, not an effective timeline event. Effective events are ordered by shipment version; the UI displays carrier occurrence time plus receipt time only when delayed context is useful.

Storing every retry as a tracking event was rejected because buyer/seller timelines would duplicate. Dropping stale/conflicting callbacks without a receipt was rejected because operators could not explain reconciliation behavior.

### 9. Reconcile shipment and order states atomically

The normalized Demo Carrier state graph is defined in `external-shipment-tracking/spec.md`. Callback reconciliation opens one transaction, locks the shipment, verifies current version/state, then locks the related order for terminal effects. No post-handoff command may lock the same pair in the reverse order.

Nonterminal carrier states leave `ShopOrder.status = SHIPPING`. `DELIVERED` atomically produces shipment `DELIVERED`, a shipment event, order `DELIVERED`, one incremented order version, and a system order timeline event. Terminal undelivered `RETURNED` atomically produces shipment `RETURNED`, order `CANCELLED`, and reason `CARRIER_RETURNED_UNDELIVERED`.

Carrier return does not restore inventory automatically. The parcel has physically (within the simulation) returned, but its condition has not been assessed; seller inventory adjustment remains explicit and audited. It also does not enter T29's post-delivery return/refund aggregate, which starts only from delivered orders.

Mapping outbound return to the existing order `RETURNED` value was rejected because that value represents a buyer post-delivery return. Leaving a terminal carrier return forever under coarse `SHIPPING` was rejected because list/detail state would never settle. Adding another broad order enum was rejected for this change because `CANCELLED` with a stable reason already communicates the undelivered terminal result.

### 10. Use shared authentication with a dedicated carrier role and route group

Extend the existing RBAC role enum and assignments with `CARRIER_OPERATOR`, seed one deterministic local operator account, and let multi-role users retain all existing roles. Shared login, refresh, logout, session revocation, CSRF/Origin protection, and account status rules remain authoritative. Opening a protected carrier URL while signed out preserves a validated same-origin return target; after login the user returns there only if the role is still present.

Add local/test-only Next.js routes `/carrier`, `/carrier/shipments`, and `/carrier/shipments/[trackingCode]` with a dedicated Carrier Portal layout rather than storefront, Seller Center, or admin chrome. The dashboard and pages call marketplace endpoints:

- `GET /api/v1/carrier/operations/dashboard`
- `GET /api/v1/carrier/operations/shipments`
- `GET /api/v1/carrier/operations/shipments/:trackingCode`
- `POST /api/v1/carrier/operations/shipments/:trackingCode/actions`

Every endpoint requires `CARRIER_OPERATOR`, exact DTOs, private no-store responses, and the non-production execution profile; mutations also require browser Origin protection, ETag, and UUID idempotency keys. The API proxies bounded commands to Demo Carrier with service HMAC, then waits only for the direct callback acknowledgement for a short bounded period; if synchronization is still pending, it returns `202` with a refreshable operation reference rather than false success.

The dashboard counts and attention list are calculated from safe normalized marketplace shipment projections. Search/filter/cursor state stays in the URL so list context survives refresh and detail navigation. List responses omit names, phone numbers, full address lines, payment data, and callback internals; detail adds only shop identity, pickup/delivery area, service, distance, weight, fee, state, and effective events needed for this simulation.

Allowed commands are state-derived: `ADVANCE`, `FAIL_DELIVERY`, `RETRY_DELIVERY`, `START_RETURN`, `ADVANCE_RETURN`, and `RETRY_REGISTRATION`. The service never accepts an arbitrary target state. Delivery failure uses controlled reasons; only a bounded internal note accompanies `OTHER`, and that note never enters buyer/seller projections.

Letting the browser call Demo Carrier directly was rejected because service credentials and carrier authority would be exposed. Reusing `ADMIN` or `SELLER` was rejected because marketplace administration and order ownership are not carrier-operator authority. Creating another website was rejected because the user selected one `/carrier` route group and the shared authentication/session system.

### 11. Implement fast demo mode as a cancellable browser sequence

“Chạy nhanh hành trình thành công” repeatedly invokes the same one-step carrier-operator action with a fresh idempotency key only after the previous authoritative state is observed. An `AbortController`, mounted/visible-page checks, and explicit pause stop future calls. A conflict or error stops the sequence and refreshes detail.

No server `SKIP_TO_DELIVERED` endpoint or durable background automation is added. That keeps every intermediate signed callback and reconciliation path testable, and leaving the page naturally stops the demonstration.

### 12. Extend buyer/seller projections and refresh without a new realtime channel

Extend existing buyer and seller order detail contracts with a discriminated tracking projection. Buyer remains owner scoped; seller remains active-approved-shop owner scoped. Both consume the same normalized event rows but apply role-specific labels. Queue responses include only safe current-state summaries and no recipient contact data.

Visible order detail polls at a conservative interval, refreshes immediately on focus/reconnect, pauses when hidden, aborts superseded requests, and validates the whole response before replacement. The timeline follows the approved UI/UX behavior: auto-reveal near the newest region, otherwise preserve reading position and show “Có cập nhật mới”. This avoids adding WebSocket/SSE infrastructure solely for low-frequency demo tracking.

### 13. Treat contracts, two-database tests, and UI journeys as release gates

Testing is layered:

- pure tables for location normalization, snapshot digest, Haversine/road factor, band boundaries, weight blocks, checked money, and both state machines;
- shared contract tests for exact request/response unions, signatures, ETags, cursors, idempotency, and Problem Details;
- Demo Carrier PostgreSQL tests for quote determinism, command idempotency, state races, event emission, and restart persistence;
- marketplace PostgreSQL tests for migration/backfill, outbox claims/lease recovery, lost responses, callback duplicate/digest conflicts, stale events, terminal races, atomic order reconciliation, and rollback injection;
- adapter contract tests that run the marketplace against the local Demo Carrier over HTTP;
- web component tests for quote invalidation, fee details, tracking refresh/scroll behavior, carrier-role permissions, dedicated layout/dashboard/list/detail, dialogs, fast-mode pause, and responsive/accessibility states;
- `test:e2e:demo-carrier:quick` at 360/768/1440 for checkout quote → COD order → seller handoff → carrier-operator state updates → buyer delivered tracking, plus one failed-delivery/return fixture.

Full focused checkout, seller-order, buyer-order, and homepage regressions remain final gates; tests never contact the public internet.

## Risks / Trade-offs

- **[Synthetic distance may be interpreted as a real route]** → Label every result as approximate and simulated, expose the location/rate version, avoid maps/GPS copy, and never reuse it as a real-carrier promise.
- **[A separate local service and database increase setup cost]** → Add one Docker Compose profile with health checks, deterministic migrations/seeds, documented one-command startup, and focused test orchestration.
- **[Carrier accepts registration while the response is lost]** → Use stable external idempotency, a durable outbox, strict response identity checks, and replay before creating any replacement intent.
- **[Outbox workers can claim the same due row]** → Use short leases plus `FOR UPDATE SKIP LOCKED`, conditional lease completion, bounded batches, and abandoned-lease recovery tests.
- **[Signed callback verification can fail after body parsing or clock drift]** → Capture bounded raw bytes before JSON parsing, compare in constant time, use UTC, accept a five-minute window, and test boundary/skew cases.
- **[Delayed callbacks could move tracking backward]** → Validate against current shipment version/state, store stale receipts separately, and append only effective forward transitions.
- **[Delivered and returned callbacks can race]** → Lock shipment then order consistently and allow only one terminal transition and matching order event to commit.
- **[Carrier return cancels an order without automatic restock]** → Use a specific lifecycle reason, preserve sold inventory until explicit seller inspection/adjustment, and make the limitation visible in seller copy and tests.
- **[New quote fields can break old snapshot readers]** → Use a strict provider/version union, keep legacy projectors and fixtures, and never rewrite committed `mock-v1` JSON or totals.
- **[Carrier portal could expose private data or grant authority through another marketplace role]** → Require distinct `CARRIER_OPERATOR` on every page/API, keep deny-by-default role combinations, proxy through marketplace authorization, omit contact/address/payment details, use no-store, and return unavailable in production.
- **[Polling increases read traffic]** → Poll only visible detail pages at a conservative interval, pause while hidden, refresh on focus/reconnect, and abort superseded reads.

## Migration Plan

1. Add shared transport/snapshot unions and generated demo-location resources with deterministic digest tests while keeping all existing contracts valid.
2. Add the Demo Carrier app, its isolated database migration/seed, internal HMAC middleware, quote/register/read/action endpoints, and local Compose health checks.
3. Apply an additive marketplace migration for new provider/status values, shipment version/external timestamps, effective event fields, callback receipts, dispatch outbox, constraints, and indexes. Preserve `MOCK/HANDED_OFF` rows as historical read-only data; do not rewrite order snapshots or totals.
4. Deploy marketplace carrier contracts, adapter, outbox dispatcher, callback endpoint, and observability. Verify registration replay, lease recovery, signature rejection, stale callbacks, and terminal races before switching pricing.
5. Switch new cart/checkout calculations to `demo-distance-v1`, update immutable order writing/projectors, and retain legacy quote readers.
6. Add the `CARRIER_OPERATOR` role/seed assignment, deploy buyer/seller tracking UI and the local `/carrier` portal, then run contract, migration, two-database integration, responsive component, and focused E2E gates.
7. Rollback disables new quote selection and the `/carrier` portal first, stops new dispatch claims, and leaves additive role, shipment, outbox, receipt, and event data intact. Legacy `mock-v1` quoting can be restored for new previews while already committed `demo-distance-v1` snapshots and terminal tracking history remain readable. Do not delete carrier or marketplace audit rows during ordinary rollback.
