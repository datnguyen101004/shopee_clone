## 1. Baseline and Migration Safety

- [x] 1.1 Inventory every write path for shop ownership, seller-role grant/revoke, `UserStatus`, and `ShopStatus` and record the callers covered by this change.
- [x] 1.2 Add a read-only invariant preflight that reports duplicate shop owners, seller accounts without exactly one approved non-deleted shop, and approved shop owners missing the seller role.
- [x] 1.3 Add automated tests proving the preflight accepts valid fixtures and blocks unsafe duplicate or orphaned seller data without mutating it.
- [x] 1.4 Add a reviewed migration backfill for approved shop owners missing `SELLER`, including migration-sourced role audit events.
- [x] 1.5 Add the Prisma migration that makes `Shop.ownerId` unique across all shop rows and changes the user relation to a singular optional shop.
- [x] 1.6 Regenerate the Prisma client and update compile-time relation consumers from plural ownership to the singular relation.
- [x] 1.7 Add migration verification for unique ownership, soft-deleted ownership, and concurrent conflicting inserts.

## 2. Seller Request, Identity, and Role Invariant

- [x] 2.1 Update seller workspace and ownership repositories to resolve the one shop deterministically without filtering away the ownership slot.
- [x] 2.2 Update seller registration to return a stable existing-shop conflict/workspace result for existing and concurrent duplicate submissions.
- [x] 2.3 Add unit and transaction tests for first registration, pending/rejected/approved existing shop, soft-deleted shop, and concurrent submissions.
- [x] 2.4 Treat the pending shop registration as the seller request, and make admin approval atomically approve and activate that submitted shop, grant `SELLER`, and write the approval and role audits without a second create-shop step.
- [x] 2.5 Restrict generic role administration so `SELLER` cannot be granted without one approved shop or revoked independently from its approved shop.
- [x] 2.6 Add stable Problem Details responses and OpenAPI descriptions for single-shop conflicts and invalid seller-role mutations.
- [x] 2.7 Add role-authorization tests proving pending/rejected applicants remain normal users, approval produces the seller-and-shop pair, and approved, inactive, suspended, or missing-shop states obey the invariant.
- [x] 2.8 Verify the seller request contract validates and persists the complete shop profile, treats logo/banner as optional, and preserves the submitted profile when approval activates the shop.

## 3. Coordinated Seller Lifecycle

- [x] 3.1 Implement the centralized seller-identity lifecycle component with stable account-then-shop locking and invariant validation.
- [x] 3.2 Implement coordinated suspension of an approved seller pair, including account and shop status changes, active-session revocation, and two privileged audit events in one transaction.
- [x] 3.3 Implement coordinated restoration of an approved seller pair while leaving revoked sessions revoked.
- [x] 3.4 Implement pair-aware idempotency so only a fully matching outcome is a no-op and a mismatched pair is reconciled with audits or rejected.
- [x] 3.5 Preserve the seller-owned `ACTIVE` to `INACTIVE` pause/resume path without account locking, session revocation, or seller-role changes.
- [x] 3.6 Add lifecycle unit tests for suspend, restore, repeat commands, mismatched states, invalid onboarding, last-admin protection, and rollback after each failed write stage.

## 4. Admin and Moderation Integration

- [x] 4.1 Route `POST /api/v1/admin/shops/:shopId/actions` suspend and restore through the coordinated lifecycle for approved seller shops.
- [x] 4.2 Route `POST /api/v1/admin/users/:userId/actions` through the coordinated lifecycle when the target is a seller, while preserving buyer-only behavior.
- [x] 4.3 Route every moderation command or decision that suspends/restores a shop through the same lifecycle component.
- [x] 4.4 Update admin and moderation error mapping for invalid pair state, unapproved restoration, self-action, and last-active-admin conflicts.
- [x] 4.5 Add integration tests for admin-shop, admin-user, and moderation entry paths, asserting identical paired effects, session revocation, audit coverage, and atomic rollback.
- [x] 4.6 Verify catalog, storefront, product detail, cart, and checkout continue to exclude suspended shops after coordinated suspension.

## 5. Authentication and Contracts

- [x] 5.1 Verify access-token and refresh-token paths reject suspended sellers immediately after coordinated suspension.
- [x] 5.2 Add the proven-identity suspended-account outcome for password and linked external sign-in without changing unknown-account or incorrect-secret responses.
- [x] 5.3 Update shared contracts for seller workspace conflicts, paired admin action semantics, and locked account-and-shop feedback.
- [x] 5.4 Update `/api/v1` OpenAPI descriptions for registration, approval, admin user/shop actions, and affected authentication outcomes.
- [x] 5.5 Add authentication tests for revoked existing sessions, correct suspended credentials, invalid credentials, external identity, and post-restore fresh login.

## 6. Seller and Admin UI

- [x] 6.1 Update seller entry navigation to wait for workspace resolution and show exactly one of submit request, pending, rejected/resubmit, open the automatically provisioned shop, or unavailable states. Ensure the request form collects all required shop-profile fields with clear validation, marks logo/banner as optional, and never shows a second create-shop step after approval.
- [x] 6.2 Remove or prevent all create-another-shop and shop-picker states and redirect legacy registration entry to the existing workspace.
- [x] 6.3 Preserve seller pause/resume copy that clearly states the account remains usable.
- [x] 6.4 Update admin shop action confirmation and success/error feedback to name the paired account lock/restore effect.
- [x] 6.5 Update admin seller-account action confirmation and success/error feedback to name the paired shop suspension/restore effect.
- [x] 6.6 Refetch linked account and shop summaries after a coordinated admin action so both detail and list views show the committed state.
- [x] 6.7 Add the locked account-and-shop login/session feedback without exposing internal moderation details.
- [x] 6.8 Add frontend tests for seller entry states, duplicate submission recovery, seller pause, coordinated admin confirmations, stale-state refresh, and accessible status feedback.

## 7. Chat Prerequisite Consistency

- [x] 7.1 Verify product detail, shop detail, and checkout contracts expose the unique owner account identifier required by the later chat entry-point change.
- [x] 7.2 Add contract tests proving one seller account resolves to one shop and one shop resolves to one owner account without an identity selector.
- [x] 7.3 Reconcile any remaining T31 planning language that assumes multiple shops per account before chat implementation begins.

## 8. End-to-End Verification and Documentation

- [x] 8.1 Add Playwright coverage for complete and incomplete seller-request forms, submitting one valid request, duplicate entry recovery, atomic approval-to-seller-and-shop access, preservation of the submitted shop profile, and direct navigation to the only shop without a second creation step.
- [x] 8.2 Add Playwright coverage for shop suspension causing owner logout and login denial, then coordinated restore requiring a fresh login.
- [x] 8.3 Add Playwright coverage for direct seller-account suspension producing the same shop-unavailable outcome.
- [x] 8.4 Run focused API, web, contract, migration, and Playwright suites and fix all regressions caused by the change.
- [x] 8.5 Run repository typecheck, lint, and build checks for affected workspaces.
- [x] 8.6 Update architecture/data-flow diagrams and operational documentation with the one-shop seller invariant, paired lifecycle, audits, and migration preflight.
- [x] 8.7 Run `openspec validate enforce-single-shop-seller-account --strict` and reconcile the implementation, specs, flow, and completed task checklist.
