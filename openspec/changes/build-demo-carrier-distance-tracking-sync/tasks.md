## 1. Shared contracts and generated location snapshot

- [x] 1.1 Add provider/version discriminated unions that preserve legacy `MOCK/mock-v1` quote and shipment readers while introducing `DEMO_CARRIER/demo-distance-v1`.
- [ ] 1.2 Define exact framework-neutral Demo Carrier quote, registration, shipment, tracking-event, callback acknowledgement, operations list/detail/action, cursor, ETag, idempotency, and Problem Details contracts.
- [x] 1.3 Add normalized shipment states, transition/action tables, failure reasons, service codes, tariff constants, callback outcomes, and public Vietnamese label mappings.
- [x] 1.4 Generate the versioned 63-province/696-district demo location snapshot with stable aliases, province anchors, synthetic district points, version, and digest.
- [x] 1.5 Add snapshot verification for counts, unique codes/names, coordinate bounds, deterministic generation, aliases, and digest stability.
- [ ] 1.6 Add strict contract tests for exact keys, legacy/new unions, quote equations, timestamps, safe integers, signatures, action bodies, cursors, and malformed private fields.
- [ ] 1.7 Extend shared RBAC contracts with `CARRIER_OPERATOR`, multi-role parsing, route capability checks, and deterministic local seed identities without changing existing buyer/seller/admin semantics.
- [ ] 1.8 Regenerate and verify OpenAPI schemas for every changed and new marketplace boundary.

## 2. Demo Carrier workspace service and local infrastructure

- [ ] 2.1 Scaffold `apps/demo-carrier` as a strict NestJS workspace app with health, structured safe logging, configuration validation, lint, test, build, and start scripts.
- [ ] 2.2 Add an isolated Prisma schema and migrations for carrier shipments, immutable carrier events, command idempotency, quote metadata, and callback-delivery attempts.
- [ ] 2.3 Add deterministic Demo Carrier database seed/reset helpers that contain no real customer data.
- [x] 2.4 Add the `shopee_clone_demo_carrier` PostgreSQL database, service health checks, networking, and local/test secrets to Docker Compose without committing credentials.
- [ ] 2.5 Update workspace/Turborepo dependency graphs and local setup documentation so marketplace and Demo Carrier start and become healthy in dependency order.
- [x] 2.6 Ensure production execution does not route, start, or advertise the Demo Carrier operations service.

## 3. Distance resolver and versioned rating

- [x] 3.1 Implement strict province/district normalization against the generated snapshot and return explicit buyer-address versus shop-pickup blockers for missing or ambiguous input.
- [x] 3.2 Implement deterministic Haversine distance, road factor `1.25`, upward kilometer rounding, 3 km minimum, and 2,000 km rejection.
- [x] 3.3 Implement the `demo-distance-v1` service table and checked base, near-distance, long-distance, weight, ETA, and total calculations.
- [x] 3.4 Implement Demo Carrier internal quote endpoint with service HMAC, exact DTO parsing, bounded request size, safe errors, and no recipient PII.
- [ ] 3.5 Add table-driven tests for same district, cross-district, cross-province, road-factor rounding, every 5/50/100 km boundary, every 500 g boundary, all services, and overflow.
- [x] 3.6 Add deterministic repeated-call and input-order tests proving quotes do not depend on time, randomness, process restart, or internet access.

## 4. Marketplace authoritative pricing and checkout integration

- [ ] 4.1 Introduce the marketplace carrier quote port and strict HTTP Demo Carrier adapter with timeouts, HMAC signing, response identity validation, and sanitized failures.
- [ ] 4.2 Canonicalize the committed shop pickup and buyer delivery province/district before calling the carrier while omitting names, phone numbers, wards, and address lines.
- [x] 4.3 Replace new quote calculation with one `demo-distance-v1` carrier quote per eligible shop while preserving T17 grouping, checked weight, vouchers, and total equations.
- [x] 4.4 Version and update cart quote, checkout preview, checkout fingerprint, confirmation recalculation, purchase projection, and immutable shipping snapshot writing.
- [x] 4.5 Preserve parsing and rendering of historical `mock-v1` orders and assert migrations do not rewrite existing JSON snapshots or monetary totals.
- [ ] 4.6 Map unresolved buyer destinations, incomplete shop pickup addresses, carrier unavailability, malformed carrier responses, and changed checkout facts to stable sanitized blockers/Problem Details.
- [ ] 4.7 Add pricing/checkout integration tests for address ownership, multi-shop quotes, service changes, stale fingerprints, unavailable shops, carrier timeout, strict response rejection, and legacy snapshots.

