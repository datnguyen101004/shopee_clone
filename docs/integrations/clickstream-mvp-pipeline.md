# Clickstream analytics and training MVP

This document describes the AWS-managed path introduced by
`build-mvp-clickstream-analytics-training-pipeline`:

```text
payload -> API Gateway -> ingestion Lambda -> Kinesis Data Firehose -> S3 Raw
                                                        |-> Athena -> seller analytics overview
                                                        `-> Glue (04:00 Asia/Ho_Chi_Minh)
                                                            -> S3 Processed -> training.csv
```

The path starts at API Gateway. It does not write clickstream events to
PostgreSQL, DynamoDB, EC2, QuickSight, or an analytics outbox.

The ingestion Lambda verifies the existing dispatcher's
`X-Clickstream-Key-Id`, `X-Clickstream-Timestamp`, and
`X-Clickstream-Signature` headers with HMAC-SHA256 over the timestamp and body
hash. Configure the deployment-only HMAC parameters; the shared secret is not
committed to this repository. Requests outside the small timestamp tolerance
are rejected before Firehose.

## Raw event contract (schema version 1)

Every batch has `contractVersion: "1"`, `producer: "shopee-clone-api"`, a UUID
`batchId`, UTC `sentAt`, and 1–500 events. Every event has `eventId`,
`schemaVersion`, `eventType`, `occurredAt` (UTC ISO-8601), `surface`, and at least
one non-null `sessionPseudonym` or `buyerPseudonym`. Product/recommendation
events also carry `shopId` and `productId`; the API derives `shopId` from its
server-owned Product row, never from browser input. Impression/click events preserve
`placement`, zero-based `position`, and `requestId`; recommendation events use
`recommendationId`. Optional ranking fields are `projectionVersion`,
`profileVersion`, `modelVersion`, and `scriptVersion`.

The existing dispatcher v1 fields `pseudonymKeyId`, nullable `buyerPseudonym`,
and validated `properties` remain accepted at this boundary. The additive
`product_viewed` event uses `surface=product_detail`, a product ID, and the same
pseudonymous context; older raw partitions do not need to contain it. Direct identity and
sensitive fields are prohibited: access tokens, credentials, passwords,
e-mail/address data, raw buyer profiles, payment details, and model weights. The
Lambda emits one JSON object per event and adds the UTC `ingestedAt` timestamp.
Firehose appends the single newline delimiter and gzip-delivers records at:

`raw/schema_version=<version>/dt=<UTC-date>/hour=<UTC-hour>/`

The Glue Catalog/Athena table exposes the validated cart properties as a typed
struct, including `properties.action` (and `properties.quantity`/
`properties.selected`), rather than requiring JSON text parsing for the seller
Add to Cart definition. This additive table field does not alter the training
dataset schema or the meaning of existing impression/click labels.

## Seller analytics overview endpoint

`GET /api/v1/seller/analytics/overview`

Query parameters:

- `preset`: `today`, `yesterday`, `last_7_days`, or `last_30_days`; or
- `from` and `to`: inclusive shop-local dates (at most 31 days).
- `page` and `pageSize`: optional numbered product pagination (bounded by the
  shared contract).

The request requires a seller bearer session. The backend resolves the seller's
approved shop before it starts either source query; a client cannot supply a
shop scope. Athena filters the projected `schema_version`, `dt`, and `hour`
partitions, occurrence time, and trusted `shopId` in one current/previous-period
scan. A selected range is at most 31 inclusive shop-local calendar days.
`Today` runs from local midnight to the one server-captured request time and
compares the same elapsed portion of the previous day. `Yesterday` compares two
complete local days. Last 7 days, Last 30 days, and custom ranges use
equal-duration previous windows; a range ending today also ends at the captured
request time.

The overview counts `product_impression`/`recommendation_impression` as
Impressions, `product_clicked`/`recommendation_clicked` as Clicks,
`product_viewed` as Product Views, distinct
`COALESCE(buyerPseudonym, sessionPseudonym)` values on Product Views as Unique
Visitors, and only server-authored `cart_changed` rows whose typed
`properties.action` is `add` as Add to Cart. PostgreSQL supplies distinct
eligible shop orders (`awaiting_pickup`, `shipping`, `delivered`), units, and
payable merchandise revenue. For each metric the response includes current and
previous values and relative change:

`relative change = (current - previous) / previous * 100`

When both values are zero the change is `0`; when the previous value is zero and
the current value is positive the change is `new`. For each bucket:

`CTR = clicks / impressions` and `Conversion Rate = orders / unique visitors`
(each rate is `0` when its denominator is `0`). Revenue is integer VND minor
units in the API contract.

The stack outputs `AthenaQueryRoleArn` but does not attach it to the existing
backend runtime. Configure that runtime with `CLICKSTREAM_ATHENA_ROLE_ARN` and
grant its identity `sts:AssumeRole` on the output role. The adapter assumes the
configured role; when the variable is absent it uses ambient credentials for
local development only.

The response contains the ten summary metrics, current/previous values and
relative changes, a current-period hourly trend for Today/Yesterday, a daily
trend for longer ranges, and number-paginated product rows. `generatedAt` is
the server timestamp used for the response; the dashboard describes the data as
near-real-time because Firehose buffering and Athena visibility are eventual.

## Training dataset

EventBridge Scheduler starts the designated Glue job at 04:00 in
`Asia/Ho_Chi_Minh` and passes `--SOURCE_DATE=previous-local-day` and
`--RUN_DATE=previous-local-day` plus the configured uppercase bucket, window,
and timezone arguments. The Glue entrypoint resolves the source date
to the previous completed local calendar day; an operator can pass an explicit
ISO source date for a manual rerun. It reads all UTC raw `dt/hour` partitions
overlapping the local day through `localDayEnd + attributionWindow`, then
filters by `occurredAt` so ingestion time and business source date cannot
diverge.

The transform emits one row per `product_impression` on the source local day. A
click is attributed when
it is later than (or equal to) the impression, within the configured default
30-minute window, has the same shop/product, shares a session or buyer
pseudonym, and matches the request or recommendation context. The row has
`labelClicked=1`; otherwise it has `0`.

The documented training columns are:

`impressionId, occurredAt, sessionPseudonym, buyerPseudonym, shopId, productId,
surface, placement, position, requestId, recommendationId, projectionVersion,
profileVersion, modelVersion, scriptVersion, labelClicked, sourceDate, runDate`.

Canonical processed Parquet is written under:

`processed/interactions/source_date=<date>/run_date=<date>/`

This preserves a 23:59 local impression whose click arrives at 00:05 on the
next local day while retaining the impression's source date.

The Model Training handoff is one UTF-8, header-bearing file:

`s3://<processed-bucket>/exports/training/run_date=<run-date>/training.csv`

