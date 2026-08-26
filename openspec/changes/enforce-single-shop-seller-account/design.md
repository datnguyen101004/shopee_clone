## Context

See `proposal.md` for motivation. The current model exposes a one-to-many `User.shops` relation and only indexes `Shop.ownerId`; seller registration performs an owner-row lock and a live-shop lookup, but the database still permits multiple owned rows and ignores a soft-deleted shop during that check. A submitted registration already carries the future shop profile. The intended product flow is that this pending record is the seller request and admin approval both grants `SELLER` and activates that shop, while generic role administration must not create either half independently.

Administrative user suspension already revokes sessions. Administrative and moderation shop suspension currently update only `Shop.status`, so the owner can remain active and authenticated. Authentication already validates active user status on authenticated-session lookup, which can be reused once status and session revocation are coordinated.

## Problem and Challenges

- A person can be represented by several shops even though the product expects one shop only.
- Seller approval and shop activation can drift apart, leaving someone with seller access but no valid shop or an approved shop whose owner lacks seller access.
- Disabling a shop does not currently stop its owner from continuing to use an already-open account session.
- Several administration and moderation paths can change related states independently, so fixing only one screen would leave bypasses.
- Existing records must be checked before enforcing the new rule; silently deleting or merging duplicate shops would risk losing business history.
- A temporary pause chosen by a seller must not be confused with a disciplinary suspension.

## Goals / Non-Goals

**Goals:**

- Make the single-shop rule structurally race-safe and consistent across registration, approval, roles, admin actions, moderation, authentication, and UI entry points.
- Preserve one account identity for buyer, seller, and future user-to-user chat behavior.
- Make suspension/restoration atomic and auditable across the seller account and approved shop.
- Provide a migration path that detects unsafe legacy data instead of choosing which shop to keep.

**Non-Goals:**

- Merging, transferring, or deleting duplicate legacy shops automatically.
- Introducing organization accounts, staff seats, multiple shop operators, or shop switching.
- Replacing the existing buyer role or preventing a seller account from using buyer features.
- Locking an account when the seller voluntarily makes an approved shop inactive.
- Implementing chat behavior in this change.
- Adding a feature flag for the invariant.

## Decisions

### 1. Enforce one lifetime shop row per owner

`Shop.ownerId` will become unique and the Prisma relation will change from `User.shops` to an optional singular relation. The uniqueness includes soft-deleted rows. Registration continues to serialize on the owner account for friendly conflict handling, while the database constraint remains the final defense against concurrent or alternative write paths.

This is preferred over a partial unique constraint on live rows because the user requirement is one shop per account, and silently allowing a second shop after soft deletion would split orders, products, audit history, and future chat identity across shops. A future explicit shop-recovery or ownership-transfer change can define different behavior if needed.

### 2. Treat the pending shop registration as the seller request

The user submits the required shop profile once. The form collects the shop slug, name, description, location, contact phone, contact email, pickup address, and return address; logo and banner are optional. The client provides clear field feedback, while the API remains authoritative for normalization, validation, and uniqueness checks. An invalid or incomplete profile is not stored as a pending request.

The resulting pending shop record is the seller request reviewed by admin; it does not grant seller access while pending or rejected. Admin review displays the persisted profile. Approval reuses that record and atomically changes it to an approved, active shop while granting `SELLER`; it does not rewrite the submitted profile or ask the user to enter it again. From the user's perspective the shop is provisioned automatically by approval, with no separate create-shop step afterward.

This is preferred over granting `SELLER` first and asking the user to create a shop later because that would introduce a valid seller-without-shop state and complicate seller entry, administration, and chat identity resolution. It also avoids introducing a second application store when the pending shop already contains the required profile.

### 3. Keep seller authorization and approved shop inseparable

The invariant is:

- pending or rejected shop: no seller role;
- approved, non-deleted shop in active, inactive, or suspended operational status: seller role exists;
- seller role without exactly one approved, non-deleted shop: invalid state.

Admin approval of the seller request remains the authoritative seller-role grant path and performs approval, shop activation, role grant, and audits in one transaction. Generic role APIs reject direct `SELLER` grant/revoke operations that would break the invariant; `ADMIN` management remains unchanged. The seller role is retained during suspension so restoration does not reconstruct authorization history.

This is preferred over computing seller authorization from a shop query on every request because the existing role guards and token/session contracts already use role assignments, and explicit assignments retain auditability.

### 4. Centralize paired seller lifecycle transitions

A backend seller-identity lifecycle component will own coordinated suspend and restore operations. Admin user actions, admin shop actions, and moderation shop commands will call this component inside their existing transaction boundary rather than updating `User` or `Shop` directly.

Suspending either member of an approved seller pair will:

