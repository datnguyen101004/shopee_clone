## Why

Sellers currently have no controlled way to flag an abusive, irrelevant, or fraudulent review of a product they own. Admins must manually receive a review identifier and cannot see the seller's report context, which makes review moderation slow and inconsistent.

## What Changes

- Let an authenticated seller report a review only when that review belongs to a product in a shop the seller currently owns.
- Store one bounded, idempotent, unresolved seller report per seller-review pair and expose a seller-only list of reviews from the seller's shop.
- Add an admin queue of reported reviews and enrich the review moderation detail with safe seller-report reasons and report state.
- Let an admin hide a reported review or keep it visible; either decision resolves the open seller reports atomically without exposing seller identity to the review author or public clients.

## Capabilities

### New Capabilities

- `seller-review-reporting`: Seller-owned review listing, report submission, deduplication, and private report state.

### Modified Capabilities

- `admin-console`: Admin review moderation shows reported reviews, safe report context, and an explicit keep-visible decision.
- `admin-privileged-audit`: Review-report resolutions produce one bounded review-target audit event without seller-report details.

## Impact

- **API:** seller review list/report routes and an admin reported-review queue/resolution route under `/api/v1`.
- **Persistence:** additive seller review-report records, restrictive review/shop foreign keys, idempotency/deduplication indexes, and a migration.
- **UI:** a Seller Center review page and an admin review-report queue with accessible confirmation and loading/error states.
- **Privacy/security:** authorization follows seller ownership at request time; public, buyer, and unrelated seller responses never expose report identity, reason, or status.