## 5. Demo Carrier shipment state and commands

- [x] 5.1 Implement the carrier-side shipment state machine for `CREATED`, `ACCEPTED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERY_FAILED`, `RETURN_IN_TRANSIT`, `DELIVERED`, and `RETURNED`.
- [x] 5.2 Implement idempotent shipment registration keyed by marketplace shipment reference with immutable request digest conflict detection.
- [x] 5.3 Implement internal carrier shipment list/detail endpoints with bounded filters, exact reference search, newest-activity cursor pagination, ETags, and PII-safe projections.
- [x] 5.4 Implement carrier operation actions `ADVANCE`, `FAIL_DELIVERY`, `RETRY_DELIVERY`, `START_RETURN`, and `ADVANCE_RETURN` with state-derived availability.
- [x] 5.5 Validate controlled failure reasons and keep `OTHER` notes internal and bounded.
- [ ] 5.6 Persist each accepted carrier command and emitted event atomically with UUID idempotency replay and conflicting-key rejection.
- [ ] 5.7 Emit stable external event IDs and signed callbacks after committed carrier transitions, with bounded retry for callback transport failure.
- [ ] 5.8 Add carrier PostgreSQL tests for registration replay/lost response, command replay, invalid skips/reversals, terminal races, restart persistence, event order, and callback retries.

## 6. Marketplace shipment persistence and migration

- [x] 6.1 Extend marketplace shipment provider/status enums and shipment fields for version, external identity, registration/delivery/return/last-update timestamps while retaining historical `MOCK/HANDED_OFF` values.
- [x] 6.2 Extend effective shipment events with previous/result states, shipment version, external event identity, public reason, carrier occurrence time, and marketplace receipt time.
- [x] 6.3 Add `CarrierDispatchOutbox` with unique shipment intent, canonical payload digest, attempt count, next attempt, short lease, outcome, and sanitized error code.
- [x] 6.4 Add `CarrierCallbackReceipt` with unique provider/event identity, payload digest, bounded reconciliation outcome, safe shipment linkage, and receipt time.
- [x] 6.5 Add database constraints and indexes for shipment/version event uniqueness, external identities, due outbox claims, abandoned leases, callback replay, status queries, and activity ordering.
- [ ] 6.6 Write an additive migration/backfill that preserves all historical shipments/events/snapshots, marks legacy data read-only, and makes no financial or order lifecycle change.
- [ ] 6.7 Add migration verification for row counts, constraint enforcement, legacy compatibility, indexes, and rollback-safe additive behavior on an isolated PostgreSQL database.

## 7. Seller handoff and durable carrier dispatch

- [x] 7.1 Update seller `HAND_OFF` to atomically create the `DEMO_CARRIER/REGISTRATION_PENDING` shipment, deterministic `DEMO-...` tracking code, version-0 event, and one outbox intent with existing order/fulfillment effects.
- [ ] 7.2 Preserve seller ETag/idempotency replay so duplicate clicks and lost responses cannot add shipments, tracking codes, events, outbox rows, or lifecycle increments.
- [x] 7.3 Implement bounded outbox batch claiming with PostgreSQL `FOR UPDATE SKIP LOCKED`, short leases, stable lock ownership, and abandoned-lease recovery.
- [x] 7.4 Implement registration dispatch outside database transactions and short success/failure completion transactions with strict external identity checks.
- [x] 7.5 Implement capped exponential backoff with jitter, temporary/terminal classification, finite automatic attempts, and safe `REGISTRATION_FAILED` projection.
- [x] 7.6 Implement carrier-operator `RETRY_REGISTRATION` as a new dispatch cycle for the same shipment identity rather than a new shipment.
- [ ] 7.7 Add aggregate metrics for queue depth, oldest due age, attempts, outcomes, conflicts, and callback receipts without subject/customer labels.
- [ ] 7.8 Add PostgreSQL tests for atomic handoff rollback, two handoff races, multi-worker claims, lease expiry, response loss, carrier conflict, exhausted retries, and manual recovery.