1. lock the owner and shop rows in a stable order;
2. validate the seller/shop invariant and last-admin protection;
3. set both statuses to suspended;
4. revoke all non-revoked auth sessions for the owner;
5. append privileged audit events for both affected targets using the same actor, reason, and timestamp.

Restoration validates approved onboarding, activates both members, records both audits, and leaves revoked sessions revoked. Commands are idempotent only when both members already match the requested result.

Centralization is preferred over duplicating paired writes in each service because moderation is an independent mutation path and duplicated logic would drift.

### 5. Keep seller inactivity separate from disciplinary suspension

The existing seller profile update can continue to toggle an approved shop between `ACTIVE` and `INACTIVE`. It will never update `User.status`, revoke sessions, or remove `SELLER`. Administrative and moderation disabling uses `SUSPENDED` only.

This preserves the current operational pause capability and gives “disabled shop locks account” an unambiguous product meaning.

### 6. Preserve current REST paths and extend behavior

No new public endpoint is required. The implementation changes the semantics behind:

- `POST /api/v1/seller/shop`
- `GET /api/v1/seller/shop/workspace`
- `POST /api/v1/admin/shops/:shopId/approval`
- `POST /api/v1/admin/shops/:shopId/actions`
- `POST /api/v1/admin/users/:userId/actions`
- existing moderation decision/command endpoints that can suspend or restore a shop
- existing sign-in, refresh, and authenticated-session validation endpoints

Existing admin action responses remain source-target summaries for compatibility. After a coordinated mutation, admin pages refetch the linked account and shop using their existing identifiers to display the atomic result. Stable Problem Details codes will distinguish duplicate shop ownership, invalid seller-role mutation, invalid paired state, and unsupported restoration.

### 7. Reject suspended login without account enumeration

Access and refresh continue to fail because authenticated session lookup requires an active user and suspension revokes sessions. Password login may return the account-and-shop-disabled experience only after the submitted secret has been verified against the located account. External sign-in may do so only after the provider identity is verified and linked. Unknown identities and incorrect secrets retain the generic authentication failure.

### 8. Update UI from one authoritative workspace state

Seller entry UI uses the existing workspace response to choose among submit a seller request, view a pending request, resubmit a rejected request, and open the automatically provisioned approved shop. The request form contains every required shop-profile field, marks logo and banner as optional, and may prefill address data from the account while still requiring user confirmation. It does not present a second create-shop step after approval or render registration controls until the workspace query has resolved. Admin review displays the stored shop profile, and approval copy explicitly states that approval grants `SELLER` and activates that shop. Other admin confirmations name both account and shop effects, then refetch both records after success.

The chat UI/UX specification is updated only to consume the prerequisite: a shop has one owner account and a seller account represents one shop. Chat implementation remains a later change.

## Risks / Trade-offs

- **[Legacy duplicate owners block the unique constraint]** → Add a read-only preflight report and stop migration with owner/shop identifiers; require an explicit reviewed reconciliation before retrying.
- **[Seller roles created manually may be invalid]** → Report seller-without-approved-shop records and refuse automatic permission removal; backfill only the safe inverse case of an approved shop missing its seller role with migration audit events.
- **[A missed moderation write path can bypass account locking]** → Inventory every write of `ShopStatus.SUSPENDED`/`ACTIVE`, route it through the lifecycle component, and add integration tests for admin and moderation entry paths.
- **[Concurrent account and shop actions can deadlock]** → Use one stable row-lock order and keep all paired transitions inside a single short transaction.
- **[Restoring both entities may be broader than a moderator intended]** → UI and API contracts make the paired effect explicit; approved seller pairs cannot be restored independently.
- **[Unique ownership prevents creating a fresh shop after soft deletion]** → Direct users to recovery/support; shop replacement requires a separately designed transfer or purge workflow.
- **[Suspension feedback could reveal account existence]** → Show the specific locked message only after successful identity proof.

## Migration Plan

1. Add a read-only preflight that reports duplicate `ownerId` rows, approved shop owners missing `SELLER`, and `SELLER` accounts without exactly one approved non-deleted shop.
2. Stop if duplicates or seller-without-approved-shop records exist; do not merge shops or revoke permissions automatically.
3. Backfill the safe approved-shop-missing-role cases and append migration-sourced role audit events.
4. Re-run the preflight and require zero invariant violations.
5. Apply the unique owner constraint and singular generated relation.
6. Deploy the atomic seller-request approval, lifecycle coordination, role mutation restrictions, contract/UI changes, and all discovered moderation adapters together with the migration.
7. Run post-migration invariant queries and the seller/admin/auth critical journeys.

Rollback removes the application dependency on the singular relation before dropping the uniqueness constraint. It does not automatically undo coordinated suspensions or restore revoked sessions; privileged audit records provide the source for an explicit reviewed correction if rollback occurs after lifecycle commands have run.
