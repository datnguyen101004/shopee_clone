# Clickstream API Gateway boundary

This document describes the producer boundary implemented by Shopee Clone. The application ends at a successful, durable acceptance acknowledgement from the HTTPS API Gateway integration. Glue, S3, Athena, QuickSight, and model training are downstream ownership boundaries and are not provisioned by this repository.

## Request

The API worker sends `POST` to `CLICKSTREAM_API_GATEWAY_URL` with a bounded JSON batch:

```json
{
  "contractVersion": "1",
  "batchId": "55555555-5555-4555-8555-555555555555",
  "producer": "shopee-clone-api",
  "sentAt": "2026-09-10T00:00:00.000Z",
  "events": []
}
```

Each `events[]` item is the shared `ClickstreamExportEvent` contract: it contains
`sessionPseudonym`, nullable `buyerPseudonym`, and `pseudonymKeyId` alongside the
event context. Raw `sessionId`, `buyerId`, and other direct identity fields are
not present in the durable payload or the external batch.

The exact UTF-8 body is hashed with SHA-256. The worker signs `timestamp + "." + bodySha256` with HMAC-SHA256 and sends `X-Clickstream-Key-Id`, `X-Clickstream-Timestamp`, and `X-Clickstream-Signature`. TLS is mandatory and redirects are refused. AWS credentials and these secrets never reach the browser.

## Acknowledgement

The durable API Gateway integration may return HTTP 200 or 202 only after its own durable buffer accepts the batch:

```json
{
  "batchId": "55555555-5555-4555-8555-555555555555",
  "acceptedEventIds": ["11111111-1111-4111-8111-111111111111"],
  "rejectedEvents": [
    { "eventId": "22222222-2222-4222-8222-222222222222", "code": "BAD_SCHEMA", "retryable": false }
  ]
}
```

`batchId` must match. `acceptedEventIds` and `rejectedEvents` must partition the submitted event IDs with no duplicates or unknown IDs. Any malformed or ambiguous 2xx response is retried. Consumers deduplicate by `eventId` and reject or quarantine unknown `schemaVersion` values instead of interpreting them as an older version.

## Retry and operations

Timeouts, network failures, 408, 429, 5xx, retryable per-event rejections, and ambiguous acknowledgements use capped exponential backoff with jitter. 400/401/403/404/422 and non-retryable rejections become `TERMINAL`; retention or maximum-attempt exhaustion becomes `DROPPED`. Leases use PostgreSQL `FOR UPDATE SKIP LOCKED`, so abandoned leased rows can be reclaimed safely. At-least-once HTTP delivery is intentional; downstream idempotency is required.

Use `pnpm --filter @shopee-clone/api clickstream:dispatch` for one bounded worker pass and `pnpm --filter @shopee-clone/api clickstream:replay -- --status=TERMINAL --age-seconds=86400 --limit=100` for an operator-authorized, bounded replay. `GET /api/v1/health/clickstream-outbox` returns aggregate status/backlog/latency only; it never returns payloads, IDs, URLs, signatures, secrets, raw query text, or raw errors.

## Local failure drill

The mock adapter drill is reproducible with:

```text
pnpm --filter @shopee-clone/api exec jest --runInBand src/clickstream/clickstream.service.spec.ts src/clickstream/clickstream.dispatcher.spec.ts
```

The focused mock drill exercises the clickstream controller/config/service/dispatcher suites plus cart, checkout, engagement, and payment-observation regression suites. It covers durable acceptance, HTTP 202/Problem Details, equivalent retry/idempotency, event-ID conflict, pseudonymization, partial acknowledgement, transient and terminal delivery, malformed acknowledgement retry, lease-owner compare/update, expiry/attempt dropping, bounded replay reset, healthy/stale/unavailable health, and authoritative-capture outage isolation. The worker never waits in the buyer request path; a failed authoritative capture returns `null` and logs only a stable failure code.

The export event in each batch contains only the pseudonymized session/buyer fields (`sessionPseudonym`, nullable `buyerPseudonym`, and `pseudonymKeyId`) plus the event context; raw session and buyer IDs are not part of the durable or external contract. Full web lint remains blocked only by existing `react-hooks/set-state-in-effect` errors in `catalog-filter-panel.tsx`, `catalog-price-input.tsx`, `use-personalized-catalog.ts`, and `seller-notification-center.tsx`; no clickstream instrumentation lint errors remain when those baseline files are excluded.

## Key rotation and ownership

Rotate HMAC and pseudonym secrets deliberately by key ID. New records use the current pseudonym key ID; joins across pseudonym key IDs are not implied. The external analytics owner must provide and contract-test the durable API Gateway integration (for example API Gateway → Lambda → SQS/Kinesis/Firehose), then separately own Glue → S3 → Athena → QuickSight retention, governance, schema evolution, and deduplication.
