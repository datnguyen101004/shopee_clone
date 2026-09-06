## 1. Scope and current-state inventory

- [ ] 1.1 Read proposal, all delta specs, design and Vietnamese UI/UX spec; inspect current working-tree changes and map affected modules without overwriting unrelated work.
- [ ] 1.2 Inventory lifecycle callers, seller operational guards, public eligibility consumers, SQL/projection/cache paths and current test scripts; record a coverage checklist for the API matrix in design.md.
- [ ] 1.3 Produce a read-only legacy status/role/ownership classification and identify old repair scripts/specs that assume coupled status; preserve ambiguous sanctions and current shop IDs.

## 2. Contracts and effective availability — critical authorization

- [ ] 2.1 Define safe private owner/shop availability fields and review-version input in shared contracts/DTOs, including explicit conflicting-state responses and contract validation tests.
- [ ] 2.2 Extend the shared backend shop filter and in-memory predicate to require active non-deleted owner data; update all required Prisma/SQL projections and fail closed when owner eligibility is missing.
- [ ] 2.3 Apply eligibility to catalog, direct product/shop routes, following, favorites and recently-viewed references; preserve historical snapshots and unavailable placeholders.
- [ ] 2.4 Apply authoritative batched filtering to homepage, search, recommendations and public campaign/banner hydration; refresh affected projections through current mechanisms.
- [ ] 2.5 Remove stale complete-response cache bypasses in affected API and Next route/data paths; verify post-suspension requests cannot expose cached public shop/product content.

## 3. Approval and lifecycle — critical transactions and state transitions

- [ ] 3.1 Preserve one-shop registration, pending correction and rejected resubmission; prevent ownership/status spoofing and retain duplicate/soft-deleted slot protections.
- [ ] 3.2 Serialize application edits and admin review using owner/shop locks, re-read locked state, enforce expectedUpdatedAt, and record the review version for exact retry detection.
- [ ] 3.3 Preserve atomic seller grant plus shop approval/activation and audits; reject locked applicants, stale/conflicting review and partial role/shop writes.
- [ ] 3.4 Separate shop suspension/restoration from owner status/session writes across admin and moderation callers; audit only actual target transitions and preserve no-op idempotency.
- [ ] 3.5 Separate account suspension/restoration from shop state writes; revoke sessions only for account suspension and retain self/last-admin protection and atomic audits.
- [ ] 3.6 Replace coupled identity validation/auth messages and obsolete fallback paths; preserve one approved shop per seller and prevent generic role commands from bypassing approval.

## 4. Operational access and purchase admission — critical cross-module behavior

- [ ] 4.1 Permit active suspended-shop owners to use buyer features and read their own workspace/moderation status; deny direct selling/profile/media/inventory/promotion mutations and self-restoration, preserving existing order/return restrictions.
- [ ] 4.2 Revalidate owner/shop eligibility for cart admission, cart display and pricing/checkout quotes without deleting historical references.
- [ ] 4.3 Serialize new purchase admission with owner/shop lifecycle changes using the documented stable lock order; reject stale quotes without partial orders/reservations and keep external calls outside locks.
- [ ] 4.4 Verify existing purchase/payment callback, order and return behavior remains unchanged for purchases created before suspension; introduce no automatic cancellation/refund.

## 5. Seller and admin interfaces

- [ ] 5.1 Update applicant registration/status views and authorization refresh after approval; preserve existing form, accessibility and responsive behavior without applying Figma redesigns.
- [ ] 5.2 Update seller navigation/shop gate to distinguish membership, restriction reads and operational permissions; display shop-only suspension without logging out an active owner.
- [ ] 5.3 Update admin shop/user summaries, approval review-version submission and confirmation text for separate account/shop states and combined availability reasons.
- [ ] 5.4 Update unavailable public/cart presentations and locked-account feedback; retain generic public messages, keyboard/focus behavior and existing data-testid attributes.

## 6. Focused verification and compatibility

- [ ] 6.1 Add/run scoped backend unit and API integration coverage for the account/shop state matrix, auth session behavior, admin/moderation parity and direct API denial.
- [ ] 6.2 Add/run real PostgreSQL integration checks for duplicate submission, review-vs-edit/suspension races, exact retry, audit/role rollback and purchase-vs-suspension serialization.
- [ ] 6.3 Add/run representative eligibility integration tests with stale search/cache candidates and all inventoried public/purchase consumers; verify no owner lookup N+1 regression in batched hydration.
- [ ] 6.4 Add/run frontend interaction and contract tests for application, approval, independent restriction feedback and unavailable cart states; run relevant lint/typecheck and fix regressions caused by this change.
- [ ] 6.5 Update existing browser scenarios for independent transitions without running them; record selected quick suite commands and E2E as deferred unless the user explicitly requests execution. Completion of this task records preparation/disposition, not an E2E pass.
- [ ] 6.6 Verify local rollout/rollback and legacy reconciliation safeguards; add an additive migration only if review-version storage requires it, and never bulk-reactivate ambiguous records or run destructive resets.

## 7. Documentation and handoff

- [ ] 7.1 Update OpenAPI and affected lifecycle documentation; document precedence over older coordinated lifecycle specs and the required reconciliation at later spec sync/archive without rewriting unrelated changes.
- [ ] 7.2 After implementation and actual verification, write design-consistent Vietnamese flow.md explaining user/admin actions, restoration branches and a concrete example; identify any unverified paths.
- [ ] 7.3 Report completed tasks, actual commands/results, pre-existing failures, deferred E2E and remaining limitations; leave incomplete implementation tasks unchecked.

## Execution policy

For this change, **quick E2E runs only when the user explicitly requests it**. Do not automatically run full E2E, browser journeys or snapshot updates as a substitute. This user instruction overrides generic E2E defaults in workflow skills. Unit/integration tests, lint and typecheck above remain part of implementation verification. When requested, run only the agreed quick suites, checking current package scripts first; record their actual outcome separately. Until then E2E is deferred, never passed, and does not block independent implementation work.
