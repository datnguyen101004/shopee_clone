## MODIFIED Requirements

### Requirement: Admins can search users and shops
The system SHALL allow an admin to list and read safe summaries of users and shops. User summaries MUST include id, display name, status, roles, created timestamp, and a redacted email projection sufficient to identify the account without exposing password or session material. Shop summaries MUST include id, slug, name, owner id, shop status, onboarding status, and updated timestamp, and SHALL additionally expose owner account status and effective public availability with safe reason codes to authorized administrators. Unknown identifiers SHALL use a non-enumerating not-found response. The admin interface MUST distinguish account status, shop status and onboarding state rather than display them as one switch.

#### Scenario: Admin searches shops by slug
- **WHEN** an admin lists shops with a matching keyword
- **THEN** matching owned shop summaries are returned without pickup/return address dumps

#### Scenario: Admin reads an unknown user
- **WHEN** an admin requests a user id that does not exist
- **THEN** the API returns the same not-found shape used for unauthorized cross-checks and discloses no extra fields

#### Scenario: Active shop is hidden by its owner status
- **WHEN** an admin views an approved active shop whose owner is suspended
- **THEN** the interface displays the active shop status and suspended owner status separately and explains why public availability is false

### Requirement: User status transitions are explicit and reasoned
An admin SHALL be able to suspend an active user and restore a suspended user. Both commands MUST require a trimmed reason of at least 8 and at most 240 characters. Suspend MUST set `UserStatus` to `SUSPENDED` and MUST revoke that user's unexpired auth sessions so subsequent refresh and access fail closed. Restore MUST set `UserStatus` to `ACTIVE` and MUST NOT recreate revoked sessions. The admin MUST NOT suspend their own account. The system MUST refuse to suspend or restore in a way that leaves zero active admins. User status commands MUST preserve owned shop operational/onboarding status and seller-role assignments. Suspension MUST make the owned shop and products unavailable publicly and in new purchases; restoration MUST NOT clear separate shop restrictions. The confirmation interface MUST explain these consequences.

#### Scenario: Admin suspends a buyer
- **WHEN** an admin submits a valid suspend command for an active buyer
- **THEN** the user becomes suspended, sessions are revoked, and a privileged-audit event is written

#### Scenario: Admin suspends self
- **WHEN** an admin targets their own user id for suspend
- **THEN** the command is rejected and no session or status change occurs

#### Scenario: Last active admin cannot be suspended
- **WHEN** the target is the only remaining active admin
- **THEN** the command returns a stable conflict and the admin assignment remains

#### Scenario: Admin suspends a shop owner
- **WHEN** an admin suspends an active seller account with a valid reason
- **THEN** owner sessions are revoked, shop and role statuses are preserved, and shop/product public access and new purchases are denied

#### Scenario: Admin restores owner of suspended shop
- **WHEN** an admin restores the account of a separately suspended shop's owner
- **THEN** only the account becomes active and the shop remains suspended and hidden

### Requirement: Shop status transitions reuse existing shop states
An admin SHALL be able to suspend an active shop and restore a suspended shop with a valid reason. Suspend MUST set `ShopStatus` to `SUSPENDED` so catalog, storefront, and checkout continue to treat the shop as unavailable to buyers. Restore MUST set `ShopStatus` to `ACTIVE` only when onboarding status is `APPROVED`. Existing `POST /api/v1/admin/shops/:shopId/approval` remains the only onboarding approve/reject path and MUST still require a reason. Inactive or rejected shops MUST NOT be restored to active selling without an approval command. Shop status commands, including moderation outcomes, MUST preserve the owner's account status, seller role and authentication sessions. Restoring a shop whose owner is suspended MUST leave that account suspended and the shop publicly unavailable. Shop confirmation messages MUST distinguish a successful stored status transition from effective availability.

#### Scenario: Admin suspends an approved shop
- **WHEN** an admin suspends an active approved shop with a valid reason
- **THEN** the shop status becomes suspended and buyer catalog/storefront hide its products while the owner keeps their existing account status, roles and sessions

#### Scenario: Admin restores a rejected shop
- **WHEN** an admin attempts restore on a shop that is not approved
- **THEN** the command is rejected and onboarding status is unchanged

#### Scenario: Admin restores shop with suspended owner
- **WHEN** an admin restores a suspended approved shop whose owner is suspended
- **THEN** shop status becomes active, owner status is unchanged, and the response/interface reports that owner restriction still prevents public availability

#### Scenario: Moderation suspends a shop
- **WHEN** an authorized moderation outcome suspends an approved shop
- **THEN** the same shop-only status and audit effects apply without owner-account suspension or session revocation
