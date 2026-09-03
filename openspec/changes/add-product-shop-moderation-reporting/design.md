## Context

See `proposal.md` for motivation and the six delta specs for observable behavior. T27 already provides authenticated admin routes, `ProductModerationStatus.ACTIVE/SUSPENDED`, `ShopStatus.ACTIVE/SUSPENDED`, direct product/shop actions, trusted-origin mutation protection, and transactional `PrivilegedAuditEvent` writes. T21 already provides `ProductReview.visibility/version`, append-only `ReviewModerationEvent`, owner-safe hidden-review reads, and visible-only product/shop rating aggregates. Public discovery, cart, quote, and checkout already filter product moderation and shop operational state, but T28 must verify every entry path instead of adding another visibility flag.

The application remains a TypeScript modular monolith: Next.js App Router and React in `apps/web`, NestJS REST modules in `apps/api`, PostgreSQL through Prisma, and framework-neutral contracts in `packages/contracts`. Bearer credentials remain memory-only in the browser. Private report, moderation, audit, and seller-notice responses use `Cache-Control: private, no-store`; all browser mutations remain subject to authentication, role checks, strict DTO validation, and the global trusted-origin guard.

## Goals / Non-Goals

**Goals:**

- Make report acceptance, active-case grouping, assignment, decisions, target enforcement, seller notices, and audit deterministic under retries and concurrent requests.
- Reuse the existing product/shop lifecycle and review visibility states as the single enforcement source of truth.
- Separate reporter-safe, seller-safe, and admin-private projections so sensitive evidence cannot cross an API boundary accidentally.
- Preserve existing direct admin product/shop controls while giving report-driven decisions richer case correlation.
- Define bounded queue/read patterns, cleanup behavior, and end-to-end verification for trust-sensitive paths.

**Non-Goals:**

- Automated classification, ML scoring, legal takedown/SLA workflows, appeals, or reporter-seller messaging.
- Anonymous reports, review reports, bulk moderation, automatic penalties on seller accounts, or automatic cancellation/refund of existing orders.
- General notification preferences, email, push, WebSocket delivery, or an application-wide event bus; those remain T30 concerns.
- Uploading or proxying report files. T28 accepts bounded text and optional HTTPS references but never fetches or embeds their remote content.

## Decisions

### 1. Add a dedicated trust-and-safety module with three projection boundaries

Add a NestJS `reporting` module for buyer submission/history and a `moderation` module for admin case operations plus seller notice reads. Both use repositories over the same Prisma transaction boundary. Shared contracts define distinct types for:

- reporter receipts/history: target snapshot, reason, submitted/reviewed state only;
- admin queue/detail: reports, opaque reporter ids, raw evidence, assignment, private notes, decisions, and current target state;
- seller notices: affected target snapshot, effective action, public reason, and read state only.

No generic entity serializer is shared across these responses. Explicit projectors and exact-key contract validators make privacy review testable. Reusing the T27 admin DTO for all audiences was rejected because its product/shop fields do not encode report evidence sensitivity and would make accidental over-fetching likely.

### 2. Use normalized report/case persistence with database-enforced active uniqueness

Add these core records:

- `UserReport`: reporter, case, exactly one nullable product/shop foreign key, reason, bounded details, target snapshot, idempotency key/digest, `resolvedAt`, and UTC timestamps.
- `ReportEvidenceReference`: immutable ordered HTTPS strings belonging to one report.
- `ModerationCase`: exactly one nullable product/shop foreign key, target snapshot, `OPEN|IN_REVIEW|RESOLVED`, nullable assignee, current outcome, report count/times, version, and resolution time.
- `ModerationCaseEvent`: append-only report-attached, assignment, unassignment, note, decision, and reversal history with actor/time/version; private note text is stored only on private event/decision rows.
- `ModerationDecision`: immutable outcome, public reason, optional private note, previous/next target state summaries, optional reversed-decision link, actor, and UTC time.
- `ModerationCommand`: actor-scoped idempotency key, normalized request digest, resource/action, and replayable response for assignment, note, decision, and review commands.
- `SellerModerationNotice`: owner-at-decision, target snapshot, action/reason, unique decision/audit correlation, effective time, and nullable read time.

Raw SQL in the additive Prisma migration adds exactly-one-target checks and partial unique indexes for one unresolved report per `(reporter, target)` and one non-terminal case per target. Product/shop foreign keys use `ON DELETE RESTRICT`; existing cleanup logic therefore retains a tombstone while trust-and-safety history references it. Storing a polymorphic `targetId` without foreign keys was rejected because it permits orphan cases and makes deletion races unsafe. Creating one case per report was rejected because it fragments evidence and makes inconsistent decisions likely.

### 3. Enforce rolling anti-spam limits with short-lived database events

