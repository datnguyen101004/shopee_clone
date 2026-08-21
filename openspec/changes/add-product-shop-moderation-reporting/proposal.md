## Why

T27 gives administrators direct product and shop status controls, but buyers still cannot report policy violations and operators have no durable queue that connects evidence, review notes, decisions, target enforcement, seller communication, and audit history. T28 adds that trust-and-safety workflow now that verified reviews (T21), seller-owned catalog data (T23), and the audited admin console (T27) provide the required ownership and enforcement boundaries.

## What Changes

- Let authenticated buyers report a currently identifiable product or shop with a categorized reason, bounded evidence details, optional safe evidence references, and an idempotent receipt.
- Prevent duplicate and spam submissions with database-backed per-reporter limits, one active report per reporter/target boundary, and privacy-safe `429`/duplicate outcomes.
- Group accepted reports into target-scoped moderation cases with a cursor-paginated admin queue, nullable assignment placeholder, optimistic versioning, private notes, evidence history, and explicit workflow states.
- Let admins resolve a case with no action, suspend/hide a product, suspend a shop, or reverse a prior enforcement decision. Preserve existing seller lifecycle/onboarding state and do not cancel historical orders.
- Add the T21-prepared admin review hide/restore operation, using the existing review visibility and append-only review-moderation history without expanding buyer reports beyond products and shops.
- Commit moderation decisions, target state changes, case history, seller-safe notices, and privileged audit records atomically; failed and idempotent no-op decisions create no partial or duplicate history.
- Add a seller-only moderation notice center that exposes the affected resource, public decision category, safe reason, effective state, and time while never exposing reporter identity, raw evidence, internal notes, or admin identity. General email/push delivery remains owned by T30.
- Add buyer report entry points on product and shop pages, an owner-only report history, and an admin moderation workspace with accessible confirmation and explicit loading, empty, conflict, forbidden, and failure states.

## Capabilities

### New Capabilities

- `buyer-content-reporting`: Authenticated product/shop report submission, durable anti-spam and idempotency rules, safe reporter receipts/history, and target privacy behavior.
- `admin-moderation-workflow`: Target-scoped case queue, assignment placeholder, private notes, decisions, reversible product/shop enforcement, and bounded review hide/restore operations.
- `seller-moderation-notices`: Durable seller-visible product/shop moderation notices with safe reason projection and strict reporter/operator privacy.

### Modified Capabilities

- `admin-console`: Add the role-gated moderation queue, case detail, assignment, decision, review-action, and conflict/retry UI states.
- `admin-entity-administration`: Make product/shop moderation transitions case-aware while retaining existing direct admin actions, shop onboarding guards, idempotency, and public visibility guarantees.
- `admin-privileged-audit`: Extend the append-only audit contract to cover moderation cases and review visibility decisions and correlate target mutations with their moderation decision.

## Impact

- **Contracts/API:** New framework-neutral reporting, moderation-case, seller-notice, and review-action contracts under `packages/contracts`; new authenticated `/api/v1/reports` and `/api/v1/account/reports` reads, admin `/api/v1/admin/moderation` routes, seller `/api/v1/seller/moderation-notices` reads, and an admin review action route. Existing direct product/shop admin action routes remain compatible.
- **Backend:** New NestJS reporting/moderation modules plus transaction-bound reuse of admin product/shop enforcement, review aggregation refresh, trusted-origin mutation protection, Problem Details mapping, OpenAPI, and private/no-store projections.
- **Database:** Prisma models/enums/indexes/check constraints for reports, moderation cases, case events/notes, idempotent commands, rate-limit buckets, and seller notices; additive audit target/action values and links only.
- **Frontend:** Product/shop report dialogs and report history, an admin queue/detail workflow, and a seller moderation notice view in the existing Next.js App Router shells.
- **Security/operations:** Authenticated ownership, admin/seller role gates, database-backed throttling, bounded inputs, no external evidence fetching, safe reason projection, append-only audit, UTC timestamps, and structured outcome telemetry without reporter content.
- **Compatibility:** Public catalog, cart, quote, checkout, storefront, review aggregates, seller lifecycle, and shop onboarding continue using their existing authoritative predicates/states. T28 adds enforcement orchestration and regression coverage rather than a parallel visibility system.
- **Tracking:** Implements GitHub issue #29 (T28). Dependencies T21, T23, and T27 are complete. Automated ML moderation, legal escalation, appeals, general-purpose notification delivery, and automatic order cancellation/refund remain out of scope.
