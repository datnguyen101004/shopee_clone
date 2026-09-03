## MODIFIED Requirements

### Requirement: User status transitions are explicit and reasoned
An admin SHALL be able to suspend an active user and restore a suspended user. Both commands MUST require a trimmed reason of at least 8 and at most 240 characters. Suspend MUST set `UserStatus` to `SUSPENDED` and MUST revoke that user's unexpired auth sessions so subsequent refresh and access fail closed. When the target has the seller role and an approved shop, suspend MUST also set that shop to `SUSPENDED` in the same operation. Restore MUST set `UserStatus` to `ACTIVE`, MUST NOT recreate revoked sessions, and MUST also restore the seller's approved suspended shop in the same operation. The admin MUST NOT suspend their own account. The system MUST refuse to suspend or restore in a way that leaves zero active admins or creates mismatched seller-account and shop states.

#### Scenario: Admin suspends a buyer
- **WHEN** an admin submits a valid suspend command for an active buyer without an approved shop
- **THEN** the user becomes suspended, sessions are revoked, and a privileged-audit event is written

#### Scenario: Admin suspends a seller
- **WHEN** an admin submits a valid suspend command for an active seller with an approved shop
- **THEN** the user and shop become suspended, sessions are revoked, and both affected entities are audited

#### Scenario: Admin restores a seller
- **WHEN** an admin restores a suspended seller with an approved suspended shop
- **THEN** the user and shop become active together and revoked sessions remain revoked

#### Scenario: Admin suspends self
- **WHEN** an admin targets their own user id for suspend
- **THEN** the command is rejected and no session or status change occurs

#### Scenario: Last active admin cannot be suspended
- **WHEN** the target is the only remaining active admin
- **THEN** the command returns a stable conflict and the admin assignment remains

### Requirement: Shop status transitions reuse existing shop states
An admin SHALL be able to suspend an active approved shop and restore a suspended approved shop with a valid reason. Suspend MUST set `ShopStatus` and the owner account status to `SUSPENDED`, revoke the owner's active sessions, and make catalog, storefront, and checkout treat the shop as unavailable. Restore MUST set `ShopStatus` and owner account status to `ACTIVE` only when onboarding status is `APPROVED`, and MUST NOT recreate revoked sessions. Existing `POST /api/v1/admin/shops/:shopId/approval` remains the only onboarding approve/reject path and MUST still require a reason. Seller-controlled `INACTIVE` status MUST remain distinct from administrative suspension and MUST NOT lock the owner account. Inactive, pending, or rejected shops MUST NOT be restored to active selling without an approval command.

#### Scenario: Admin suspends an approved shop
- **WHEN** an admin suspends an active approved shop with a valid reason
- **THEN** the shop and owner account become suspended, owner sessions are revoked, and buyers cannot use the shop

#### Scenario: Seller pauses an approved shop
- **WHEN** a seller changes its own approved shop from active to inactive
- **THEN** selling stops but the owner account remains active

#### Scenario: Admin restores a rejected shop
- **WHEN** an admin attempts restore on a shop that is not approved
- **THEN** the command is rejected and account, shop, and onboarding statuses are unchanged

### Requirement: Status commands are idempotent for the same outcome
Repeating the same valid suspend or restore command for a target whose seller-account and shop pair is already fully in the requested outcome SHALL succeed without a second state change and SHALL NOT duplicate privileged-audit events for a no-op. A target pair with mismatched states MUST NOT be treated as an idempotent success; the system MUST either reconcile it through the coordinated command with audit coverage or fail without partial writes.

#### Scenario: Repeat suspend is idempotent
- **WHEN** an admin suspends a seller whose account and approved shop are already suspended
- **THEN** both remain suspended and no extra audit event is appended

#### Scenario: Existing pair is mismatched
- **WHEN** an admin repeats a command but only one member of the seller-account and shop pair has the requested status
- **THEN** the system does not report a no-op success while leaving the mismatch unresolved
