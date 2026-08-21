## Context

T28 can hide or restore a review, but it accepts only direct admin commands. This change adds a seller-originated signal without turning sellers into moderators or exposing the buyer who authored the review.

## Design

### Ownership and report boundary

`SellerReviewReport` references one review, the reporting seller user, and the review's shop captured through the review. The creation transaction verifies `review.shop.ownerId = authenticated seller id`; a missing, deleted, or foreign review returns the same seller-safe not-found response. A partial unique index permits only one unresolved report per `(sellerUserId, reviewId)`, while an idempotency key replays the original receipt.

Reasons use a review-specific allowlist (`ABUSIVE_CONTENT`, `IRRELEVANT_CONTENT`, `SPAM_OR_FRAUD`, `OTHER`) and optional bounded details. No remote evidence is fetched or rendered. A seller may report a review but cannot hide, edit, or discover a review outside their current shop ownership.

### Admin resolution

The admin review queue projects review id, product/shop label, rating/text, report count, and reason summary. It excludes seller user id, buyer contact data, and internal details from list rows. Detail exposes only the bounded report reasons/details needed by an admin.

An admin chooses `HIDE` or `KEEP_VISIBLE`. `HIDE` reuses the existing review visibility/aggregate transaction; `KEEP_VISIBLE` changes no public review state. Both choices resolve the selected open seller reports and write one review-target privileged audit event with safe before/after visibility/report-state summary. Idempotency and expected review version prevent duplicate state changes and audit records.

### UI

Seller Center gains a review list for the seller's current shop and a report dialog per review. The dialog holds drafts only in memory, requires a reason, shows a duplicate/pending receipt, and never shows another shop's data.

The admin review tab becomes a reported-review queue. Selecting a row shows the review, its safe report context, current visibility, and a confirmation-gated `Ẩn đánh giá` or `Giữ nguyên hiển thị` decision. The existing direct review-ID lookup remains available as a secondary lookup for urgent manual moderation.

## Risks

- A seller may attempt to suppress legitimate criticism. Seller reports are only a signal; admin action remains required and every choice is audited.
- Ownership can change during a request. The report transaction checks current ownership and locks the review before insertion; existing reports retain their original seller reporter but are not transferred.
- Resolution details are sensitive operational data. They remain private to admin APIs and use `Cache-Control: private, no-store`.
