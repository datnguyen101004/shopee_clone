## Why

Seller product images currently pass through the API process before reaching storage, which consumes API memory and bandwidth and couples upload reliability to the NestJS instance. A direct, short-lived S3 upload contract is needed while the bucket remains private and staged images remain visible only to the owning shop.

## What Changes

- Add an authenticated upload-intent API that allocates a server-owned media ID and opaque S3 object key, then returns an S3 presigned `PUT` URL valid for exactly five minutes (300 seconds).
- Let the seller frontend upload the image bytes directly to private S3 using the method and signed headers returned by the API; bucket names, credentials, and arbitrary object keys remain server-controlled.
- Add an authenticated completion API that verifies the uploaded S3 object before marking the staged media ready for product attachment.
- Serve staged shop previews through short-lived CloudFront signed URLs under `https://cdn.videod.me` only after seller authentication, shop ownership, media-state, and expiry checks.
- Preserve stable attached-media references and existing external HTTPS images; neither S3 nor CloudFront signed URLs are persisted in product or historical domain data.
- Keep S3 Block Public Access enabled and require CloudFront Origin Access Control, a trusted key group, restrictive CORS, bounded signatures, and diagnostic redaction.
- Defer notification delivery, automatic retry, orphan-remediation messaging, and other enhanced handling for failed S3 uploads to a later change. This change returns synchronous safe API errors only.

## Capabilities

### New Capabilities

- `seller-product-media-upload`: Seller-authorized direct image upload to private S3 through five-minute presigned URLs, upload completion verification, and owner-only CloudFront signed preview.

### Modified Capabilities

- None.

## Impact

- New/changed `/api/v1/seller/products/media` upload-intent, completion, and preview contracts in the NestJS seller-product media module and shared TypeScript contracts.
- Seller product editor upload orchestration in Next.js, including direct S3 `PUT`, completion confirmation, preview refresh, and signed-query redaction.
- Prisma staged-media state and upload-intent metadata needed to distinguish pending, ready, attached, expired, and abandoned uploads.
- AWS SDK S3 presigner and CloudFront signer dependencies; private S3 CORS, lifecycle cleanup, CloudFront OAC/trusted key group, IAM, environment configuration, and deployment documentation.
- API unit/Supertest/PostgreSQL tests, frontend tests, and a deployed browser journey covering five-minute expiry and owner-only preview.
