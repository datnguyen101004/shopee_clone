## Context

See `proposal.md` for motivation and `specs/clickstream-api-gateway-export/spec.md` for the behavioral contract. The repository is a NestJS/Next.js modular monolith with shared framework-neutral contracts and PostgreSQL/Prisma as the API-owned durable store. Existing notification, carrier, and chat capabilities demonstrate transactional outboxes, `FOR UPDATE SKIP LOCKED` leasing, bounded retries, readiness endpoints, and worker scripts, but none is generic enough to reuse without coupling analytics to an unrelated domain.

Search and recommendation currently calculate request-level ranking context, but there is no durable behavioral feedback stream. Browser interactions are inherently best-effort; favorite, cart, and order outcomes are server-authoritative. The selected external path is API Gateway → Glue → S3 → Athena → QuickSight. API Gateway cannot itself guarantee that Glue has durably retained a request, so the downstream owner must put a durable integration behind the gateway and return success only after that boundary accepts the batch.

## Goals / Non-Goals

**Goals:**

- Add a capability-owned, versioned event contract shared by the browser and API without leaking NestJS or Prisma types.
- Accept browser discovery events through a first-party endpoint and derive identity only from trusted server context.
- Record authoritative commerce outcomes after their domain operation succeeds, without changing that operation's result when analytics is unavailable.
- Persist export-ready, pseudonymized payloads and deliver them to API Gateway using a concurrency-safe outbox worker.
- Make enablement, sampling, delivery, retention, and replay bounded and observable.
- Leave a stable acknowledgement contract for the downstream analytics platform.

**Non-Goals:**

- Provision API Gateway, its authorizer/durable integration, Glue jobs, S3 buckets/layout, Athena objects, or QuickSight assets.
- Feed collected data back into profile building, model training, model activation, or online ranking in this change.
- Guarantee exactly-once HTTP delivery or total event ordering; consumers deduplicate by event ID.
- Build a generic event bus or refactor existing outboxes.
- Export historical behavior created before this feature is enabled.

## Decisions

### 1. Create a dedicated clickstream capability and shared contract

`packages/contracts` will own the public TypeScript contract and parsers for schema version `1`, event types, surfaces, collection requests/responses, batch delivery, acknowledgement, and aggregate health. `apps/api/src/clickstream` will own validation, identity derivation, sampling, persistence, dispatch, and health. `apps/web/lib/clickstream` will own browser session/event creation and non-blocking submission.

The v1 event payload has a common envelope:

- `eventId`, `schemaVersion`, `eventType`, `occurredAt`, `surface`, `sessionId`
- optional `productId`, `placement`, `position`, `query`, `requestId`, `recommendationId`
- optional `projectionVersion`, `profileVersion`, `modelVersion`, `scriptVersion`
- a narrow event-specific `properties` object whose allowed keys are defined by the contract

Unknown keys and server-owned keys are rejected. Search text is normalized and length-bounded; it is analytics content, not identity, and is never written to logs. This explicit union is preferred over an unrestricted property bag because it prevents accidental PII expansion and makes Glue schema evolution deliberate.

Alternative considered: reuse an existing notification/chat outbox. Rejected because their delivery semantics and payload lifecycle are domain-specific and would make analytics retention and replay affect buyer-facing messaging.

### 2. Split browser interactions from authoritative outcomes

The public first-party endpoint is `POST /api/v1/clickstream/events`, guarded by optional authentication. It accepts only browser-owned discovery events: search submissions, product/recommendation impressions, and product/recommendation clicks. The controller obtains authenticated user/session claims from `OptionalAuthGuard`; any identity-shaped input is rejected by the strict contract.

The web client maintains an opaque UUID in `sessionStorage`, creates a UUID event ID before submission, and uses the existing first-party API client with a short timeout and `keepalive` where supported. It never calls API Gateway. Submission errors are swallowed after incrementing a local diagnostic hook so navigation and primary interactions remain unaffected. Impression emission is deduplicated per `{requestId, placement, productId, position}` in the page lifecycle.

`favorite_changed`, `cart_changed`, and `order_completed` are emitted by their API domain services only after a successful state transition. Those services call a non-throwing `captureAuthoritativeOutcome` facade after commit; the facade catches persistence errors and emits only a privacy-safe warning/counter. This provides server-authoritative content while intentionally accepting possible analytics loss rather than rolling back commerce state.

Alternative considered: accept commerce outcomes from the browser and verify them with extra reads. Rejected because it is race-prone, adds database load, and still cannot prove which transition generated the event.

