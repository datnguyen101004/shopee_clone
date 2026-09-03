## 1. Shared contracts and validation

- [x] 1.1 Define report target/reason/status enums, strict create input, receipt, reporter list/detail, cursor query, and Problem Details contracts in `packages/contracts`.
- [x] 1.2 Define moderation case summary/detail, report evidence, assignment, note, decision/reversal, case event, review action, and optimistic-conflict contracts with exact public/private fields.
- [x] 1.3 Define seller moderation notice list/read contracts and extend admin privileged target/action and audit-correlation contracts without breaking existing T27 consumers.
- [x] 1.4 Export the new contract surface and add exact-key validators for canonical UUID/date/cursor/idempotency fields, bounded reason/details/notes, HTTPS evidence references, and allowlisted filters.
- [x] 1.5 Add contract tests for valid populated/empty responses, malformed and repeated queries, unknown fields, unsafe evidence schemes, over-limit inputs, stale conflicts, 429 retry metadata, and reporter/seller privacy omissions.

## 2. Persistence and migration

- [x] 2.1 Extend Prisma enums and relations for report targets/reasons, case states/outcomes/events, moderation commands, seller notice actions, and privileged audit `REVIEW`/`MODERATION_CASE` plus `HIDE`/`NO_ACTION` values.
- [x] 2.2 Add `UserReport`, ordered `ReportEvidenceReference`, `ModerationCase`, append-only `ModerationCaseEvent`, immutable `ModerationDecision`, `ModerationCommand`, `ReportRateLimitEvent`, and `SellerModerationNotice` models with bounded fields and UTC timestamps.
- [x] 2.3 Write an additive migration with exactly-one-target checks, restrictive target/history foreign keys, actor/idempotency uniqueness, decision/review audit correlations, and named partial unique indexes for one unresolved reporter-target report and one active target case.
- [x] 2.4 Add stable queue, report-history, rate-window, decision-history, command-replay, audit-filter, and seller-notice pagination indexes and verify query plans use bounded indexed access.
- [x] 2.5 Regenerate Prisma, update seed/test factories with product/shop cases and hidden/visible reviews, and verify migration deploys twice against empty and populated PostgreSQL without changing existing product, shop, review, order, or audit rows.
- [x] 2.6 Add a bounded `reporting:rate-limit:cleanup` command that deletes only rate-limit events older than 48 hours, is safe under concurrent runners/retries, and documents its schedule and retention boundary.

## 3. Buyer reporting backend

- [x] 3.1 Add reporting DTOs, exception mapping, OpenAPI schemas, authenticated buyer guard, trusted-origin mutation protection, and private no-store headers for `POST /api/v1/reports`.
- [x] 3.2 Implement canonical request normalization/digest and reporter-scoped UUID idempotency so exact retries replay the receipt and mismatched reuse returns a stable 409 before consuming rate quota.
- [x] 3.3 Implement product/shop target resolution with the existing public predicates, owner-report rejection, sanitized not-found behavior, and immutable bounded target snapshots.
- [x] 3.4 Implement reporter advisory locking, rolling 20-attempt/hour and 10-accepted/24-hour checks, bounded `Retry-After`, attempt recording, and no evidence/reason content in logs.
- [x] 3.5 Implement concurrent-safe unresolved-report deduplication and active-case create/attach so accepted reports update report count, reason summary, last activity, and case events atomically.
- [x] 3.6 Add `GET /api/v1/account/reports` and `GET /api/v1/account/reports/:reportId` with owner-only stable cursor pagination, coarse submitted/reviewed mapping, exact safe projection, and cross-owner non-enumerating 404 behavior.
- [x] 3.7 Add reporting service/controller tests for auth/role, target eligibility, owner rejection, validation, exact/mismatched idempotency, duplicate receipts, rolling limits, `Retry-After`, concurrent first reports, post-resolution reports, and zero partial writes.
- [x] 3.8 Add PostgreSQL E2E tests proving unresolved-report and active-case partial uniqueness, multi-instance-equivalent rolling limits, reporter history isolation, private no-store headers, and evidence/notes/audit fields never enter reporter responses.

## 4. Admin moderation workflow backend

- [x] 4.1 Add admin moderation controllers/DTOs/Problem Details/OpenAPI for cursor queue, case detail, assignment, notes, and decisions under `/api/v1/admin/moderation/cases` with current admin authorization and private no-store caching.
- [x] 4.2 Implement stable newest-activity queue queries and bounded filters for status, target type, exact target ID, reason, and assignment, selecting only summary fields without N+1 reporter or target reads.
- [x] 4.3 Implement case detail projection for current target state, opaque reporter ids, evidence, assignment, append-only events/notes, decisions, versions, and strict omission of contact/order/session data.
- [x] 4.4 Implement actor-scoped moderation command idempotency plus case row locks and optimistic versions for assign/unassign and append-note operations, including active-admin assignee validation and current-state 409 responses.
- [x] 4.5 Refactor existing T27 product/shop actions into transaction-bound enforcement commands shared by direct routes and case decisions while preserving direct endpoint request/response compatibility and one audit writer.
- [x] 4.6 Implement atomic `NO_ACTION`, `SUSPEND_TARGET`, and `RESTORE_TARGET` decisions, case/report resolution, version/event history, current-policy restore guards, seller notice creation, decision correlation, and exactly one privileged audit.
- [x] 4.7 Implement reversal against the latest effective decision with consistent case-before-target locking, expected version checks, immutable prior history, no-op target handling, and no duplicate target audit or seller notice.
- [x] 4.8 Extend privileged audit filters/projections for moderation case and review targets/actions and guarantee summaries/correlations never contain reporter identity, evidence, private notes, or seller notice content.
- [x] 4.9 Add service and PostgreSQL E2E tests for role denial, queue filters/cursors, projection privacy, assignment as non-exclusive coordination, stale writers, idempotent replay/mismatch, concurrent decisions, atomic rollback, no-action, no-state-change, invalid restore, and reversal history.

