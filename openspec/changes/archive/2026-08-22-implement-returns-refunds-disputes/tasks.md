## 1. Shared return and refund contracts

- [x] 1.1 Define framework-neutral return statuses, actor types, reason codes, buyer/seller/admin actions, deadline policy constants, evidence limits, and refund-ledger kinds.
- [x] 1.2 Define exact buyer request/evidence/action inputs plus buyer return list, detail, timeline, shipment, refund outcome, available-action, and Problem Details responses.
- [x] 1.3 Define exact seller queue/detail/action and admin queue/detail/decision contracts with separate projections for public reasons and internal notes.
- [x] 1.4 Implement strict parsers for canonical references, filters, filter-bound cursors, return ETags, UUID idempotency keys, normalized descriptions/reasons/notes, item quantities, and evidence IDs.
- [x] 1.5 Add invariant guards for state/action combinations, version-contiguous timelines, UTC deadlines, evidence authorization shape, integer money, per-line allocation, and aggregate totals.
- [x] 1.6 Extend buyer order detail contracts with server-declared return capability and existing return reference without breaking existing T20 consumers.
- [x] 1.7 Extend privileged target/action and audit-correlation contracts for return decisions without exposing internal notes or evidence metadata.
- [x] 1.8 Export the contracts without NestJS, Prisma, browser, or storage dependencies and add exhaustive valid/malformed/unknown-key contract tests.

## 2. Prisma persistence and additive migration

- [x] 2.1 Add return status/reason/actor/action/evidence/ledger enums and relations from users, shop orders, order lines, shops, and privileged audit in Prisma.
- [x] 2.2 Model `ReturnRequest`, immutable `ReturnRequestItem`, append-only `ReturnEvent`, staged `ReturnEvidenceAsset`, one `ReturnShipment`, immutable `ReturnDecision`, and one `RefundLedgerEntry`.
- [x] 2.3 Add uniqueness for one request and ledger per shop order, per-return line identity, event version, command idempotency, evidence ordering, mock tracking code, and decision correlation.
- [x] 2.4 Add check constraints for non-negative versions/money, positive bounded quantities, paired idempotency metadata, actor identity, evidence state/expiry shape, deadlines, normalized text, and VND currency.
- [x] 2.5 Add indexes for buyer, shop, admin, deadline-worker, evidence-cleanup, audit-correlation, and `(updatedAt DESC, id DESC)` queue access paths.
- [x] 2.6 Create the additive SQL migration, preserve existing order/purchase rows, add no synthetic returns, and keep every new foreign key restrictive where history must survive.
- [x] 2.7 Regenerate Prisma artifacts and add schema/migration tests for mappings, checks, unique constraints, indexes, restrictive relations, and clean migrate/seed behavior.

## 3. Return policy, calculations, and state machines

- [x] 3.1 Implement an injected UTC clock and versioned seven-day eligibility, 48-hour seller response, five-day shipment, and seven-day receipt policies with exact boundary tests.
- [x] 3.2 Implement the pure return transition matrix and actor/action authorization for buyer, seller, admin, and system transitions.
- [x] 3.3 Extend the order lifecycle with the controlled `RETURN_REQUESTED -> DELIVERED` reversal and test every allowed and forbidden order edge.
- [x] 3.4 Implement order-line selection validation for distinct owned lines and positive quantities no greater than committed purchases.
- [x] 3.5 Implement BigInt net-paid partial allocation with floor rounding, the exact full-quantity branch, safe-number projection, and no shipping refund.
- [x] 3.6 Implement canonical request digests, return ETag handling, stable action/conflict codes, available-action projection, and deterministic event reason codes.
- [x] 3.7 Add pure tests for every state/action pair, deadline boundary, invalid quantity, rounding case, total equation, snapshot source, and terminal behavior.

## 4. Repository, locking, and private projections

- [x] 4.1 Add buyer-owned, seller-shop-owned, and admin return list/detail queries with SQL-level scope filters and identical unknown/foreign not-found behavior.
- [x] 4.2 Implement filter-bound `(updatedAt DESC, id DESC)` cursors, bounded page sizes, `limit + 1` reads, state/deadline/date/reference filters, and stable next cursors.
- [x] 4.3 Implement the fixed lock order `ShopOrder -> ReturnRequest` and helpers for committed delivery lookup, command replay lookup, item/evidence locks, and deadline batches using `SKIP LOCKED`.
- [x] 4.4 Build distinct buyer, seller, and admin projectors from committed snapshots, including role-specific available actions and server-computed deadlines/amounts.
- [x] 4.5 Ensure buyer/seller projectors omit internal notes, audit summaries, storage keys, and unrelated personal data while admin projectors omit credentials and unnecessary profile data.
- [x] 4.6 Extend buyer/seller order projections with return capability/link and validate order/return timeline consistency without reading mutable catalog or address tables.
- [x] 4.7 Add repository/projector tests for scope isolation, pagination stability, filter/cursor binding, snapshot mutation, privacy boundaries, and corrupted persistence.