## 8. Signed callback ingestion and lifecycle reconciliation

- [x] 8.1 Capture bounded callback raw bytes before JSON parsing and implement HMAC-SHA256 signing/verification over timestamp, method, path, and exact body.
- [x] 8.2 Validate key ID, constant-time digest, JSON content type, body limit, five-minute UTC replay window, exact payload, and active/previous local key rotation.
- [x] 8.3 Add `POST /api/v1/carrier/webhooks/demo` with signature-first non-enumerating errors and no user-session dependency.
- [x] 8.4 Implement callback receipt replay: identical event/digest returns the original acknowledgement and reused event ID with a different digest conflicts.
- [x] 8.5 Implement stale/out-of-order reconciliation receipts without appending effective events or moving shipment state backward.
- [x] 8.6 Implement effective reconciliation with shipment-version validation and fixed shipment-then-order lock order.
- [x] 8.7 Atomically map terminal `DELIVERED` to order `DELIVERED` plus one system order event and terminal `RETURNED` to order `CANCELLED/CARRIER_RETURNED_UNDELIVERED` without restocking.
- [x] 8.8 Keep nonterminal carrier states under coarse order `SHIPPING` and keep outbound carrier returns outside the T29 post-delivery return aggregate.
- [ ] 8.9 Add callback tests for signature tampering, clock boundaries, unknown keys, oversize/malformed bodies, duplicate replay, digest conflict, stale events, invalid transitions, terminal races, rollback injection, and immutable order snapshots.

## 9. Buyer and seller tracking APIs

- [ ] 9.1 Extend buyer order list/detail contracts and projectors with safe legacy/new shipment summaries, latest normalized state, simulation marker, tracking code, ETA, activity time, and timeline.
- [ ] 9.2 Extend seller order list/detail/print contracts and projectors with the same authoritative tracking data plus role-appropriate operational context.
- [ ] 9.3 Order effective events by shipment version with deterministic tie-breaking and expose carrier occurrence/receipt timing without duplicating stale callback receipts.
- [ ] 9.4 Preserve buyer ownership and active-approved-shop seller ownership, non-enumerating foreign references, private no-store responses, and list-level PII minimization.
- [ ] 9.5 Update OpenAPI and API tests for pending registration, registration failure, success path, delivery failure/retry, return, delivered, legacy handoff, auth, ownership, and malformed persisted projections.

## 10. Checkout and order tracking UI

- [ ] 10.1 Update checkout shop shipping cards to display Demo Carrier simulation identity, service choices, estimated distance, ETA, fee, and desktop/mobile “Xem cách tính” disclosure.
- [ ] 10.2 Render exact base/distance/weight components and approximate-distance copy without calculating or repairing carrier money in the browser.
- [ ] 10.3 Implement quote invalidation, skeleton, stale-total suppression, per-shop failure/retry, missing buyer address, missing shop pickup, and checkout-submit blocking from the approved UI/UX spec.
- [ ] 10.4 Update checkout success to show the simulation label, initial preparation state, and tracking-code expectation without implying physical booking.
- [ ] 10.5 Build a shared tracking timeline presentation with localized role copy, timestamps, copy-code feedback, simulation badge, pending/failed registration, delivery failure/retry/return, terminal states, loading, empty, disconnect, and retry.
- [ ] 10.6 Integrate the tracking card into buyer and seller order details while keeping mutation controls absent from ordinary buyer/seller pages.
- [ ] 10.7 Add visible-page polling, focus/reconnect refresh, hidden-page pause, abort/sequence guards, near-end auto-reveal, and “Có cập nhật mới” behavior that preserves historical reading position.
- [ ] 10.8 Update seller handoff confirmation and post-handoff card for immediate stable tracking code, pending registration, conflict refresh, and no duplicate-click state.
- [ ] 10.9 Add component tests across 360/768/1440 behavior, keyboard/focus, reduced motion, ARIA announcements, stale quote, scroll preservation, legacy snapshot, and all recoverable states.