The run date and source date make each export date-versioned and explicitly
selectable. Rerunning the same `run_date` is create-once/idempotent and keeps
the exact first committed bytes. The scheduled Glue job only exports the
dataset; model training remains an explicit command and does not automatically
activate or deploy the candidate.

The optional local training handoff is selected explicitly with the fixed
manifest `RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI`:

```dotenv
RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI=s3://<processed-bucket>/exports/training/latest.json
```

Run `pnpm recommendations:train` after the Glue export is complete. The command
uses the ambient AWS credential chain, reads only exact daily URIs listed in the
manifest, and never lists the bucket. Daily mode reads only the newest
unconsumed URI and warm-starts the latest compatible candidate; `--mode=full`
reads all (at most 30) listed URIs with a fresh initialization. If the variable
is empty, the committed seeded fixture remains the source.
Header-only and one-row exports are rejected because the deterministic trainer
needs at least one example in each partition.

The clickstream export currently contains interaction fields but no compatible
buyer/product serving features. The adapter therefore zero-fills every online
pair feature, learns only an intercept, labels the result
`clickstream-s3-demonstration`, and persists it as a candidate. It is never
automatically activated and must not be treated as personalized production
evidence. Add product and buyer snapshots before expecting ranking changes.

## Snapshot-backed personalized training path

