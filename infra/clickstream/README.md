# Clickstream MVP infrastructure

`template.yaml` is deployable CloudFormation for the bounded happy path only:

`existing HTTP API -> ingestion Lambda -> Firehose -> S3 Raw -> Athena/Glue`.

The stack does not create an API or stage. Supply `ExistingHttpApiId`; it adds
the `POST /clickstream/events` route and outputs the endpoint on that API.

The Lambda role can only call the named Firehose stream. Firehose can only put
objects under `raw/` and `raw-errors/`; the backend Athena role, Glue role, and
Scheduler role are separate. Buckets use SSE-S3, block public access, retain
data across stack rollback, and lifecycle rules. No credentials or AWS
resource mutations are stored in this repository.

`CreateDataBuckets` defaults to `true`, so a fresh environment creates the Raw
and Processed buckets with those protections and `Retain` policies. For an
existing bucket pair (for example, a Processed bucket already referenced by
QuickSight), deploy with `CreateDataBuckets=false`. The bucket resources are
then skipped, while all IAM policies, Firehose configuration, Glue arguments,
catalog locations, and outputs use the supplied `RawBucketName` and
`ProcessedBucketName` values. The stack does not own, mutate, replace, or
delete those existing buckets; their encryption, access blocking, lifecycle,
and required prefixes remain an operator prerequisite. Switching back to
`true` is only appropriate when the named buckets are available for this
stack to create.

`AthenaDatabaseName`, `AthenaTableName`, and `AthenaWorkGroupName` default to
`clickstream`, `raw_clickstream_events`, and `clickstream-mvp`, matching the
backend configuration defaults. Keep these parameter values aligned with the
backend environment so the unquoted Athena query resolves the same Catalog
database, table, and workgroup.

The ingestion handler verifies the dispatcher HMAC headers using the
deployment-only `IngestionHmacKeyId` and `IngestionHmacSecret` parameters. The
template does not manage the shared `/aws-glue/jobs/error` or
`/aws-glue/jobs/output` log groups; the Glue role is scoped to those standard
group names for job logging.

Firehose extracts `schema_version`, `dt`, and `hour` from each JSON record,
appends exactly one newline, and writes
`raw/schema_version=<version>/dt=<UTC-date>/hour=<UTC-hour>/`.
The scheduler passes the AWS Glue arguments `--SOURCE_DATE`, `--RUN_DATE`,
`--RAW_BUCKET`, `--PROCESSED_BUCKET`, `--ATTRIBUTION_WINDOW_MINUTES`, and
`--TIME_ZONE`; `--SOURCE_DATE=previous-local-day` resolves
that sentinel against `Asia/Ho_Chi_Minh` at runtime so the source date is an
explicit job argument and can also be overridden for a manual happy-path run.

The Glue role is granted `s3:GetObject` only for the configured
`GlueScriptS3Bucket/GlueScriptS3Key` artifact. The stack outputs
`AthenaQueryRoleArn`; pass that value as `CLICKSTREAM_ATHENA_ROLE_ARN` to the
existing backend runtime. Supply its exact IAM role ARN as
`AthenaBackendPrincipalArn`; that runtime identity must have
`sts:AssumeRole` on the output role. CloudFormation does not attach the role to
EC2 or any other runtime, and the API adapter uses ambient credentials only
when the role ARN is intentionally absent (for local development).