### 3. Pseudonymize before outbox persistence

The API converts trusted identities before writing the export record:

- authenticated buyer: `HMAC-SHA256(key, "buyer:" + userId)`
- first-party session: `HMAC-SHA256(key, "session:" + sessionId)`

The exported fields are named `buyerPseudonym` and `sessionPseudonym`; raw user IDs, auth session IDs, and browser session IDs are not placed in the JSON payload. `CLICKSTREAM_PSEUDONYM_KEY_ID` accompanies the pseudonyms to support controlled key rotation, and `CLICKSTREAM_PSEUDONYM_SECRET` is required whenever capture is enabled. Rotation changes future pseudonyms; historical joins across key IDs are deliberately unsupported unless the platform retains the old key under its own controlled policy.

Alternative considered: hash without a key. Rejected because low-entropy identifiers could be enumerated and the resulting identity would not be meaningfully pseudonymous.

### 4. Use a dedicated PostgreSQL outbox with content conflict detection

Prisma will add `ClickstreamOutboxStatus` (`PENDING`, `LEASED`, `DELIVERED`, `TERMINAL`, `DROPPED`) and `ClickstreamOutbox` with:

- unique `eventId`, `schemaVersion`, `eventType`, `surface`
- export-ready `payload` JSON and a deterministic SHA-256 `payloadHash`
- `status`, `attemptCount`, `nextAttemptAt`, `leaseOwner`, `leaseUntil`
- `acceptedAt`, `deliveredAt`, `terminalAt`, `expiresAt`, `updatedAt`
- privacy-safe `lastErrorCode` and `lastHttpStatus`

Indexes cover `(status, nextAttemptAt, acceptedAt)`, `(status, leaseUntil)`, and `expiresAt`. A new event is inserted before HTTP 202. A uniqueness collision with the same payload hash is an idempotent 202; a different hash is HTTP 409. Sampled-out or disabled events return 202 with `disposition: "sampled_out" | "disabled"` and create no row.

This stores the already minimized payload rather than raw request content, reducing breach and logging risk. It does mean pseudonymization/schema bugs cannot be repaired from raw data; contract and privacy tests are therefore release gates.

### 5. Claim bounded batches and use an explicit acknowledgement protocol

`ClickstreamDispatcher` claims eligible rows in one short Prisma transaction using `FOR UPDATE SKIP LOCKED`, assigns a random lease owner and expiry, and increments the attempt count. Network I/O happens after the claim transaction. The batch request is:

```json
{
  "contractVersion": "1",
  "batchId": "uuid",
  "producer": "shopee-clone-api",
  "sentAt": "UTC timestamp",
  "events": []
}
```

API Gateway must answer HTTP 200 or 202 with matching `batchId`, `acceptedEventIds`, and `rejectedEvents` containing `eventId`, stable `code`, and `retryable`. Missing IDs, duplicate IDs, a mismatched batch ID, invalid JSON, or an otherwise malformed success body is ambiguous and leaves all affected rows retryable.

The API signs the exact UTF-8 body using `HMAC-SHA256(secret, timestamp + "." + SHA256(body))` and sends `X-Clickstream-Key-Id`, `X-Clickstream-Timestamp`, and `X-Clickstream-Signature`. The production API Gateway contract therefore requires a matching authorizer/integration. This avoids browser AWS credentials and new AWS SDK signing dependencies while allowing key rotation. TLS is mandatory and redirects are not followed.

Alternative considered: API Gateway API keys alone. Rejected because usage-plan keys are not sufficient authentication. IAM SigV4 remains a future option if the deployment standardizes workload roles and the needed signing dependencies.

### 6. Retry by transport semantics, then expire deterministically

Network errors, timeouts, HTTP 408/429/5xx, retryable per-event rejections, and ambiguous acknowledgements return rows to `PENDING` with capped exponential backoff and full jitter. HTTP 400/401/403/404/422 and non-retryable per-event rejections become `TERMINAL`. Rows reaching the configured maximum attempts or retention deadline become `DROPPED`. Lease expiry makes abandoned `LEASED` rows reclaimable.

The dispatcher is enabled independently from capture and runs from a small unref'd polling loop in the API process. A `clickstream:dispatch` script provides a one-shot operational path using the same service. Batch size, timeout, poll interval, lease duration, retry base/cap, maximum attempts, and retention are validated from environment variables with conservative bounds.