Run the explicit backend exporter with an operator-supplied run id, source date,
and cutoff at or before the beginning of the source-day collection window (for
example, `00:00` local time). It writes privacy-safe, gzip NDJSON product and
buyer-profile parts, then writes each manifest last under `snapshots/` in the
existing `CLICKSTREAM_PROCESSED_BUCKET` using the ambient AWS credential chain:

```bash
pnpm recommendations:snapshots -- --run-id=2026-09-10-0000-vn --source-date=2026-09-10 --since=2026-09-08T17:00:00.000Z --cutoff=2026-09-09T17:00:00.000Z --bootstrap=true
```

The example source date is `2026-09-10`; local midnight is
`2026-09-09T17:00:00Z`. The source date is explicit because it must not be
derived from the UTC date portion of the cutoff.

The next-day Glue run at `04:00` processes that `source_date`. Use
`--bootstrap=true` once to seed all already-materialized profiles; subsequent
runs omit it and export only changed buyers. A snapshot taken after an
impression can never be used for that impression because the point-in-time join
rejects future snapshots. Buyer rows
contain only the HMAC pseudonym and key id. The exporter refreshes only changed
buyers in bounded pages from materialized activity data, then exports the
changed profiles; inactive buyers are carried forward by Glue.

Glue discovers committed manifests, selects the latest compatible snapshot at
or before each impression, drops anonymous/unmatched/key-mismatched rows, and
emits normalized values for all 16 online pair features. `text_relevance` is a
bounded deterministic token-overlap approximation (`offline_lexical_v1`) of the
online lexical signal. The enriched CSV remains an explicit candidate-only
training input; `recommendations:train` never activates it automatically.

The distributed Glue cost is approximately `O(raw(source_day) + product(source_day) + buyer_delta(source_day) + compacted_state(previous_day) + keyed_joins)`, rather
than scanning snapshot history for every impression. Spark performs these reads,
joins, feature expressions, and Parquet writes without collecting the daily
dataset in the driver. The single CSV is only the bounded training adapter
(`coalesce(1)` at the final handoff); use the Parquet output for large-scale
downstream work.

## MVP trade-offs and operator boundary

- Firehose acknowledgement means acceptance by Firehose, not immediate S3
  visibility. Seller analytics is near-real-time and can lag by the buffering
  interval.
- Athena reads compressed raw JSON directly. A single query for current and
  previous periods plus `schema_version/dt/hour` predicates bounds the scan,
  but request latency and scan cost still grow with raw traffic; the workgroup
  has a 1 GiB per-query scan cutoff. This direct-raw MVP accepts slower reads
  and higher per-request scan cost in exchange for no warehouse aggregate table
  or new streaming infrastructure.
- A lost response after Firehose acceptance can produce duplicates, and delayed
  delivery can leave data missing from a 04:00 run. The MVP has no automated
  deduplication, late-event correction, alert, DLQ, replay, backfill, or
  end-to-end retry workflow.
- A failed or incomplete daily run is rerun manually with the same source date.
  Daily training and compacted-state objects are create-once; the fixed
  manifest is capped at the newest 30 exact daily URIs.
- The single CSV is a demo handoff; the partitioned Parquet output remains the
  canonical processed form. Move to a manifest/sharded export before the CSV
  approaches 1 GiB or distributed training is required.
- Each projected raw prefix is read with one `ListObjectsV2` call in the Glue
  MVP. The demo assumes fewer than 1,000 objects per prefix; use pagination or
  a manifest before operating at larger scale.
- Snapshot export is an explicit operator prerequisite before the next-day
  04:00 Glue run; scheduling, retries, and deployment orchestration remain
  outside this MVP.

## Privacy and compatibility limits

Analytics identities are pseudonymous only: `buyerPseudonym` is used when
available and `sessionPseudonym` otherwise. Raw buyer/user IDs, e-mail,
addresses, payment details, and other direct identifiers are prohibited. A
pseudonym key ID scopes joins; rotating the key intentionally prevents joins
across key IDs. Product views have no historical backfill, and at-least-once
delivery can duplicate raw events. Adding `product_viewed` is backward
compatible: older partitions without that event remain valid, and the Glue
training flow still reads only impression/click labels and keeps its 04:00
schedule and training output unchanged.