Add `ReportRateLimitEvent(reporterUserId, attemptedAt, accepted)` with an index on `(reporterUserId, attemptedAt DESC)`. The create-report transaction first resolves an idempotent replay, then takes a PostgreSQL transaction advisory lock derived from the reporter id, counts events within the last hour and accepted events within the last 24 hours, and either records a rejected attempt or continues. It then locks the reporter/target key, checks unresolved-report duplication, resolves/creates the active target case, inserts the report and evidence, and records an accepted attempt.

Limits are 20 attempts/hour and 10 accepted reports/24 hours. A scheduled command deletes rate-limit events older than 48 hours in bounded batches; report and decision history is not deleted. In-memory throttling was rejected because limits would vary by process and reset on deployment. Fixed calendar buckets were rejected because they permit boundary bursts and do not satisfy the rolling-window contract. The idempotency lookup happens before rate accounting so network retries do not consume quota.

### 4. Lock cases and targets; use optimistic versions at the HTTP boundary

Case mutations accept `expectedVersion` and a UUID `Idempotency-Key`. Inside one database transaction they lock the idempotency row/key, the case row, and then the target row in a consistent case-before-target order. A stale expected version returns 409 with the current safe case summary. Assignment is advisory coordination only: any currently authorized admin may decide, but the UI warns when another admin is assigned.

Report creation takes reporter then target advisory locks and never takes a case decision lock, avoiding the reverse ordering. Target decisions update case version exactly once and close the active case. A reversal is another immutable decision on the resolved case, references the latest effective enforcement decision, locks the same rows, checks current target eligibility, and leaves the case resolved with a new current outcome. A new buyer report after resolution opens a new case.

Database isolation alone without explicit row/advisory locks was rejected because partial-index conflicts would be recoverable but would complicate deterministic report receipts and aggregate counts. Assignment as an exclusive lease was rejected because the issue asks only for a placeholder and abandoned leases would block urgent work.

### 5. Extract one transaction-bound enforcement service and retain direct routes

Refactor T27 product/shop action logic into internal transaction-aware commands that validate policy and return `{changed, before, after, ownerUserId, targetSnapshot}` without independently committing. The existing direct routes call those commands and, on effective change, write their normal privileged audit plus the new seller notice. Case decisions call the same commands but own the surrounding decision/case/event/audit/notice transaction. This keeps a single writer for each audit event and prevents the case path from double-auditing reused T27 code.

Product suspension changes only `Product.moderationStatus`; shop suspension changes only `Shop.status`. Restore checks non-deleted product state or `Shop.onboardingStatus=APPROVED` and never changes seller lifecycle/onboarding. Existing direct-action response shapes and paths stay compatible. A case action against an already-matching target closes as a recorded no-state-change case outcome with a case-targeted decision audit; it does not fabricate a target transition, privileged target audit, or seller notice.

The apply phase audits every catalog/cart/pricing/checkout repository against the existing sellable predicate and adds regression tests for suspended product and suspended shop. Existing cart rows remain durable, but quote and checkout return the established unavailable-line error and do not create an order. Eagerly deleting carts or canceling orders was rejected because it destroys buyer state and overlaps T29.

### 6. Reuse T21 review visibility and aggregate refresh atomically

Add admin review detail/action endpoints over the current `ProductReview` row. `HIDE|RESTORE` commands require expected review version, idempotency key, and reason, then lock the review, update visibility/version, append `ReviewModerationEvent`, recompute product and shop aggregates using the existing visible-only aggregate service, and append one privileged audit event in a transaction. Add `REVIEW` and `MODERATION_CASE` privileged target types and `HIDE` and `NO_ACTION` actions; add nullable correlation to a moderation decision or review-moderation event.

Review takedown is intentionally not a buyer-report target in T28. It completes the moderation seam prepared by T21 and deferred by T27 without expanding the public reporting contract. Recomputing aggregates asynchronously was rejected because public rating and visibility could disagree after the admin receives success.

### 7. Use a narrow durable seller inbox, not the future notification framework

An effective product/shop state change creates one `SellerModerationNotice` for the shop owner captured at decision time. Existing direct admin actions do the same after T28 deploys; no historical notices are backfilled. Reads are owner-scoped, newest-first keyset paginated, and optionally unread-only. Mark-read sets the first `readAt` and is naturally idempotent.

The notice does not store or expose case id, reporter data, evidence, private note, or admin identity. It retains a bounded target label if ownership/deletion later makes navigation unsafe. T30 can later consume these durable records or add delivery fan-out without changing T28 decisions. Introducing a generic `Notification` table now was rejected because delivery channels, preferences, templates, and retry policy are not defined yet.

### 8. Define explicit REST endpoints and error semantics

All paths are below `/api/v1` and use strict OpenAPI DTOs and Problem Details:

| Method and path | Audience | Contract summary |
| --- | --- | --- |
| `POST /reports` | Authenticated buyer | `Idempotency-Key`; target type/id, reason code, details, up to three evidence URLs; returns `201` for a new report or `200` for an idempotent/active duplicate receipt |
| `GET /account/reports` | Reporter | Bounded cursor list with optional target-type/status filters |
| `GET /account/reports/:reportId` | Reporter | Owner-only safe receipt/detail |
| `GET /admin/moderation/cases` | Admin | Cursor queue filtered by status, target type, exact target ID, reason, and assignment |
| `GET /admin/moderation/cases/:caseId` | Admin | Private case detail with reports/events/decisions |
| `POST /admin/moderation/cases/:caseId/assignment` | Admin | `Idempotency-Key`; assignee admin id or null plus expected version |
| `POST /admin/moderation/cases/:caseId/notes` | Admin | `Idempotency-Key`; bounded private note plus expected version |
| `POST /admin/moderation/cases/:caseId/decisions` | Admin | `Idempotency-Key`; outcome, public reason, optional private note/reversal id, expected version |
| `GET /admin/reviews/:reviewId` | Admin | Bounded review lookup with current visibility/version |
| `POST /admin/reviews/:reviewId/actions` | Admin | `Idempotency-Key`; `HIDE|RESTORE`, reason, expected version |
| `GET /seller/moderation-notices` | Seller | Owner-only cursor list, optional unread filter |
| `POST /seller/moderation-notices/:noticeId/read` | Seller | Trusted-origin idempotent acknowledgement |

Invalid bodies/queries return 400; missing authentication 401; wrong role 403; owner-scoped unknown/cross-owner reads use the same 404; stale version or idempotency mismatch returns a typed 409; exhausted report quota returns 429 with `Retry-After`. Mutations use `Cache-Control: private, no-store`; report/admin/seller reads do likewise. Logs record only opaque actor/target ids, action, coarse outcome, latency, and rate-limit result—never evidence, notes, public reasons, emails, or evidence URLs.

### 9. Build focused UI surfaces inside existing shells

Product detail and public shop storefront gain a signed-in report dialog; guests are sent through the existing login path and resume without persisting evidence in storage. `/account/reports` lists the reporter-safe history. `/admin/moderation` hosts the queue/detail responsive workspace, with a private note only in the decision form and a separate bounded review lookup panel. `/seller/moderation` lists safe notices and unread state in Seller Center.

All forms keep draft text only in React memory, separate public reason from private note, disable duplicate submits, and use accessible confirmation for target-changing actions. Evidence URLs render as inert escaped text with an explicit external-open control using safe link attributes; they are never embedded. Stale conflicts retain draft input, refresh authoritative versions, and require reconfirmation. Testing Library covers state/focus/privacy; Playwright covers buyer report → admin decision → public enforcement → seller notice across mobile, tablet, and desktop reference widths with axe checks.

## Risks / Trade-offs

- **[Buyer accounts can coordinate report spam below per-user limits]** → Require authentication, one unresolved report per reporter/target, aggregate into one target case, expose opaque reporter ids to admins, and leave device/IP reputation or ML scoring to later abuse work.
- **[Remote evidence URLs can contain secrets or hostile content]** → Bound to HTTPS strings, never fetch/embed them, omit them from logs and seller/reporter projections, and require an explicit safe external-open action for admins.
- **[Partial unique indexes are not fully represented by Prisma schema]** → Add named SQL constraints/indexes in the migration and verify them with PostgreSQL concurrency tests and schema-integrity assertions.
- **[A shop suspension affects many products immediately]** → Reuse the existing shop predicate, show a target-impact confirmation, keep immutable orders untouched, and test catalog/cart/quote/checkout consistency.
- **[Direct admin actions have no report case]** → Preserve them for manual operations, correlate their audit and notice directly to the target, and never fabricate evidence or a synthetic reporter.
- **[Seller-safe reasons can accidentally contain reporter details]** → Treat the public reason as a separate bounded field, label it clearly in UI, exclude private note/evidence by construction, and add exact-key privacy tests.
- **[Rolling attempt events add write volume]** → Keep rows minimal, index the short windows, delete older-than-48-hour rows in bounded batches, and retain durable reports independently.
- **[Enum expansion makes destructive rollback difficult]** → Use additive values and nullable correlations; rollback application code while leaving compatible database additions in place.

## Migration Plan

1. Add enums, normalized tables, foreign keys, check constraints, partial unique indexes, queue/rate-limit/notice indexes, and nullable privileged-audit correlations. Regenerate Prisma and verify the migration on empty and populated databases.
2. Deploy reporting/moderation repositories and services, transaction-bound product/shop enforcement, review action support, rate-limit cleanup command, OpenAPI, and contracts. Keep new UI links disabled until API readiness succeeds.
3. Audit and test every public/read/purchase predicate, then enable buyer report, admin moderation, review action, reporter history, and seller notice UI routes.
4. Do not backfill reports, cases, or historical seller notices. Existing product/shop/review states and audit rows remain authoritative and readable.
5. For application rollback, disable the new routes/UI and stop the cleanup schedule while retaining additive tables and enum values. Do not delete audit/case history or automatically restore moderated targets; operators reverse effective decisions through the audited route before rollback when policy requires it.