At-least-once delivery is intentional. A timeout may occur after downstream acceptance, so API Gateway and later storage must deduplicate using `eventId`.

### 7. Make sampling deterministic and configuration fail safe

`CLICKSTREAM_CAPTURE_ENABLED` and `CLICKSTREAM_DISPATCH_ENABLED` default to `false`. Sampling configuration is a JSON map keyed by event type and optionally `surface:eventType`, with values from 0 to 1. A decision hashes `{eventId, effectivePolicyKey}` into a stable bucket. Authoritative outcome events default to 1 when capture is enabled; high-volume events use the configured default.

If capture is enabled but pseudonym or delivery configuration is invalid, application startup fails with a non-secret configuration error. If capture is disabled, absent AWS configuration is valid for local development and tests.

Alternative considered: random sampling on every attempt. Rejected because retries could change inclusion and make observed counts inconsistent.

### 8. Expose aggregate health and bounded CLI replay

`GET /api/v1/health/clickstream-outbox` returns aggregate counts by status, oldest eligible backlog age, dispatcher configuration/readiness, and delivery-latency summary. It returns no payloads, identifiers, URLs, signatures, or error text. Structured log entries may contain batch ID, event ID, stable error code, status, attempt, and duration only.

`clickstream:replay` is an operator-only CLI command rather than a public admin endpoint. It requires status, age window, and limit; rejects values beyond configured limits; and moves eligible `TERMINAL`/`DROPPED` rows to `PENDING` while preserving event IDs and recording a privacy-safe replay log. Database access and deployment authorization provide the operator boundary.

Alternative considered: a public replay REST endpoint. Rejected for this change because it creates a new authorization and audit surface unrelated to buyer collection.

### 9. Keep downstream infrastructure contract-only

The repository will include a versioned JSON example/schema and an operations document describing headers, acknowledgement semantics, retry classification, idempotency, and the requirement that a 2xx response means durable acceptance behind API Gateway. No AWS resource is provisioned. The chosen Glue → S3 → Athena → QuickSight stages remain valid only after the infrastructure owner supplies the missing durable API Gateway integration (for example Lambda plus SQS/Kinesis/Firehose or another acknowledged buffer).

## Risks / Trade-offs

- **[API Gateway returns success before durable buffering]** → Document 2xx as a durable-acceptance guarantee, treat malformed acknowledgements as retryable, and verify the deployed integration with a contract test before enabling dispatch.
- **[At-least-once delivery produces duplicates]** → Preserve event IDs end to end and require downstream deduplication.
- **[High-volume impressions grow PostgreSQL rapidly]** → Default capture off, deterministic sampling, bounded batch/retention settings, indexed cleanup, and backlog alerts.
- **[Post-commit authoritative capture can lose an event]** → Emit a failure counter/log and favor commerce availability; reconcile only if later business value justifies a domain-event outbox.
- **[Pseudonym key rotation breaks longitudinal joins]** → Export key ID, rotate deliberately, and document the analytical window affected.
- **[Browser blockers or navigation drop interaction events]** → Use event IDs, `keepalive`, deduplication, and accept that client telemetry is best-effort.
- **[Query text may contain personal data typed by a buyer]** → Normalize, strictly length-bound, never log it, and allow sampling/disablement; downstream governance must classify and expire it.
- **[Polling in every API replica increases contention]** → Use SKIP LOCKED leases, bounded claims, and an independent dispatcher flag so only designated replicas run workers when needed.

## Migration Plan

1. Add contracts, configuration validation, Prisma enum/model, and the additive migration while capture and dispatch remain disabled.
2. Deploy the API and web instrumentation with `CLICKSTREAM_CAPTURE_ENABLED=false` and `CLICKSTREAM_DISPATCH_ENABLED=false`; verify migrations, health, and primary buyer journeys.
3. Deploy and contract-test the API Gateway authorizer plus durable downstream acceptance boundary outside this repository.
4. Configure secrets and endpoint, enable capture at a low deterministic sample while dispatch remains disabled, and inspect outbox volume/privacy.
5. Enable dispatch on one worker replica, verify acknowledgements, retries, backlog age, Glue raw records, and event-ID preservation.
6. Increase sampling gradually and configure operational alerts. Enable authoritative outcome events only after downstream access controls and retention are approved.

Rollback disables capture first and then dispatch. Pending records remain bounded by retention and may be replayed after remediation. The additive database objects stay in place during rollback to avoid destructive schema changes; they can be removed in a separate reviewed migration after the retention window.
