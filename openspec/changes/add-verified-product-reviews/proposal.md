## Why

T20 now establishes delivered, buyer-owned order lines, but the storefront still has no trustworthy way for buyers to report product experience or for shoppers to evaluate a product or shop from verified feedback. T21 turns that delivered-order evidence into a review flow and server-derived rating summaries.

## What Changes

- Add a verified-review domain tied to one delivered `OrderLine`, with one buyer-authored review per eligible line, a 1–5 rating, optional bounded text, and optional validated image references.
- Add a deterministic edit/moderation policy: newly created and buyer-edited reviews are visible by default, while a future privileged `HIDDEN` decision excludes a review from public reads and aggregates without deleting its audit history.
- Add owner-scoped buyer APIs and screens to create, edit, and inspect eligible reviews without exposing another buyer's order.
- Add public, cursor-paginated product review reads with exact rating filters and server-derived product/shop rating summaries.
- Extend product detail and buyer order detail with review summaries, verified-purchase markers, eligibility, and resilient loading, empty, validation, and conflict states.
- Add owner-bound staged review images rather than accepting arbitrary client-supplied URLs.

## Capabilities

### New Capabilities

- `verified-product-reviews`: Delivered-order eligibility, one-review-per-line enforcement, owner create/edit operations, moderation visibility, staged media ownership, and buyer UI.
- `product-rating-aggregation`: Public review discovery plus authoritative product/shop rating counts and averages derived from visible verified reviews.

### Modified Capabilities

None. The repository has no synchronized main review specs; T21 consumes the completed T20 order capability without changing its lifecycle transitions.

## Impact

- **Database:** Add review, media, moderation-audit, idempotency, and rating-aggregate persistence with strict constraints and indexes.
- **Backend:** Add private author review/media endpoints, public product review reads, aggregate recomputation, OpenAPI, Problem Details, AuthGuard, and Origin protection.
- **Contracts:** Add framework-neutral review, media, eligibility, cursor, ETag/idempotency, privacy-safe public response, and aggregate contracts.
- **Frontend:** Add delivered-order review actions/forms, product review list/filter/media UI, and authoritative product/shop rating presentation.
- **Quality:** Add migration, PostgreSQL concurrency, ownership, media, aggregate, component, accessibility, and focused Playwright coverage.
- **Tracking:** Implements GitHub issue #22 (T21) and is unblocked by completed T20.
