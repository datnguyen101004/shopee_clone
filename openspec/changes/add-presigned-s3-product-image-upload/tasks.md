## 1. Contracts, dependencies, and configuration

- [x] 1.1 Add shared upload-intent, upload-completion, and preview response contracts with strict MIME, byte-size, checksum, method, headers, and UTC expiry types.
- [x] 1.2 Add the AWS S3 presigner and CloudFront signer dependencies to the API workspace and pin compatible versions in the lockfile.
- [x] 1.3 Add validated environment configuration for the private bucket, region, managed key prefix, rollout flag, `https://cdn.videod.me`, CloudFront key pair/private key, and server-fixed 300-second S3 and CloudFront TTLs.
- [x] 1.4 Document IAM and secret-loading requirements without committing bucket credentials, signer keys, or signed example URLs.

## 2. Pending-upload persistence and cleanup

- [x] 2.1 Extend the Prisma media state with `PENDING_UPLOAD` and add the declared checksum, upload credential expiry, and nullable pre-verification image metadata required by the design.
- [x] 2.2 Create and validate a PostgreSQL migration plus indexes/invariants for owner-scoped pending, staged, attached, and expired media lookups.
- [x] 2.3 Update repositories and test factories so pending media cannot be attached or previewed before verified completion.
- [x] 2.4 Implement idempotent scheduled cleanup for expired pending records and document the matching S3 lifecycle rule for unreferenced objects.

## 3. S3 upload-intent API

- [x] 3.1 Implement seller and active-shop authorization for `POST /api/v1/seller/products/media/upload-intents` before any credential is issued.
- [x] 3.2 Validate PNG/JPEG/WebP MIME type, size from 1 byte through 5 MiB, and a canonical SHA-256 checksum, then allocate a server-owned media ID and opaque managed object key.
- [x] 3.3 Persist the pending intent before generating a single-object S3 presigned `PUT` URL that binds the key, content type, checksum, and exact 300-second expiry.
- [x] 3.4 Return only the method, required signed headers, absolute expiry, media ID, and ephemeral URL; map signing failures to safe Problem Details errors.
- [x] 3.5 Add unit and Supertest coverage for eligibility, metadata boundaries, key isolation, fixed TTL, exact signed headers, and responses/logs that do not leak AWS credentials.

## 4. Upload completion and image verification

- [x] 4.1 Implement owner-authorized `POST /api/v1/seller/products/media/{mediaId}/complete` with concealed cross-seller access and idempotent success for already verified media.
- [x] 4.2 Verify the expected object through private `HeadObject` and a bounded read, comparing key, size, MIME, checksum, image magic bytes, dimensions, and the existing 5 MiB/5,000-pixel constraints.
- [x] 4.3 Atomically transition a valid asset from `PENDING_UPLOAD` to `STAGED`, save verified metadata, start the existing staged attachment window, and return the stable preview route.
- [x] 4.4 Keep missing, corrupt, mismatched, expired, or unsupported objects non-attachable and return synchronous safe errors without notifications, automatic retries, storage keys, or signed URLs.
- [x] 4.5 Add service, Supertest, and PostgreSQL-backed race tests for valid completion, duplicate completion, missing/mismatched objects, ownership denial, and pending-media product-save rejection.

## 5. Owner-only CloudFront preview

- [x] 5.1 Update the stable preview route to authorize seller/shop ownership and require a non-expired `STAGED` asset before invoking the CloudFront signer.
- [x] 5.2 Generate a signed `https://cdn.videod.me` URL valid for no more than 300 seconds and return a bodyless `307` with private no-store, no-cache, and no-referrer headers.
- [x] 5.3 Ensure pending, attached-ineligible, expired, missing, and cross-owner requests never generate a signature and return the existing safe denial semantics.
- [x] 5.4 Add tests for CDN host/path generation, expiry bounds, redirect headers, signer failure, ownership/state denial, and absence of signature values from bodies and logs.

## 6. Seller frontend direct-upload flow

- [x] 6.1 Add an in-memory upload client that calculates SHA-256 with Web Crypto, requests an intent, sends the exact direct S3 `PUT`, and calls completion after S3 accepts the object.
- [x] 6.2 Integrate the client into product create/edit image selection while retaining the 5 MiB/type checks and storing only the media ID plus stable preview route in form state.
- [x] 6.3 Handle five-minute credential expiry and synchronous upload/completion failures with current inline UI states; do not add notification delivery or automatic retry workflows in this change.
- [x] 6.4 Redact `X-Amz-*`, `Expires`, `Signature`, and `Key-Pair-Id` query values from frontend/API diagnostics and keep signed URLs out of persistence, analytics, telemetry, and console logs.
- [x] 6.5 Add frontend unit/integration tests for checksum generation, exact PUT headers, completion ordering, expiry behavior, stable preview refresh, and credential redaction.

## 7. AWS private-delivery configuration and rollout

- [ ] 7.1 Configure and verify S3 Block Public Access, no public ACLs, managed-prefix IAM permissions, restrictive application-origin CORS for `PUT`, and bounded lifecycle cleanup.
- [ ] 7.2 Configure CloudFront `cdn.videod.me` with the private S3 origin, OAC always-sign behavior, trusted key group, certificate/DNS, and no unsigned viewer access to staged media.
- [x] 7.3 Keep legacy multipart upload and direct upload selectable behind the rollout flag, enable the new flow for an internal shop cohort, and document rollback without making storage public.
- [ ] 7.4 Run deployed smoke checks proving direct unsigned S3 reads fail, modified/expired PUT signatures fail, owner preview succeeds, cross-owner preview fails, and expired CDN URLs fail.

## 8. Quality gates and handoff

- [ ] 8.1 Add a Playwright seller journey covering intent creation, direct upload, completion, staged preview, and product attachment against an S3-compatible test environment.
- [ ] 8.2 Run API and web unit/integration suites, PostgreSQL tests, lint, strict type-check, production builds, Prisma validation/generation, and resolve all regressions.
- [x] 8.3 Validate this change with `openspec validate add-presigned-s3-product-image-upload --strict` and update deployment/runbook documentation with the verified configuration and rollback checks.
