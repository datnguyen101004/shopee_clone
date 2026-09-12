## Context

See `proposal.md` for motivation and the three delta specs for behavioral contracts. The application is a NestJS/Next.js modular monolith, while this change introduces an AWS-managed clickstream path that starts at API Gateway and deliberately does not use EC2 application processes or PostgreSQL as an event buffer.

The selected MVP topology is:

```text
Payload -> API Gateway -> Lambda ingestion -> Kinesis Data Firehose -> S3 Raw
                                                                  |-> Athena -> Seller CTR endpoint
                                                                  `-> Glue ETL at 04:00 Asia/Ho_Chi_Minh
                                                                      -> S3 Processed -> training.csv
                                                                      -> Model Training (external consumer)
```

Expected initial usage is demo-scale with no real production users. Delivery speed, low operational effort, and low idle cost are more important than automated recovery. Happy-path correctness, seller authorization, schema stability, privacy minimization, and least-privilege IAM remain required even though operational failure handling is deferred.

## Goals / Non-Goals

**Goals:**

- Persist versioned clickstream batches in an immutable raw zone without involving the backend database.
- Query seller/product CTR over a bounded time range directly with Athena.
- Build one versioned impression-level personal-ranking dataset every day at 04:00.
- Keep infrastructure ownership, data contracts, IAM boundaries, and handoff to Model Training explicit.
- Keep implementation and tests limited to the MVP happy path.

**Non-Goals:**

- Retry orchestration, DLQ, replay UI, automatic backfill, late-event correction, failure drills, alarms, on-call runbooks, multi-region recovery, or exactly-once guarantees.
- Kafka, Kinesis Data Streams, an analytics database, DynamoDB coordination, or a PostgreSQL clickstream outbox.
- QuickSight dashboard creation or modification.
- Product snapshot, buyer profile snapshot, feature store, model training, evaluation, model registry, activation, or online inference.
- E2E tests and forced-error test cases.

## Decisions

### 1. Use API Gateway, one ingestion Lambda, Firehose, and an immutable S3 Raw zone

**Decision and scope:** A dedicated API Gateway route invokes Lambda synchronously. Lambda validates the batch envelope and calls `PutRecordBatch` on one Firehose delivery stream. Lambda returns a success response after Firehose accepts the records. Firehose buffers newline-delimited JSON, applies gzip compression, and writes to `raw/schema_version=<version>/dt=<UTC-date>/hour=<UTC-hour>/`.

**Why it fits:** Managed services have low idle overhead and require no worker on EC2. Firehose provides batching and S3 delivery without operating a broker. Compressed JSON preserves the original event representation for both current branches.

**Benefits:** The application database does not grow with clicks; S3 becomes the durable source for analytics and training; producer traffic is decoupled from file sizing.

**Trade-offs accepted:** Firehose acknowledgement means the record entered Firehose, not that its final S3 object is already visible. Firehose buffering adds minutes of freshness delay. If Lambda loses its response after Firehose accepted a batch, a producer retry can create duplicates because advanced deduplication is out of scope. JSON costs more to scan in Athena than Parquet.

**Alternatives:** Direct Lambda-to-S3 writes were rejected because they create many small objects and make batching an application concern. Kafka/Kinesis Data Streams were rejected because retention, consumers, checkpoints, and operating cost are unnecessary for the MVP. A PostgreSQL outbox was rejected because the user explicitly accepts happy-path loss/duplication trade-offs and wants no rapidly growing click table.

**Revisit criteria:** Introduce a stream or durable producer outbox when there are multiple independent real-time consumers, sustained ingestion exceeds Firehose limits, required replay exceeds S3 batch processing, or loss/duplicate tolerance becomes unacceptable. Add deduplication when observed duplicate rate affects CTR or label quality.

### 2. Keep the raw event contract narrow and versioned

**Decision and scope:** Schema version `1` stores clickstream fields needed by CTR and training: event identity/type/time, pseudonymous buyer/session, shop/product, surface, placement, position, request/recommendation correlation, and optional projection/profile/model/script versions. The pipeline accepts only the supported schema and stores no direct identity or payment data.

**Why it fits:** Both consumers can evolve from the same raw record without database joins at ingestion time. A version in every event and S3 prefix makes later schema migration explicit.

**Benefits:** Lower privacy exposure, stable Athena/Glue contracts, and deterministic lineage from CSV examples back to raw impressions.

**Trade-offs accepted:** Training features are limited to information present in clickstream. Without product and buyer snapshots, `training.csv` cannot include authoritative catalog attributes or historical buyer aggregates. Pseudonym key changes can break longitudinal joins.

**Alternatives:** Embedding full product/buyer objects was rejected because data becomes stale, duplicated, and more sensitive. Joining snapshot datasets is deferred until feature quality demonstrates a need.

**Revisit criteria:** Add versioned product/profile snapshots when offline evaluation shows raw interaction features are insufficient, feature skew appears, or training requires catalog/buyer attributes not safely carried by events.

### 3. Query S3 Raw directly with Athena for seller CTR

**Decision and scope:** A Glue Catalog external table describes gzipped raw JSON. Partition projection uses `schema_version`, `dt`, and `hour`, so no crawler is required for the analytics path. The NestJS seller endpoint verifies shop/product ownership from server-owned data, then runs a fixed Athena aggregation filtered by partition, `occurredAt`, `shopId`, `productId`, and the two CTR event types. The endpoint polls the query and maps results to time buckets.

Athena query results are written to a dedicated results prefix with a short S3 lifecycle. The endpoint has a dedicated IAM principal limited to starting/getting queries in one workgroup, reading the raw location/catalog required by the query, and using the results prefix.

**Why it fits:** The MVP avoids a separate Lambda ETL and analytics datastore. Queries are infrequent, data volume is small, and Athena charges for scanned data instead of requiring an always-running service.

**Benefits:** Minimal infrastructure, direct access to the durable raw source, and one calculation contract for the seller endpoint.

**Trade-offs accepted:** Each endpoint request waits for Athena and can take seconds. Cost and latency grow with bytes scanned; gzip JSON cannot be column-pruned like Parquet. There is no response cache, pre-aggregation, or availability fallback. Firehose buffering means CTR is near-real-time rather than real-time.

**Alternatives:** Lambda ETL plus an aggregate store was removed at the user's request. DynamoDB/PostgreSQL aggregates would provide faster reads but introduce writes, schema/migration work, and reconciliation. A scheduled Parquet conversion would reduce scan cost but adds another analytics transformation stage.

**Revisit criteria:** Add pre-aggregated Parquet or an online aggregate store if CTR p95 exceeds 3 seconds, a normal request scans more than 1 GB, Athena spend exceeds the agreed monthly budget, concurrent queries are throttled, or the dashboard needs freshness below Firehose buffering latency.

### 4. Run one Glue training job daily at 04:00 in the business time zone

**Decision and scope:** EventBridge Scheduler uses `Asia/Ho_Chi_Minh` and invokes `StartJobRun` at 04:00. The job receives the previous completed local calendar date explicitly, reads overlapping UTC raw partitions, filters by `occurredAt`, and writes a run-date-versioned processed dataset. No Step Functions workflow, crawler, or distributed lock is used.

**Why it fits:** A single scheduled Glue job is sufficient for one daily consumer, and explicit source/run dates make data lineage understandable. Running at 04:00 allows Firehose-delivered events from the previous day time to arrive before transformation.

**Benefits:** No always-on compute, simple scheduling, and reproducible daily inputs.

**Trade-offs accepted:** Glue has startup time and a minimum billable duration that may dominate tiny demo workloads. Without automated retries or late-event correction, a failed run or delayed raw event requires manual action and can leave that day's dataset incomplete.

**Alternatives:** Lambda was rejected for training because Spark-style joins and dataset growth can exceed Lambda duration/memory. Step Functions were rejected because a one-job happy path does not justify orchestration. A local/EC2 cron was rejected because it couples the data pipeline to application hosts.

**Revisit criteria:** Add orchestration, bookmarks/backfill, data-quality gates, and alerts before real users or when missed daily datasets are no longer acceptable. Replace Glue with a smaller scheduled runtime if measured Glue minimum charges dominate and the daily dataset remains comfortably within that runtime's limits.

### 5. Produce impression-level labels and two processed representations

**Decision and scope:** Glue creates one row per `product_impression`. A subsequent `product_clicked` event is attributed when buyer/session, product, and request or recommendation context match within a configurable default 30-minute window. The normalized result is written as partitioned Parquet under `processed/interactions/source_date=<date>/run_date=<date>/`; the demo export is one UTF-8 file at `exports/training/run_date=<date>/training.csv`.

**Why it fits:** Impression-level binary labels are directly usable for an initial ranking classifier, while Parquet provides a compact canonical processed form. One named CSV simplifies manual demo training and inspection.

**Benefits:** Reproducible label definition, traceability to the impression event, efficient processed storage, and a simple model handoff.

**Trade-offs accepted:** A 30-minute heuristic can misattribute repeated views/clicks. Forcing one CSV file creates a single-output bottleneck and is unsuitable for large datasets. Negative labels created the next morning assume the attribution window has closed.

**Alternatives:** Event-level CSV was rejected because the model-training consumer would have to recreate attribution. Sharded CSV only was rejected because it is inconvenient for the demo; Parquet remains the scalable processed representation.

**Revisit criteria:** Replace the single CSV with a manifest plus shards when it approaches 1 GB, the Glue final coalesce becomes a material part of job time, or training moves to distributed readers. Revisit attribution after offline metrics reveal label noise or surfaces need different windows.

### 6. Separate IAM roles and data locations by responsibility

**Decision and scope:** Lambda ingestion, Firehose, Athena endpoint access, Glue job, and scheduler each use separate roles. Raw and processed data use separate buckets or strictly separated bucket policies; Athena results use a dedicated lifecycle-managed prefix. Secrets are stored outside source control.

**Why it fits:** Least privilege limits the blast radius without adding runtime components.

**Benefits:** Clear ownership, easier audit, and no EC2 permission expansion.

**Trade-offs accepted:** More IAM resources increase IaC verbosity and can slow initial setup. The MVP does not include automated permission-audit tests.

**Alternatives:** One shared pipeline role was rejected because compromise of one stage would grant unnecessary access to every data location and operation.

**Revisit criteria:** Add permission boundaries, automated Access Analyzer checks, and key-rotation runbooks before production or when more environments/teams share the pipeline.

### 7. Treat failure automation as explicit MVP technical debt

**Decision and scope:** Implementation tasks cover successful ingestion, successful Athena queries, successful scheduled Glue processing, and happy-path tests. DLQs, retries beyond AWS-managed defaults, replay/backfill automation, failure alarms, forced-failure tests, and automated rollback are intentionally excluded.

**Why it fits:** There are no real production users and the user prioritizes a demonstrable end-to-end path over operational completeness.

**Benefits:** Smaller scope and faster validation of event schema, CTR usefulness, and training dataset shape.

**Trade-offs accepted:** Failures can be silent, raw batches or daily datasets can be missing, and an operator must inspect AWS and rerun work manually. This design does not claim exactly-once, zero loss, or guaranteed daily completion.

**Alternatives:** A production-ready design with SQS/DLQ, Step Functions retries, quality gates, alarms, and replay tooling is deferred because it materially expands scope before product value is validated.

**Revisit criteria:** These controls become mandatory before onboarding real users, treating the dashboard/model as business-critical, defining a data completeness SLO, or operating without a developer available for manual recovery.

## Risks / Trade-offs

- **[Firehose buffering delays visibility]** → Describe CTR as near-real-time and expose the latest returned bucket timestamp; accept the delay for MVP.
- **[Athena scans compressed JSON on every request]** → Enforce narrow time ranges, partition filters, fixed projections, and workgroup scan limits; introduce Parquet/pre-aggregation at the stated thresholds.
- **[Ambiguous acknowledgement can duplicate events]** → Preserve stable event IDs and quantify duplicates before adding deduplication; duplicate handling is not automated in this MVP.
- **[A failed daily Glue job leaves no dataset]** → Keep outputs run-date-versioned so a developer can rerun the same date manually; automated recovery remains out of scope.
- **[Late clicks can change labels after 04:00]** → Use the 04:00 delay and 30-minute attribution cutoff; do not automatically correct late data in the MVP.
- **[Single `training.csv` does not scale]** → Retain partitioned Parquet as canonical processed output and switch model training to shards/manifests before the 1 GB threshold.
- **[Raw-only training features limit model quality]** → Establish a baseline first, then introduce product/buyer snapshots only when offline evaluation justifies the added joins and governance.
- **[No alerting or failure tests]** → Accept manual inspection during demo use and require operational hardening before real-user deployment.

## Migration Plan

1. Define the raw schema, S3 prefixes, retention/lifecycle, and least-privilege IAM policies in infrastructure code without modifying EC2 or QuickSight.
2. Provision S3 Raw/Processed, Firehose, ingestion Lambda, API Gateway integration, Glue Catalog table, Athena workgroup/results prefix, Glue job, and the 04:00 scheduler in dependency order.
3. Deploy the seller CTR adapter/endpoint with fixed query templates and ownership checks.
4. Send one valid demo batch and verify it appears in the expected S3 Raw partition.
5. Query that product through Athena and the seller endpoint; verify counts and CTR.
6. Run the Glue job once for a selected source date and verify Parquet plus the versioned `training.csv` contract.
7. Enable the daily scheduler after manual happy-path verification.

Rollback for the MVP disables the ingestion route and scheduler first, then removes pipeline-owned compute/query resources. Raw and processed buckets are retained until the user explicitly decides whether their data should be deleted. Existing EC2 and QuickSight resources are not part of this change.