## 5. Atomic return command service and deadlines

- [x] 5.1 Implement idempotent buyer return creation with order lock, ownership/eligibility/version checks, quantity and evidence attachment, frozen allocation, initial event, and atomic `RETURN_REQUESTED` order transition.
- [x] 5.2 Implement buyer `CANCEL` and `SUBMIT_SHIPMENT` actions with return lock/version checks, replay-before-state validation, deadline enforcement, and one server-generated mock shipment.
- [x] 5.3 Implement seller `ACCEPT_RETURN`, `REJECT_AND_ESCALATE`, `ESCALATE`, and `CONFIRM_RECEIPT` with shop scope, public reasons, allowed-state checks, and canonical responses.
- [x] 5.4 Implement admin `APPROVE_RETURN`, `APPROVE_REFUND`, and `REJECT` with admin scope, state-dependent validation, immutable decision records, and separate public/internal notes.
- [x] 5.5 Implement exactly-once refund finalization that revalidates allocations and atomically writes return/order events, `RETURNED` when applicable, `REFUNDED`, and one `MOCK_CREDIT` ledger entry.
- [x] 5.6 Implement terminal cancellation/expiry/rejection with atomic `RETURN_REQUESTED -> DELIVERED` reversal and no purchase, voucher, shipping, fulfillment, review, or inventory mutation.
- [x] 5.7 Implement a bounded rerunnable deadline processor for seller-response escalation, buyer-shipment expiry, and receipt escalation using deterministic system idempotency keys.
- [x] 5.8 Add transaction and PostgreSQL race tests for response-loss replay, conflicting key reuse, stale versions, seller/system race, seller/admin race, duplicate receipt, rollback, event continuity, and unique refund ledger.

## 6. Private return evidence lifecycle

- [x] 6.1 Implement the replaceable return-evidence storage adapter with a dedicated root/prefix, opaque keys, safe reads, and recoverable removal.
- [x] 6.2 Implement authenticated multipart staging with magic-byte decode, JPEG/PNG/WebP allowlist, 5 MiB and dimension bounds, 24-hour expiry, and owner metadata.
- [x] 6.3 Attach one to five locked owner/unexpired staged assets atomically during return creation and make attachment ordering immutable.
- [x] 6.4 Implement the evidence read route with buyer, owning-shop seller, or current-admin authorization and safe response headers without exposing storage keys.
- [x] 6.5 Implement rerunnable orphan cleanup and tests for spoofed MIME, corrupt/decompression-heavy images, count/ownership/expiry races, traversal, unauthorized reads, and storage/database failure recovery.

## 7. Buyer return APIs and order integration

- [x] 7.1 Add the returns NestJS module, DTO/OpenAPI boundaries, exact Problem Details filter, AuthGuard/Origin guard wiring, private no-store headers, and dependency registration.
- [x] 7.2 Implement `POST /api/v1/account/return-evidence` and `POST /api/v1/account/orders/:orderReference/returns` with documented multipart/body/header contracts.
- [x] 7.3 Implement `GET /api/v1/account/returns` and `GET /api/v1/account/returns/:returnReference` with owner scope, filters, pagination, ETag, and canonical detail.
- [x] 7.4 Implement `POST /api/v1/account/returns/:returnReference/actions` for `CANCEL` and `SUBMIT_SHIPMENT` with ETag/idempotency validation.
- [x] 7.5 Extend `GET /api/v1/account/orders/:orderReference` and existing order list/timeline labels with server-declared return capability and reference.
- [x] 7.6 Add HTTP tests for buyer auth, origin, validation, eligibility boundary, partial quantity, evidence ownership, create replay/conflict, stale ETag, list/detail isolation, cancellation, shipment, and snapshot immutability.

## 8. Seller return APIs

- [x] 8.1 Implement `GET /api/v1/seller/returns` with shop resolution, queue filters, deadlines, search, and cursor pagination.
- [x] 8.2 Implement `GET /api/v1/seller/returns/:returnReference` with seller-safe evidence, committed order context, ETag, and available actions.
- [x] 8.3 Implement `POST /api/v1/seller/returns/:returnReference/actions` with seller role/origin guards, ETag, idempotency, and strict action input.
- [x] 8.4 Extend seller order detail/queue projections with return link and return/refund status labels without exposing buyer-only or admin-only fields.
- [x] 8.5 Add HTTP tests for non-seller denial, cross-shop isolation, filters, accept, reject/escalate, receipt, deadline conflicts, races, replay, and privacy.

