## Purpose

Let admins search users and shops and apply activate, suspend, and restore transitions with reasons while protecting the last admin and invalidating suspended sessions.

## ADDED Requirements

### Requirement: Admins can search users and shops
The system SHALL allow an admin to list and read safe summaries of users and shops. User summaries MUST include id, display name, status, roles, created timestamp, and a redacted email projection sufficient to identify the account without exposing password or session material. Shop summaries MUST include id, slug, name, owner id, shop status, onboarding status, and updated timestamp. Unknown identifiers SHALL use a non-enumerating not-found response.

#### Scenario: Admin searches shops by slug
- **WHEN** an admin lists shops with a matching keyword
- **THEN** matching owned shop summaries are returned without pickup/return address dumps

#### Scenario: Admin reads an unknown user
- **WHEN** an admin requests a user id that does not exist
- **THEN** the API returns the same not-found shape used for unauthorized cross-checks and discloses no extra fields

### Requirement: User status transitions are explicit and reasoned
An admin SHALL be able to suspend an active user and restore a suspended user. Both commands MUST require a trimmed reason of at least 8 and at most 240 characters. Suspend MUST set `UserStatus` to `SUSPENDED` and MUST revoke that user's unexpired auth sessions so subsequent refresh and access fail closed. Restore MUST set `UserStatus` to `ACTIVE` and MUST NOT recreate revoked sessions. The admin MUST NOT suspend their own account. The system MUST refuse to suspend or restore in a way that leaves zero active admins.

#### Scenario: Admin suspends a buyer
- **WHEN** an admin submits a valid suspend command for an active buyer
- **THEN** the user becomes suspended, sessions are revoked, and a privileged-audit event is written

#### Scenario: Admin suspends self
- **WHEN** an admin targets their own user id for suspend
- **THEN** the command is rejected and no session or status change occurs

#### Scenario: Last active admin cannot be suspended
- **WHEN** the target is the only remaining active admin
- **THEN** the command returns a stable conflict and the admin assignment remains

### Requirement: Shop status transitions reuse existing shop states
An admin SHALL be able to suspend an active shop and restore a suspended shop with a valid reason. Suspend MUST set `ShopStatus` to `SUSPENDED` so catalog, storefront, and checkout continue to treat the shop as unavailable to buyers. Restore MUST set `ShopStatus` to `ACTIVE` only when onboarding status is `APPROVED`. Existing `POST /api/v1/admin/shops/:shopId/approval` remains the only onboarding approve/reject path and MUST still require a reason. Inactive or rejected shops MUST NOT be restored to active selling without an approval command.

#### Scenario: Admin suspends an approved shop
- **WHEN** an admin suspends an active approved shop with a valid reason
- **THEN** the shop status becomes suspended and buyer catalog/storefront hide its products

#### Scenario: Admin restores a rejected shop
- **WHEN** an admin attempts restore on a shop that is not approved
- **THEN** the command is rejected and onboarding status is unchanged

### Requirement: Status commands are idempotent for the same outcome
Repeating the same valid suspend or restore command for a target already in the requested status SHALL succeed without a second state change and SHALL NOT duplicate a privileged-audit event for a no-op. Conflicting transitions MUST fail without partial writes.

#### Scenario: Repeat suspend is idempotent
- **WHEN** an admin suspends a user that is already suspended with a valid reason
- **THEN** the user remains suspended and no extra audit event is appended