## 11. Shared-auth Carrier Portal API and UI

- [ ] 11.1 Add the additive `CARRIER_OPERATOR` role migration, deterministic local operator assignment, role audit compatibility, and shared-login/session authorization tests for single-role and multi-role accounts.
- [ ] 11.2 Add local/test-only `GET /api/v1/carrier/operations/dashboard` and shipment list/detail/action endpoints with `CARRIER_OPERATOR`, production unavailability, Origin protection on mutations, exact DTOs, private no-store, ETag, and UUID idempotency.
- [ ] 11.3 Sign marketplace-to-carrier proxy calls and validate carrier responses without exposing service credentials or direct carrier URLs to the browser.
- [ ] 11.4 Return authoritative synchronized detail after a bounded callback wait or `202` plus refreshable operation reference when synchronization remains pending.
- [ ] 11.5 Build a dedicated `/carrier` layout with simulation banner, `Tổng quan`/`Vận đơn` navigation, account controls, marketplace switch, desktop sidebar, mobile menu, shared-login return target, and access-denied states.
- [ ] 11.6 Build the `/carrier` dashboard with server-authored state counts, clickable URL-bound filters, bounded attention list, loading, no-work, unavailable, and retry states.
- [ ] 11.7 Build `/carrier/shipments` with exact reference search, state/service/date filters, URL-preserved criteria, cursor pagination, responsive table/cards, empty, unavailable, and retry states.
- [ ] 11.8 Build `/carrier/shipments/[trackingCode]` with breadcrumb/list-context return, bounded order/shipment summary, current/next state, chronological timeline, state-derived commands, dialogs, controlled failure reasons, duplicate and conflict feedback.
- [ ] 11.9 Implement client-only fast success mode with sequential ordinary actions, fresh idempotency keys, visible progress, pause, abort on navigation/hidden page, and stop-on-error refresh.
- [ ] 11.10 Ensure buyer/seller/admin accounts without `CARRIER_OPERATOR` cannot see carrier navigation or access operations data even when they own or administer the related order.
- [ ] 11.11 Add Carrier Portal API/component tests for shared-login return, role/profile gates, multi-role navigation, dashboard counts, cursor binding, list-context return, PII omission, action availability, notes privacy, response loss, pending synchronization, fast-mode pause, responsive layout, and keyboard focus.

## 12. End-to-end verification, documentation, and release gates

- [ ] 12.1 Add two-database test orchestration that migrates, seeds, starts, health-checks, and reliably tears down isolated marketplace and Demo Carrier PostgreSQL environments.
- [ ] 12.2 Add adapter contract tests over real local HTTP for quote, register, retrieve, command, signed callback, timeout, replay, malformed response, and service restart.
- [ ] 12.3 Add `test:e2e:demo-carrier:quick` for checkout quote → COD order → seller handoff → shared-login carrier-operator progression in `/carrier` → buyer delivered tracking at 360/768/1440.
- [ ] 12.4 Add a focused failed-delivery → retry and failed-delivery → return fixture while proving returned outbound parcels do not enter T29 or auto-restock.
- [ ] 12.5 Run shared contracts, API unit/integration, Demo Carrier tests/build, marketplace PostgreSQL gates, web unit/component tests, and migration smoke verification.
- [ ] 12.6 Run focused checkout, seller-order, buyer-order, return, homepage, and Demo Carrier E2E regression gates with no public network calls.
- [ ] 12.7 Verify generated OpenAPI, structured log redaction, no committed secrets, dependency audit, typecheck, lint, full builds, and `git diff --check`.
- [x] 12.8 Update local setup and operator documentation for service startup, shared-login carrier account, `/carrier` journey, HMAC key rotation, retry recovery, known simulation limits, and rollback order.
- [x] 12.9 Create `flow.md` in Vietnamese after implementation and verification, describing buyer, seller, carrier operator, success/failure/retry/return behavior and a concrete non-technical example without code or architecture.
- [ ] 12.10 Run `openspec validate build-demo-carrier-distance-tracking-sync --strict` after all implementation evidence and task checkboxes are complete.