## 5. Review moderation and aggregate consistency

- [x] 5.1 Add admin `GET /api/v1/admin/reviews/:reviewId` and `POST /api/v1/admin/reviews/:reviewId/actions` contracts/controllers with strict `HIDE|RESTORE`, reason, expected version, idempotency, role, origin, OpenAPI, and no-store behavior.
- [x] 5.2 Extract/reuse the T21 visible-review aggregate refresh inside the review action transaction and lock/update review visibility/version, `ReviewModerationEvent`, product/shop aggregates, and privileged audit atomically.
- [x] 5.3 Add unit and PostgreSQL E2E tests for hide/restore, author-safe hidden reads, public exclusion, exact aggregate changes, stale version, idempotent replay/mismatch, unauthorized access, missing review, and rollback without partial aggregate/audit history.

## 6. Seller moderation notices backend

- [x] 6.1 Implement effective-change notice creation for both case-driven and existing direct product/shop actions with owner-at-decision capture, target snapshot, unique correlation, safe public reason, and no backfill.
- [x] 6.2 Add `GET /api/v1/seller/moderation-notices` with owner-only newest-first cursor pagination, unread filtering, deleted/unowned target unlinking, and private no-store responses.
- [x] 6.3 Add trusted-origin `POST /api/v1/seller/moderation-notices/:noticeId/read` with first-read timestamp, idempotent replay, and cross-owner non-enumerating 404 behavior.
- [x] 6.4 Add notice tests for suspend/restore/direct actions, decision retry uniqueness, no notice for no-action/failure/no-state-change, ownership changes, read/unread pagination, safe target links, and exact omission of reporter/case/admin/audit/private fields.

## 7. Visibility and commerce enforcement regression

- [x] 7.1 Audit catalog, search, homepage, product detail, shop storefront, favorites/recent views, and shop-follow projections to ensure they all reuse product moderation and shop operational eligibility without leaking the private reason.
- [x] 7.2 Audit cart add/update/read, pricing quote, voucher/campaign eligibility, inventory reservation, and checkout assembly to ensure suspended products and shops cannot enter or complete a new purchase.
- [x] 7.3 Add regression tests for product and shop suspension across every public/read/purchase entry point, existing-cart revalidation, zero order creation, immutable order/review retention, and restore remaining gated by seller lifecycle/onboarding/category/variant/stock predicates.

## 8. Frontend workflows

- [x] 8.1 Add strict authenticated API clients for reports/history, moderation cases/commands, review actions, and seller notices with Problem Details, retry-after, idempotency, and stale-version parsing.
- [x] 8.2 Add accessible product-detail and public-shop report dialogs with allowlisted reasons, bounded evidence fields, in-memory drafts, sign-in continuation, duplicate/pending protection, receipt feedback, and no evidence in URLs or browser storage.
- [x] 8.3 Add `/account/reports` with owner-safe pagination and explicit loading, empty, reviewed, forbidden, validation, rate-limited, and recoverable failure states.
- [x] 8.4 Add `/admin/moderation` navigation, responsive queue filters/pagination including exact target-ID search, summary target identifiers, and case detail rendering for target state, reports, inert evidence links, events, and decisions.
- [x] 8.5 Add admin decision/reversal forms with separate public/private fields, expected versions, confirmation/focus restoration, stale-conflict draft retention and refresh, and disabled duplicate submission.
- [x] 8.6 Add the bounded admin review lookup plus hide/restore confirmation and authoritative aggregate/visibility refresh.
- [x] 8.7 Add `/seller/moderation` navigation, unread filtering/count presentation, safe target links, suspend/restore reason display, and idempotent acknowledgement.
- [x] 8.8 Add Testing Library coverage for all new clients/components/pages, exact privacy projections, guest/auth/role states, validation, 429 timing guidance, conflicts, confirmations, focus/live regions, responsive overflow, and retry behavior.

## 9. Documentation and full verification

- [x] 9.1 Document reason codes, report limits, idempotency, queue states, assignment semantics, decision/reversal policy, review takedown, seller-safe notices, privacy/logging rules, cleanup scheduling, and all endpoint examples/status codes in a T28 moderation guide.
- [x] 9.2 Update `docs/admin-console.md`, seller/product/review docs, API Swagger, and role matrix with the new routes while documenting that ML/legal escalation, appeals, general notifications, and order cancellation/refund remain out of scope.
- [x] 9.3 Reconcile the planned diagrams in `openspec/changes/add-product-shop-moderation-reporting/flow.md` with the completed implementation, mark them as implemented flows, and update report dedupe/rate-limit/case aggregation, decision/reversal transaction, review aggregate refresh, seller-safe notification, and suspended-target commerce branches.
- [x] 9.4 Add Playwright coverage for buyer product/shop report → admin queue/assignment/decision → public disappearance/checkout rejection → seller notice, plus review hide/restore, at mobile/tablet/desktop reference widths.
- [x] 9.5 Run automated accessibility checks on report dialogs/history, moderation queue/detail/confirmation, review controls, and seller notices and require no serious or critical violations.
