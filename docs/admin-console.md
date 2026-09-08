# Admin Console Architecture & Security (T27)

T27 adds the operational Admin Console, enabling platform administrators to oversee marketplace operations, manage users, approve and moderate seller shops, maintain category taxonomy, configure homepage modules & campaign banners, and review append-only privileged audit events.

## Permission Matrix & Security Guardrails

| Route Group | Path | Auth / Role | Safeguards |
| :--- | :--- | :--- | :--- |
| **Dashboard** | `GET /api/v1/admin/dashboard` | `AuthGuard` + `RolesGuard('admin')` | Realtime count aggregate, `Cache-Control: private, no-store` |
| **User Moderation** | `GET /api/v1/admin/users`, `POST .../actions` | `AuthGuard` + `RolesGuard('admin')` + Trusted Origin | Self-suspend prevention, Last-Admin conflict protection, immediate DB session revocation (`revokedAt = now()`) |
| **Shop Moderation** | `GET /api/v1/admin/shops`, `POST .../actions` | `AuthGuard` + `RolesGuard('admin')` + Trusted Origin | Restore rejected shop prevention, reason bounded 8-240 chars |
| **Category Hierarchy** | `GET /api/v1/admin/categories`, `POST`, `PATCH`, `DELETE` | `AuthGuard` + `RolesGuard('admin')` + Trusted Origin | Max 3 depth levels, parent cycle conflict detection, product/child integrity locks |
| **Homepage & Banners**| `GET /api/v1/admin/homepage/banners`, `POST`, `PATCH`, `DELETE` | `AuthGuard` + `RolesGuard('admin')` + Trusted Origin | Open-redirect defense (relative path `/...`), media URL allowlist |
| **Moderation Cases** | `GET /api/v1/admin/moderation/cases`, `GET /:caseId`, `POST .../assign`, `POST .../notes`, `POST .../decisions` | `AuthGuard` + `RolesGuard('admin')` + Trusted Origin + Idempotency | Optimistic locking, opaque reporter IDs, non-exclusive coordination, enforcement actions, seller notice correlation |
| **Review Moderation** | `GET /api/v1/admin/reviews/reported`, `GET /api/v1/admin/reviews/:reviewId`, `POST .../actions` | `AuthGuard` + `RolesGuard('admin')` + Trusted Origin + Idempotency | Private seller-report queue, safe report context without seller identity, atomic hide/keep-visible resolution, rating aggregate refresh and optimistic locking |
| **Privileged Audit** | `GET /api/v1/admin/audit` | `AuthGuard` + `RolesGuard('admin')` | Append-only in PostgreSQL, transactional writes, no update/delete routes |

### Homepage banner image storage

The Admin homepage image picker stages JPG, PNG, and WebP files through a signed S3 `PUT` and a server-side completion check. Banner objects use the fixed `admin-banner-media/*` prefix in the configured private bucket and are served through the configured CloudFront viewer base. The bucket policy and S3 CORS rule must permit this prefix for the signed upload and the CloudFront origin; no credentials are stored in the browser. Apply the accompanying Prisma migration before enabling the upload endpoints.

## Multi-Device Session Invalidation on Suspend

When an administrator suspends a user via `POST /api/v1/admin/users/:userId/actions`:
1. User status is set to `SUSPENDED`.
2. All active sessions for `userId` in `auth_sessions` are updated with `revoked_at = NOW()`.
3. An append-only record is committed in `privileged_audit_events`.
4. Any subsequent API request using tokens from those sessions receives immediate `401 AuthenticationFailedError` upon session verification in `AuthGuard`.

## Category Taxonomy Integrity

- **Cycle Detection**: Attempting to set a category's `parentId` to itself or any of its descendants traverses upward and throws `409 CategoryCycleConflictError`.
- **Referential Integrity**: Categories with `productsCount > 0` or `childrenCount > 0` cannot be deleted and reject with `409 CategoryIntegrityConflictError`.
