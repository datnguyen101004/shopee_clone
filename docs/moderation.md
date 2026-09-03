# Product & Shop Moderation and User Reporting (T28)

This document specifies the reporting, moderation case workflow, review takedown, seller notice, and privacy enforcement mechanisms implemented in Shopee Clone.

---

## 1. Overview & Architecture

The moderation subsystem provides:
1. **Buyer Reporting**: Rate-limited, idempotent report submissions against products and shops.
2. **Admin Moderation Queue**: Aggregated case management, deterministic assignment, internal notes, and atomic enforcement decisions (`NO_ACTION`, `SUSPEND_TARGET`, `RESTORE_TARGET`, `DECISION_REVERSED`).
3. **Review Moderation**: Sellers can privately flag reviews on their own shop products; admins can hide, restore, or explicitly keep a seller-reported review visible while immediately keeping product and shop rating aggregates consistent when visibility changes.
4. **Seller Moderation Notices**: Privacy-safe notification records for sellers whose shops or products are suspended or restored, with read receipts.
5. **Privileged Audit Logging**: Non-repudiable audit trails for privileged actions without storing reporter identity or sensitive buyer details.

---

## 2. API Reference

### 2.1 Buyer Reporting Endpoints

- **`POST /api/v1/reports`**
  - Headers: `Authorization: Bearer <token>`, `Origin`, `Idempotency-Key: <UUID>`
  - Body:
    ```json
    {
      "targetType": "PRODUCT",
      "targetId": "uuid-here",
      "reasonCode": "COUNTERFEIT",
      "details": "Evidence and description of violation (20-1000 chars)",
      "evidenceUrls": ["https://example.com/img1.jpg"]
    }
    ```
  - Responses: `201 Created` with `{ reportId, status: "SUBMITTED" }`, `429 Too Many Requests` with `retryAfterSeconds`, `409 Conflict` (pending active report).

- **`GET /api/v1/account/reports`**
  - Headers: `Authorization: Bearer <token>`
  - Query: `limit`, `cursor`, `status`
  - Responses: `200 OK` with `{ items: [...], nextCursor }`.

- **`GET /api/v1/account/reports/:reportId`**
  - Responses: `200 OK` with individual buyer report details, `404 Not Found` if non-existent or owned by another user.

---

### 2.2 Admin Moderation Endpoints

- **`GET /api/v1/admin/moderation/cases`**
  - Role: `admin`
  - Query: `status` (`OPEN`, `IN_REVIEW`, `RESOLVED`), `targetType` (`PRODUCT`, `SHOP`), `reasonCode`, `assignedAdminId`, `limit`, `cursor`.
  - Responses: `200 OK` with `{ items: [...], nextCursor }`.

- **`GET /api/v1/admin/moderation/cases/:caseId`**
  - Role: `admin`
  - Responses: `200 OK` with complete case details, opaque reporter IDs (`reporter-1`), evidence, event history, notes, and decisions.

- **`POST /api/v1/admin/moderation/cases/:caseId/assign`**
  - Role: `admin`
  - Headers: `Idempotency-Key`, `Origin`
  - Body: `{ "assignedAdminId": "uuid-or-null", "expectedVersion": 0 }`
  - Responses: `200 OK` with `{ caseDetail }`, `409 Conflict` on version mismatch.

- **`POST /api/v1/admin/moderation/cases/:caseId/notes`**
  - Role: `admin`
  - Headers: `Idempotency-Key`, `Origin`
  - Body: `{ "note": "Internal investigation note (1-2000 chars)", "expectedVersion": 1 }`
  - Responses: `200 OK` with `{ caseDetail }`.

- **`POST /api/v1/admin/moderation/cases/:caseId/decisions`**
  - Role: `admin`
  - Headers: `Idempotency-Key`, `Origin`
  - Body:
    ```json
    {
      "outcome": "SUSPEND_TARGET",
      "publicReason": "Violation of product counterfeit guidelines (8-240 chars)",
      "privateNote": "Internal justification",
      "expectedVersion": 2,
      "reversesDecisionId": "optional-uuid"
    }
    ```
  - Responses: `200 OK` with `{ caseId, outcome, version, targetStatus, resolvedAt }`.

---

### 2.3 Admin Review Moderation Endpoints

- **`GET /api/v1/admin/reviews/:reviewId`**
  - Role: `admin`
  - Responses: `200 OK` with `AdminReviewDetail`, including only the open seller-report reason/details required for moderation and never seller identity.

- **`GET /api/v1/admin/reviews/reported`**
  - Role: `admin`
  - Responses: `200 OK` with the private queue of reviews that have unresolved seller reports. List rows contain review/product/shop context and report count, never seller identity or report details.

- **`POST /api/v1/admin/reviews/:reviewId/actions`**
  - Role: `admin`
  - Headers: `Idempotency-Key`, `Origin`
  - Body: `{ "action": "HIDE" | "RESTORE" | "KEEP_VISIBLE", "reason": "Reason string (8-240 chars)", "expectedVersion": 0 }`
  - Responses: `200 OK` with `{ reviewId, visibility, version, updatedAt }`.

---

### 2.4 Seller Review Reporting Endpoints

- **`GET /api/v1/seller/reviews`**
  - Role: `seller`
  - Responses: `200 OK`, `Cache-Control: private, no-store`, with reviews belonging only to products in shops currently owned by the authenticated seller. The projection omits buyer contact data and other sellers' reports.

- **`POST /api/v1/seller/reviews/:reviewId/reports`**
  - Role: `seller`
  - Headers: `Idempotency-Key: <UUID>`
  - Body: `{ "reasonCode": "ABUSIVE_CONTENT" | "IRRELEVANT_CONTENT" | "SPAM_OR_FRAUD" | "OTHER", "details"?: "1-1000 chars" }`
  - Responses: `201 Created` with a seller-safe receipt. A review outside the seller's current shop and a missing review both return the same `404`; the action never changes public visibility directly.

### 2.5 Seller Moderation Notices Endpoints

- **`GET /api/v1/seller/moderation-notices`**
  - Role: `seller`
  - Query: `unreadOnly=true|false`, `limit`, `cursor`.
  - Responses: `200 OK` with `{ items: [...], unreadCount, nextCursor }`.

- **`POST /api/v1/seller/moderation-notices/:noticeId/read`**
  - Role: `seller`
  - Headers: `Origin`
  - Responses: `200 OK` with `{ noticeId, readAt }`.

---

## 3. Privacy & Security Guarantees

1. **Reporter Anonymity**:
   - Reports projected to admins replace buyer IDs with deterministic opaque identifiers (`reporter-1`, `reporter-2`).
   - Privileged audit events never log buyer contact information or raw report evidence URLs.
   - Seller notices contain only the public justification reason provided by admin decisions.
2. **Rate Limiting**:
   - Rolling rate limiting: max 20 attempts per hour, max 10 accepted reports per 24 hours per user.
   - `pnpm --filter @shopee-clone/api reporting:rate-limit:cleanup` cleans up expired rate-limit event rows.
3. **Optimistic Locking**:
   - All state transitions (assignment, notes, decisions, review visibility) verify `expectedVersion` and reject stale writes with `409 Conflict`.
4. **Idempotency**:
   - Mutation endpoints enforce unique `(actor_user_id, idempotency_key)` command tracking to safely retry transactions.
   - Seller review reports enforce one unresolved report per seller-review pair. A retry with the same idempotency key replays the original receipt; a conflicting key reuse returns `409`.
