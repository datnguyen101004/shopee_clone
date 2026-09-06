## Purpose

Define approval-gated seller access to one owned shop while keeping account access, shop operations and application review as separate lifecycle concerns.

## ADDED Requirements

### Requirement: An active user submits one owned shop application
The system SHALL let an active authenticated buyer submit a complete shop application without the seller role. Ownership MUST derive from the authenticated account. Submission MUST retain required profile information and optional media, create a pending inactive registration, and MUST NOT grant `SELLER`. One account MUST own at most one shop record, including pending, rejected and soft-deleted records. A duplicate submission MUST return a safe conflict with a supported path to the existing workspace; it MUST NOT create another shop.

#### Scenario: First application
- **WHEN** an active buyer with no shop submits valid shop identity, name, description, location, contact details, pickup and return addresses
- **THEN** one private pending inactive registration is stored, optional logo/banner can be omitted, and seller-only access remains denied

#### Scenario: Concurrent duplicate submission
- **WHEN** two submissions compete for the same owner's shop slot
- **THEN** at most one record is created and the losing request returns a safe conflict

#### Scenario: Invalid profile or another owner's identifier
- **WHEN** a submission contains invalid required fields or attempts to choose another owner
- **THEN** the request cannot create a shop for that other owner and invalid fields receive the supported validation response

#### Scenario: Soft-deleted shop occupies the slot
- **WHEN** an owner with a soft-deleted shop attempts a new registration
- **THEN** no second shop is created and the response directs the owner to the existing recovery/support path

### Requirement: Applicants can follow and correct their registration
An active owner SHALL access their own registration workspace without `SELLER`, correct pending information, and resubmit a rejected registration using the same record. Resubmission MUST clear the current rejection reason and return to pending/inactive without erasing audit history or granting seller access. Operational status fields MUST NOT be accepted through registration correction. Registration details MUST remain private to the owner and authorized administrators.

#### Scenario: Rejected application is corrected
- **WHEN** the active owner corrects and resubmits a rejected profile
- **THEN** the same application becomes pending and inactive, the prior decision stays in history, and the user keeps ordinary buyer access

#### Scenario: Another account requests the workspace
- **WHEN** a user attempts to read or change another owner's registration
- **THEN** the system denies access without disclosing private profile data

### Requirement: Approval grants seller access and activates the shop atomically
Only an active authorized administrator SHALL approve or reject an eligible pending registration with a valid reason. Approval MUST require an active non-deleted applicant and MUST grant `SELLER`, mark the existing shop approved and active, and record required audit events atomically. Rejection MUST retain a reason, leave the registration rejected/inactive and grant no seller role. Generic role commands MUST NOT bypass approval or break approved-shop ownership. Repeated identical decisions MUST be idempotent; incompatible or stale decisions MUST fail without partial writes. A newly approved owner MUST reach their shop without another create-shop step after refreshing authorization state.

#### Scenario: Approval succeeds
- **WHEN** an administrator approves the active applicant's current pending registration
- **THEN** the owner receives `SELLER`, their only shop becomes approved and active, and the refreshed interface offers seller access

#### Scenario: Applicant is locked before approval
- **WHEN** account suspension takes effect before approval can commit
- **THEN** approval is denied without granting a role, activating the shop or restoring the account

#### Scenario: Approval races with a profile correction or rejection
- **WHEN** the reviewed application changes or another decision commits first
- **THEN** a stale decision does not silently approve unseen data or overwrite the committed decision, and the administrator must reload the current application

#### Scenario: Approval persistence fails
- **WHEN** a role, shop or required audit write fails
- **THEN** all approval writes roll back and the caller receives a failure

### Requirement: Shop and account lifecycle effects remain independent
Administrative and moderation shop suspension/restoration SHALL change shop status only, preserving owner status, seller role and sessions. Account suspension SHALL suspend the user and revoke their active sessions without changing shop operational/onboarding status or seller role. Account restoration MUST NOT restore a suspended/inactive shop or recreate sessions. Restoring an approved suspended shop MUST NOT unlock its owner. Public availability MUST depend on both entities' eligibility, including after restoration. Required writes and audit records MUST be atomic; repeated no-op commands MUST NOT duplicate audits.

#### Scenario: Only shop is suspended
- **WHEN** an administrator or moderation decision suspends an approved shop whose owner is active
- **THEN** the shop becomes suspended while the owner remains active with the same roles and usable personal-account sessions

#### Scenario: Owner is suspended
- **WHEN** an administrator suspends an active owner of an approved active shop
- **THEN** the owner becomes suspended and sessions are revoked, the shop's stored status remains active, and the shop becomes publicly unavailable

#### Scenario: Owner restoration preserves separate shop restriction
- **WHEN** an administrator restores an owner whose shop is suspended or seller-selected inactive
- **THEN** the owner can sign in again but the shop retains its restriction and remains unavailable

#### Scenario: Shop restoration cannot unlock an owner
- **WHEN** an administrator restores an approved suspended shop whose owner remains suspended
- **THEN** only shop status becomes active and public availability remains denied because of the owner

#### Scenario: Account suspension write fails
- **WHEN** required session revocation or audit persistence fails during account suspension
- **THEN** the account-status transaction rolls back without partially revoking access or recording a successful action

### Requirement: Seller role is distinct from operational permission
An active owner of an approved suspended shop SHALL retain buyer access, seller membership and read access to their own shop restriction status and moderation notices. The system MUST deny selling mutations, profile/status writes and self-reactivation while the shop is administratively suspended. Existing order/return access restrictions MUST be preserved rather than silently expanded. An active owner of an approved inactive shop MUST retain the existing supported active/inactive toggle. A suspended account MUST fail authentication for both fresh and previously issued credentials/tokens according to existing identity-proof and non-enumeration rules.

#### Scenario: Suspended shop owner buys as a user
- **WHEN** an active owner of a suspended shop uses ordinary buyer functionality
- **THEN** shop suspension alone does not deny the personal-account action

#### Scenario: Suspended shop owner tries direct mutation
- **WHEN** that owner bypasses the interface and sends a product publish, inventory, promotion, shop-profile or self-reactivation mutation
- **THEN** the backend rejects the action while still allowing the supported restriction-status and moderation reads

#### Scenario: Locked account reuses a token
- **WHEN** a suspended owner presents an old access or refresh token
- **THEN** access is denied regardless of shop status

### Requirement: Legacy restrictions are preserved during separation
Transition to independent states SHALL preserve shop identity, ownership, registrations, roles, transaction history and existing sanctions. A historical active-account/suspended-shop combination MUST NOT be automatically treated as an invalid identity. Ambiguous records where both entities were suspended under the former coupled policy MUST remain restricted until an explicit reviewed repair or administrative action resolves them; deployment MUST NOT bulk-activate accounts or shops.

#### Scenario: Ambiguous old coupled suspension
- **WHEN** historical records show both entities suspended without sufficient provenance to distinguish independent sanctions
- **THEN** both remain suspended and a reconciliation report identifies the unresolved records

#### Scenario: Approved shop ownership is preserved
- **WHEN** the new lifecycle policy is deployed
- **THEN** approved shops keep their identifiers and owners, and pending/rejected applications are not granted seller access
