## 1. Contracts and persistence

- [x] 1.1 Define seller-review list, create-report receipt, admin reported-review queue/detail, and `HIDE|KEEP_VISIBLE` resolution contracts with strict IDs, bounded review-specific reasons, idempotency, and safe projections.
- [x] 1.2 Add an additive `SellerReviewReport` model/migration with review, reporting-seller, and shop foreign keys; unresolved dedupe and idempotency uniqueness; indexed admin/seller queue reads.

## 2. Seller review reporting API

- [x] 2.1 Implement seller-owned review listing and idempotent report creation with current shop ownership, canonical normalization, privacy-safe not-found behavior, and private no-store responses.
- [x] 2.2 Add service and PostgreSQL E2E coverage for ownership denial, duplicate/idempotent submissions, malformed inputs, and projection privacy.

## 3. Admin review-report moderation

- [x] 3.1 Implement private admin reported-review queue/detail and an atomic `HIDE|KEEP_VISIBLE` resolution that updates seller report state, review visibility/aggregates when needed, and one safe audit event.
- [x] 3.2 Add tests for role denial, stale/idempotent commands, no-action visibility preservation, aggregate refresh, and audit/report privacy.

## 4. UI and verification

- [x] 4.1 Add Seller Center review listing/report dialog with accessible validation, confirmation, receipt/error states, and no persisted drafts.
- [x] 4.2 Update the admin review moderation tab with reported-review queue, safe report context, confirmation-gated hide/keep-visible actions, and secondary manual lookup.
- [x] 4.3 Add Testing Library and Playwright coverage for seller report → admin resolution and verify responsive/keyboard/privacy behavior; document routes and reason semantics.
