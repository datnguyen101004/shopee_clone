## Purpose

Enable sellers to upload validated product images directly to private S3 with five-minute credentials and preview staged media privately through CloudFront without exposing storage credentials or object layout.

## ADDED Requirements

### Requirement: Only an eligible seller can create an upload intent
The system SHALL require an authenticated seller with an active owned shop before allocating a seller-product media upload intent. The request SHALL declare an allowed image MIME type, a byte size from 1 byte through 5 MiB, and a SHA-256 checksum; the server SHALL generate the media identifier and opaque object key.

#### Scenario: Eligible seller requests an upload intent
- **WHEN** an authenticated eligible seller submits valid PNG, JPEG, or WebP metadata
- **THEN** the system creates a pending upload owned by that seller and shop and returns its media identifier and upload instructions

#### Scenario: Invalid or unauthorized intent request
- **WHEN** the caller is unauthenticated, lacks seller access, does not own an active shop, or submits unsupported or out-of-range metadata
- **THEN** the system rejects the request without allocating usable S3 upload credentials

### Requirement: S3 upload credentials expire after five minutes
The system SHALL return a presigned S3 `PUT` URL whose expiration is fixed at 300 seconds from issuance. The response SHALL include an absolute `expiresAt`, the required HTTP method, and all headers that the client must send; clients MUST NOT be allowed to select a longer lifetime.

#### Scenario: Upload occurs before expiry
- **WHEN** the owning seller sends the declared image bytes to the issued URL within 300 seconds using the exact signed headers
- **THEN** private S3 accepts the object at the server-generated key

#### Scenario: Upload URL is reused after expiry
- **WHEN** a client sends a `PUT` request after the five-minute expiration
- **THEN** S3 denies the request and the API does not extend or reuse that credential

### Requirement: Presigned uploads are constrained to one private object
Each upload intent SHALL authorize only one server-generated object key in the managed seller-product prefix and SHALL bind the declared content type and checksum. S3 Block Public Access SHALL remain enabled, no public ACL SHALL be issued, and bucket CORS SHALL permit only configured application origins, `PUT`, and the required signed headers.

#### Scenario: Client changes a signed upload property
- **WHEN** a client changes the object key, content type, checksum, method, or another signed property
- **THEN** S3 rejects the request and no alternate managed object is authorized

#### Scenario: Client requests the uploaded object directly from S3
- **WHEN** a client attempts an unsigned S3 read of a successfully uploaded image
- **THEN** S3 denies the request because the object and bucket remain private

### Requirement: Uploaded media must be confirmed before use
The system SHALL provide an owner-authorized completion operation for a pending upload. Before changing the media to staged-ready, the system SHALL verify that the expected S3 object exists and that its byte size, content type, checksum, image signature, dimensions, and server-owned key match the upload intent. Completion SHALL be idempotent for an already verified staged asset.

#### Scenario: Seller completes a valid upload
- **WHEN** the owning seller completes an intent whose S3 object matches all declared and supported image constraints
- **THEN** the system marks the media staged-ready, retains its existing staged expiry, and returns the stable preview route

#### Scenario: Seller completes a missing or mismatched upload
- **WHEN** the expected object is missing, incomplete, corrupt, oversized, has mismatched metadata, or is not a supported image
- **THEN** the system does not make the media attachable and returns a safe synchronous error without exposing bucket, key, AWS metadata, or a signed URL

#### Scenario: Another seller completes the upload
- **WHEN** a different seller submits the completion request for the media identifier
- **THEN** the system conceals or denies the pending media without verifying or changing its state

### Requirement: Shop preview uses an owner-only CloudFront signed URL
The system SHALL authorize the seller and shop ownership before previewing a non-expired staged-ready image. An eligible preview request SHALL return a non-cacheable temporary redirect to a CloudFront signed URL under `https://cdn.videod.me`, valid for no more than 300 seconds, while CloudFront uses a trusted key group and Origin Access Control to read private S3.

#### Scenario: Owning shop previews staged media
- **WHEN** the owning seller requests the preview of a non-expired staged-ready image
- **THEN** the system returns `307 Temporary Redirect` to a signed `cdn.videod.me` URL with `Cache-Control: private, no-store`, `Pragma: no-cache`, and `Referrer-Policy: no-referrer`

#### Scenario: Unauthorized or premature preview
- **WHEN** an anonymous user, another seller, or the owner of pending, expired, missing, or invalid media requests preview
- **THEN** the system denies or conceals the media and does not generate a CloudFront signed URL

#### Scenario: Preview signature expires
- **WHEN** the seller reuses the CloudFront preview URL after its bounded expiry
- **THEN** CloudFront denies the URL and the seller must resolve the stable preview route again

### Requirement: Signed credentials remain ephemeral and non-persistent
The system MUST NOT persist S3 presigned URLs, CloudFront signed URLs, signature query parameters, or signing credentials in product rows, order snapshots, notification metadata, analytics data, application logs, frontend console logs, telemetry, or error bodies. The pending asset MAY persist its server-owned storage key and verification metadata in backend-only storage.

#### Scenario: Diagnostics observe upload and preview traffic
- **WHEN** API or frontend diagnostics record an upload-intent, S3 upload, completion, preview, or failure
- **THEN** query credentials and the `X-Amz-*`, `Expires`, `Signature`, and `Key-Pair-Id` values are redacted while stable media identifiers and safe statuses remain observable

### Requirement: Existing product-media behavior remains compatible
Verified staged media SHALL continue through the existing ownership-checked product attachment flow, and attached managed images SHALL retain stable application media references. Existing external HTTPS images SHALL remain unchanged.

#### Scenario: Seller attaches a verified upload
- **WHEN** the owning seller saves a product using a staged-ready media identifier
- **THEN** the media becomes attached through the existing product workflow without persisting either presigned URL

#### Scenario: Seller submits a pending upload during product save
- **WHEN** a product request references media that has not completed verification
- **THEN** the system rejects the media reference as unavailable

### Requirement: Abandoned upload intents are bounded
Pending upload records and unattached objects SHALL have a documented cleanup policy so abandoned direct uploads cannot accumulate indefinitely. This change SHALL NOT send notification messages or run automatic user-facing retry workflows for failed uploads.

#### Scenario: Upload intent is abandoned
- **WHEN** no valid completion occurs within the configured cleanup window
- **THEN** scheduled database and S3 lifecycle cleanup can remove the pending record and unreferenced object without affecting attached media