## 9. Admin dispute API and privileged audit

- [x] 9.1 Extend Prisma/shared admin audit target, action, decision-correlation, safe summary, list-filter, and display mappings for return requests.
- [x] 9.2 Implement `GET /api/v1/admin/returns` with escalated/default filters, status/deadline/date/reference search, and bounded cursor pagination.
- [x] 9.3 Implement `GET /api/v1/admin/returns/:returnReference` with authorized evidence, immutable history, server amount, prior decisions, and admin-only internal notes.
- [x] 9.4 Implement `POST /api/v1/admin/returns/:returnReference/decisions` with admin/origin guards, confirmation inputs, ETag, idempotency, and state-dependent decisions.
- [x] 9.5 Append exactly one correlated privileged-audit record within each effective admin decision transaction and exclude evidence, descriptions, addresses, storage keys, and internal notes from audit/log summaries.
- [x] 9.6 Add HTTP/PostgreSQL tests for admin role denial, queue/search, decision validation, pre/post-shipment rules, stale and concurrent decisions, ledger/audit atomicity, replay, and note privacy.

## 10. Buyer return interface

- [x] 10.1 Add typed web API helpers for evidence staging, buyer return creation/list/detail/actions, ETags, Problem Details, and retry-stable idempotency keys.
- [x] 10.2 Add `Trả hàng/Hoàn tiền` account navigation, responsive `/account/returns` queue, filters, pagination, and explicit loading/empty/auth/error states.
- [x] 10.3 Add the buyer return form to eligible order detail with line/quantity selection, reason, 20-1,000 character description, one-to-five evidence previews/removal, and read-only amount preview.
- [x] 10.4 Add `/account/returns/[returnReference]` with lines, evidence, deadlines, mock shipment, refund outcome, timeline, and server-declared cancel/shipment actions.
- [x] 10.5 Preserve drafts through recoverable failures, prevent duplicate submits, reuse keys only for equivalent transport retry, and refresh canonical state on stale/deadline conflicts.
- [x] 10.6 Add component/page tests at mobile/tablet/desktop breakpoints for validation, upload removal, create, existing-return link, cancel, shipment, conflict refresh, and private data handling.

## 11. Seller Center and admin dispute interfaces

- [x] 11.1 Add typed seller/admin return API helpers with queue filters, detail ETags, idempotent actions/decisions, exact response guards, and safe error parsing.
- [x] 11.2 Add Seller Center `Trả hàng/Hoàn tiền` navigation, responsive queue/search/filter/deadline UI, stable pagination, and explicit operational states.
- [x] 11.3 Add seller return detail with committed lines, buyer description, private evidence viewer, amount, timeline, shipment, confirmations, and declared actions.
- [x] 11.4 Add admin `Trả hàng/Hoàn tiền` navigation and responsive dispute queue with status/deadline/date filters plus return/order-reference search.
- [x] 11.5 Add admin dispute detail with evidence, seller response, amount, timeline, prior decisions, confirmation, public reason, and optional internal note.
- [x] 11.6 Ensure buyer/seller/admin pages never place descriptions, evidence identifiers, internal notes, or decisions in URLs or persistent browser storage and never log their payloads.
- [x] 11.7 Add seller/admin component and page tests for role states, queue/filter/search, privacy, confirmations, declared actions, stale races, decisions, and canonical refresh.

## 12. Cross-cutting verification and operations

- [x] 12.1 Add clean-database and upgrade migration verification, seed compatibility, schema-format, and generated-client checks.
- [x] 12.2 Add end-to-end API fixtures for delivered orders and accepted, expired, escalated, rejected, returned, and refunded cases without bypassing lifecycle invariants.
- [x] 12.3 Add Playwright accepted-return coverage from buyer request through seller accept, buyer shipment, seller receipt, and buyer refund timeline at 360/768/1440 widths.
- [x] 12.4 Add Playwright dispute coverage from seller rejection/escalation through admin decision and buyer/seller authoritative result at 360/768/1440 widths.
- [x] 12.5 Run regression coverage for checkout, buyer order history/cancellation, seller fulfillment, verified reviews, inventory, moderation, admin audit, authentication, and cross-role isolation.
- [x] 12.6 Verify deadline and evidence-cleanup commands are bounded, rerunnable, observable, and documented for local/CI invocation without adding a scheduler dependency.
- [x] 12.7 Document policy durations, reason/action/state tables, API examples, mock refund semantics, evidence privacy/retention, no-auto-restock behavior, recovery, and later T32/T33 integration seams.
- [x] 12.8 Run scoped format, lint, typecheck, unit, PostgreSQL integration, production build, OpenSpec strict validation, and focused browser suites; record results in `verification.md`.
