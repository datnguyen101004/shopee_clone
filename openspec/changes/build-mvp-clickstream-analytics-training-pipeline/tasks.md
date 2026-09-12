## 1. Contracts and infrastructure foundation

- [x] 1.1 Define the versioned raw clickstream batch/event schemas, permitted fields, and representative happy-path fixtures shared by ingestion, Athena, and Glue.
- [x] 1.2 Add validated configuration for AWS region, API Gateway route, Firehose stream, S3 Raw/Processed/results locations, Athena workgroup/catalog, Glue job, attribution window, and schedule time zone without committing secrets.
- [x] 1.3 Define infrastructure-as-code for S3 Raw, S3 Processed, and Athena result locations with the required prefixes, encryption, and lifecycle rules.
- [x] 1.4 Define separate least-privilege IAM roles/policies for ingestion Lambda, Firehose delivery, backend Athena queries, Glue ETL, and EventBridge Scheduler.

## 2. Clickstream ingestion to S3 Raw

- [x] 2.1 Implement the ingestion Lambda to parse and validate a supported batch and convert each event to newline-delimited raw JSON.
- [x] 2.2 Define the Firehose delivery stream with gzip compression and the `schema_version/dt/hour` S3 Raw prefix convention.
- [x] 2.3 Connect the designated API Gateway route to the ingestion Lambda and connect the Lambda to the Firehose stream.
- [x] 2.4 Add happy-path unit and contract tests proving a valid batch is mapped to the expected Firehose records without prohibited fields.

## 3. Athena-backed seller CTR

- [x] 3.1 Define the Glue Catalog external table for raw gzipped JSON with partition projection over schema version, UTC date, and UTC hour.
- [x] 3.2 Define the Athena workgroup and lifecycle-managed query-result prefix with a scan limit appropriate for the MVP.
- [x] 3.3 Implement the backend Athena adapter using a fixed aggregation query constrained by partitions, occurrence time, shop, product, and impression/click event types.
- [x] 3.4 Implement `GET /api/v1/seller/analytics/products/:productId/ctr` with seller authentication, trusted shop/product ownership lookup, DTO validation, OpenAPI documentation, and ordered time-bucket mapping.
- [x] 3.5 Add happy-path unit/integration tests for trusted seller scoping, Athena query construction, impression/click aggregation, and CTR response mapping; do not add browser E2E or forced-failure tests.

## 4. Daily training dataset

- [x] 4.1 Implement the Glue ETL script to read the previous local calendar day's overlapping raw partitions and filter records by `occurredAt`.
- [x] 4.2 Implement impression-to-click attribution using the configured 30-minute window and produce the documented impression-level `labelClicked` columns.
- [x] 4.3 Write the canonical processed output as date-versioned Parquet and publish one header-bearing UTF-8 `exports/training/run_date=<date>/training.csv` artifact.
- [x] 4.4 Define the Glue job and EventBridge Scheduler invocation for 04:00 daily in `Asia/Ho_Chi_Minh`, passing the previous source date explicitly.
- [x] 4.5 Add happy-path transform tests using fixtures with clicked and unclicked impressions and verify the processed schema, labels, versioned paths, and CSV header.

## 5. MVP handoff and verification

- [x] 5.1 Document the raw schema, CTR formula and endpoint parameters, training column dictionary, attribution rule, S3 layouts, 04:00 schedule, and Model Training input path.
- [x] 5.2 Document the accepted MVP trade-offs: Firehose visibility delay, Athena request latency/scan cost, possible duplicates or missing data, manual rerun, and no automated recovery.
- [x] 5.3 Run repository lint, type-check, and the scoped happy-path unit/integration suites for the ingestion, Athena endpoint, and Glue transform components; no E2E suite is required.
