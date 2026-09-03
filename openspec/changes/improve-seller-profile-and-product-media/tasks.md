## 1. Shop profile read mode

- [x] 1.1 Refactor seller shop management into loading, onboarding, read-only profile, and editing states without changing the no-shop onboarding path.
- [x] 1.2 Build the read-only profile presentation for identity, status, contact, pickup address, return address, optional logo/banner, and missing-value placeholders.
- [x] 1.3 Add `Cập nhật hồ sơ` and `Hủy` transitions, reset cancelled edits from canonical data, and return to refreshed read mode after a successful save while retaining the draft on failure.
- [x] 1.4 Add frontend tests for existing-shop default view, edit/cancel, successful save, failed save, pending/rejected status, and no-shop onboarding.

## 2. Product media persistence and storage

- [x] 2.1 Add the Prisma seller-product media state/table, ownership and expiry indexes, managed asset-to-product-image relation, and optional first-option-value image relation with a migration.
- [x] 2.2 Implement dedicated seller product media storage using opaque random keys under `SELLER_PRODUCT_MEDIA_ROOT`, with safe write/read/delete behavior and storage unit tests.
- [x] 2.3 Implement decoded JPEG/PNG/WebP validation, 5 MB and dimension limits, staged metadata creation, and 24-hour expiry behavior.
- [x] 2.4 Implement deterministic cleanup for expired staged product media and test that attached media is never removed.

## 3. Product media API and security

- [x] 3.1 Add authenticated seller upload `POST /api/v1/seller/products/media` using single-file multipart input and return the staged asset metadata plus owner-only preview URL.
- [x] 3.2 Add the authenticated owner-only staged preview route and stable public attached-media route with correct content type, cache headers, and non-disclosing errors.
- [x] 3.3 Restrict the multipart exception to the exact seller product media upload route while preserving authentication and Origin/CSRF checks.
- [x] 3.4 Add controller/service tests for valid upload, unauthenticated/ineligible seller, oversized/unsupported/spoofed content, foreign preview, staged public denial, attached public response, and traversal-resistant storage keys.

## 4. Seller product contracts and atomic writes

- [x] 4.1 Replace new raw media URL writes with validated `existing` and `upload` media references while preserving resolved URL responses and legacy external image readability.
- [x] 4.2 Extend option-value input/output contracts with an optional first-group media reference and reject second-group, duplicate, missing, foreign, or unresolved references.
- [x] 4.3 Update seller product create/update transactions to verify ownership and expiry, retain existing images, attach staged assets, preserve order, write option-image mappings, and roll back all database changes together on failure.
- [x] 4.4 Derive variant display images from their first option value without duplicating media for combinations such as `Đỏ · M` and `Đỏ · L`.
- [x] 4.5 Safely handle removed/replaced managed images after commit and keep failed-save staged assets retryable.
- [x] 4.6 Add contract and service tests for media reference validation, nine-image limit, legacy compatibility, atomic rollback, foreign/expired assets, reordered galleries, removed mappings, and shared first-group images.

## 5. Seller product file-picker UI

- [x] 5.1 Replace the image URL textarea with a multiple local-file picker that performs client validation, creates/revokes previews, and uploads valid files individually with bounded concurrency.
- [x] 5.2 Display per-file uploading/success/error states with retry and remove actions while retaining all other product form data after partial failures.
- [x] 5.3 Add gallery ordering controls and serialize only successfully uploaded or retained existing images in the chosen order.
- [x] 5.4 Add an optional image selector beside each value in the first classification group, reuse the current gallery, preserve unambiguous renames, and clear mappings when values/images are removed.
- [x] 5.5 Display generated combinations with their resolved first-group image so the seller can verify `Đỏ-M`, `Đỏ-L`, `Xanh-M`, and `Xanh-L` before saving stock.
- [x] 5.6 Add frontend tests for multi-select, validation, partial upload retry, removal/reordering, legacy images, classification mapping, generated combinations, and save payloads.

## 6. Verification and documentation

- [x] 6.1 Add PostgreSQL integration coverage for upload → private preview → atomic product save → public image serving and for rollback/expiry/ownership denial paths.
- [x] 6.2 Add targeted Playwright coverage for existing-shop read/edit/cancel/save and seller product multi-file/classification-image workflows.
- [x] 6.3 Update API/OpenAPI and local setup documentation for media endpoints, `SELLER_PRODUCT_MEDIA_ROOT`, persistent Docker volume expectations, limits, and cleanup command.
- [x] 6.4 Update `flow.md` with the implemented shop-profile and product-media/classification flows, including the screens and endpoints used for manual verification.
- [x] 6.5 Run Prisma validation/migration checks, contract/API/web unit tests, targeted PostgreSQL integration tests, seller Playwright tests, typechecks, lint, and strict OpenSpec validation; record any intentionally skipped environment-dependent check.
