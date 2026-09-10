## 1. Shared clickstream contracts

- [x] 1.1 Add the schema-v1 event union, supported event/surface constants, browser collection request, acceptance response, API Gateway batch/acknowledgement, rejection, and aggregate health types to `packages/contracts`.
- [x] 1.2 Implement strict runtime parsers that reject unknown/server-owned fields, validate UTC timestamps and UUIDs, enforce type-specific context, and normalize/length-bound search query text.
- [x] 1.3 Export the clickstream API from the contracts package and add unit tests for every event type, invalid schema/type/context, prohibited fields, batch acknowledgements, and health responses.

## 2. Persistence and configuration foundation

- [x] 2.1 Add `ClickstreamOutboxStatus` and the indexed `ClickstreamOutbox` model to Prisma with unique event ID, payload hash, export-ready JSON, lease/retry, delivery, terminal, expiry, and privacy-safe error fields.
- [x] 2.2 Create an additive Prisma migration for the clickstream outbox and verify Prisma format, generation, and validation.
- [x] 2.3 Add validated clickstream configuration for capture/dispatch flags, endpoint and HMAC secrets, pseudonym key, sampling, batch/timeout/poll/lease/retry limits, retention, health threshold, and replay bounds; keep disabled defaults safe for local/test environments.
- [x] 2.4 Document all clickstream environment variables with non-secret placeholders in the repository environment example.

## 3. Collection, identity, and sampling

- [x] 3.1 Create the NestJS clickstream module, controller, DTO/error boundary, and `POST /api/v1/clickstream/events` optional-auth route returning the contract acceptance response and Problem Details failures.
- [x] 3.2 Implement keyed buyer/session pseudonymization and canonical export-payload hashing so raw authenticated IDs and raw browser session IDs are never persisted in the payload.
- [x] 3.3 Implement deterministic event/surface sampling and disabled behavior, including stable decisions for duplicate submissions and separate defaults for authoritative outcomes.
- [x] 3.4 Implement durable event acceptance with HTTP 202 dispositions for accepted/idempotent/disabled/sampled-out events and HTTP 409 for event-ID content conflicts.
- [x] 3.5 Add collection tests for optional identity, spoofed/prohibited fields, pseudonymization, strict validation, sampling stability, durable acknowledgement, duplicate idempotency, and conflicts.

## 4. API Gateway delivery worker

- [x] 4.1 Implement concurrency-safe bounded outbox claiming with `FOR UPDATE SKIP LOCKED`, lease ownership/expiry, attempt accounting, and reclaim of abandoned leases.
- [x] 4.2 Implement deterministic batch serialization plus HMAC request signing headers, HTTPS-only endpoint enforcement, redirect refusal, timeout, and a replaceable HTTP adapter for tests.
- [x] 4.3 Parse and validate matching API Gateway acknowledgements, including partial acceptance, explicit retryable/non-retryable rejections, and ambiguous-response handling.
- [x] 4.4 Implement capped exponential retry with jitter, terminal HTTP classification, maximum-attempt/retention dropping, and compare-and-update state transitions scoped to the active lease owner.
- [x] 4.5 Add the independently controlled polling lifecycle and a one-shot `clickstream:dispatch` script that reuse the same dispatcher without preventing clean process shutdown.
- [x] 4.6 Add dispatcher unit/integration tests for concurrent claims, signing, accepted and partial batches, timeouts/network/408/429/5xx retries, terminal 4xx, malformed acknowledgements, lease loss/reclaim, attempt limits, and expiry.

## 5. Authoritative commerce outcomes

- [x] 5.1 Expose a non-throwing `captureAuthoritativeOutcome` facade that persists privacy-safe `favorite_changed`, `cart_changed`, and `order_completed` events after a committed transition and records only stable failure metadata.
- [x] 5.2 Integrate favorite state changes with the facade after success, preserving the existing engagement response and behavior when capture fails.
- [x] 5.3 Integrate cart state changes with the facade after success, using committed product/quantity/action context and preserving cart behavior when capture fails.
- [x] 5.4 Integrate completed checkout/order transitions with the facade after success, emitting no payment data or detailed monetary payload and preserving checkout behavior when capture fails.
- [x] 5.5 Add regression tests proving authoritative events use server context, emit only after success, and never fail favorite, cart, checkout, or order operations.

## 6. Browser instrumentation

- [x] 6.1 Add a browser-only clickstream client that creates a per-tab opaque session UUID, creates event IDs before send, uses the existing first-party API/auth path with a short timeout and `keepalive`, and swallows telemetry failures.
- [x] 6.2 Add page-lifecycle impression deduplication keyed by request, placement, product, and position with unit tests for retries, navigation cleanup, and unavailable storage/network APIs.
- [x] 6.3 Instrument submitted searches and search-result impressions/clicks with available request, product, position, projection, profile, model, and script version context.
- [x] 6.4 Instrument homepage recommendation impressions/clicks and product-detail discovery clicks without altering navigation, rendering, or accessibility behavior.
- [x] 6.5 Add component/client tests proving event shape, impression deduplication, first-party-only delivery, and non-blocking buyer interactions.

## 7. Health, replay, and downstream contract

- [x] 7.1 Add `/api/v1/health/clickstream-outbox` aggregate readiness with status counts, oldest backlog age, dispatcher state, and delivery-latency signals while excluding payloads, identifiers, URLs, secrets, and raw errors.
- [x] 7.2 Add a bounded `clickstream:replay` operator script for eligible terminal/dropped records that preserves event IDs, validates status/age/limit, and records a privacy-safe replay summary.
- [x] 7.3 Add tests for healthy/stale/unavailable aggregate health and accepted/rejected replay bounds and state transitions.
- [x] 7.4 Add versioned API Gateway request/acknowledgement examples and an operations document covering HMAC verification, durable-2xx semantics, event-ID deduplication, retry classification, key rotation, and the explicit Glue/S3/Athena/QuickSight ownership boundary.

## 8. Verification and rollout safety

- [x] 8.1 Run contracts lint/typecheck/tests and API Prisma validation, lint, typecheck, targeted clickstream/domain tests, and production build; resolve all failures introduced by this change.
- [x] 8.2 Run web lint, typecheck, targeted instrumentation/component tests, and production build; resolve all failures introduced by this change.
- [x] 8.3 Perform a local mock API Gateway failure drill demonstrating durable acceptance, idempotent retry, partial acknowledgement, terminal rejection, analytics outage isolation, and recovery/replay, and record the commands/results in the change notes or operations document.
- [x] 8.4 Reconcile implementation against every scenario in the clickstream spec, confirm capture/dispatch remain disabled by default, and mark all completed OpenSpec tasks.
