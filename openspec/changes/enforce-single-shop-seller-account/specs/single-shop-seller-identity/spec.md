## Purpose

Establishes one marketplace identity in which approving a seller request grants the seller role and activates the account's single shop as one outcome, followed by a coordinated administrative lifecycle.

## ADDED Requirements

### Requirement: One account owns at most one shop
The system SHALL allow an account to own at most one shop record. This limit MUST include pending seller requests and approved, rejected, suspended, inactive, or soft-deleted shop records. The submitted shop registration SHALL represent the account's request to become a seller. Seller registration MUST return the existing request or shop workspace rather than create another shop when the account already owns one.

#### Scenario: Account submits its first seller request
- **WHEN** an active buyer account without a shop submits a valid shop registration
- **THEN** the system creates one pending shop record as that account's seller request and does not grant seller authorization yet

#### Scenario: Account already owns a shop
- **WHEN** an account that already owns a shop attempts to start or submit another shop registration
- **THEN** the system returns the existing shop workspace and does not create another shop

#### Scenario: Concurrent duplicate registration
- **WHEN** two valid shop registrations for the same account are submitted concurrently
- **THEN** exactly one shop is created and both callers can resolve the same resulting shop

#### Scenario: Account has a soft-deleted shop
- **WHEN** an account with a soft-deleted shop attempts to create another shop
- **THEN** the system refuses creation and directs the account to the supported recovery or support path

### Requirement: Seller request contains a complete shop profile
The seller registration form and request contract SHALL collect the data required to create and operate the shop: a unique shop identifier, shop name, description, location, contact phone, contact email, pickup address, and return address. Logo and banner SHALL be optional. Required values MUST be validated and normalized before the pending request is stored. The pending request MUST retain this profile for admin review and later approval.

#### Scenario: User submits a complete shop profile
- **WHEN** an eligible account submits valid values for every required shop-profile field
- **THEN** the system stores one pending seller request containing that complete shop profile

#### Scenario: Required shop information is missing or invalid
- **WHEN** the submitted form omits or contains an invalid required shop-profile value
- **THEN** the system identifies the invalid fields and does not create the pending seller request

#### Scenario: Optional shop media is omitted
- **WHEN** the user submits a valid request without a logo or banner
- **THEN** the request remains eligible for admin review and approval

#### Scenario: Admin approves the stored profile
- **WHEN** an administrator approves an eligible request with a complete stored shop profile
- **THEN** the system activates the shop using that profile without asking the seller to enter the information again

### Requirement: Admin approval grants seller access and activates one shop
An account SHALL have the seller role if and only if it owns exactly one approved, non-deleted shop. Admin approval of the seller request MUST grant the seller role and transition the submitted shop to approved and active in the same successful operation. The approved user MUST NOT perform a separate create-shop step. Generic role administration MUST NOT independently grant or revoke the seller role in a way that violates this relationship. The account and its shop MUST be presented as one marketplace actor and MUST NOT require a personal/shop identity selector.

#### Scenario: Pending shop is not a seller
- **WHEN** an account owns a shop whose application is pending or rejected
- **THEN** the account does not receive seller authorization

#### Scenario: Admin approves the seller request
- **WHEN** an administrator approves an eligible pending seller request
- **THEN** the account receives `SELLER` and its submitted shop becomes approved and active atomically

#### Scenario: Approved seller opens the seller area for the first time
- **WHEN** a newly approved seller opens the seller area
- **THEN** the system opens the automatically provisioned shop and does not ask the seller to create another shop

#### Scenario: Generic seller role grant lacks an approved shop
- **WHEN** an administrator attempts to grant the seller role to an account without an approved non-deleted shop
- **THEN** the command is rejected without changing role assignments

#### Scenario: Seller enters the seller workspace
- **WHEN** an authorized seller opens the seller area
- **THEN** the system opens the account's only shop without a shop picker or identity picker

### Requirement: Seller-controlled inactivity does not lock the account
An approved seller MAY temporarily make its shop inactive through the supported seller action. This action MUST keep the account active, preserve the seller role, and allow the seller to sign in and reactivate the shop later. The system MUST distinguish this state from an administrative suspension.

#### Scenario: Seller pauses selling
- **WHEN** an active seller temporarily makes its approved shop inactive
- **THEN** the shop stops selling while the owner account remains active and authenticated

#### Scenario: Seller resumes selling
- **WHEN** the same active seller reactivates its approved inactive shop
- **THEN** the shop returns to active selling without changing account status or seller authorization

### Requirement: Seller and approved shop suspension is coordinated
Administrative or moderation suspension of an approved shop MUST atomically set the shop and owner account to suspended, revoke every active session for the owner, and preserve the seller role for possible restoration. Direct administrative suspension of a seller account MUST atomically suspend its approved shop and revoke every active session. A failure in any part of the command MUST leave all statuses, sessions, and audit records at their prior values.

#### Scenario: Administrator suspends an approved shop
- **WHEN** an administrator submits a valid suspension command for an active approved shop
- **THEN** the shop and owner account become suspended, owner sessions are revoked, and both affected entities are audited

#### Scenario: Administrator suspends a seller account
- **WHEN** an administrator submits a valid suspension command for an active seller account
- **THEN** the account and its approved shop become suspended, sessions are revoked, and both affected entities are audited

#### Scenario: Moderation suspends a shop
- **WHEN** an authorized moderation decision suspends an approved shop
- **THEN** the same coordinated account suspension and session revocation rules apply

#### Scenario: Coordinated suspension fails
- **WHEN** any required status, session, or audit write cannot complete
- **THEN** no partial suspension is visible and the command reports a retryable failure

### Requirement: Seller and approved shop restoration is coordinated
Restoration of a suspended seller account or its suspended shop MUST atomically restore both the account and its approved shop. Restoration MUST NOT recreate revoked sessions, and the seller MUST authenticate again. A shop that is not approved MUST NOT be restored to active selling through this lifecycle action.

#### Scenario: Administrator restores a suspended seller shop
- **WHEN** an administrator submits a valid restore command for a suspended approved shop
- **THEN** the shop and owner account become active and the prior sessions remain revoked

#### Scenario: Administrator restores a suspended seller account
- **WHEN** an administrator submits a valid restore command for a suspended seller account with an approved shop
- **THEN** the account and shop become active together and the seller must sign in again

#### Scenario: Unapproved shop cannot be restored as a seller
- **WHEN** an administrator attempts coordinated restoration for a shop that is not approved
- **THEN** the command is rejected and neither account nor shop status changes

### Requirement: Suspended seller access fails closed
Authentication and authorization SHALL reject a suspended seller account even when an older access token is presented. After valid credentials or a valid external identity are confirmed, the user experience MAY disclose that the account and shop are disabled, but it MUST NOT expose this status before identity proof or leak internal moderation details.

#### Scenario: Revoked access token is reused
- **WHEN** a suspended seller presents an access token from a revoked session
- **THEN** authenticated access is denied

#### Scenario: Suspended seller submits correct credentials
- **WHEN** a suspended seller proves account ownership with correct credentials
- **THEN** login remains denied and the user receives the supported account-and-shop-disabled message

#### Scenario: Unknown account attempts login
- **WHEN** submitted credentials do not prove ownership of an account
- **THEN** the system returns the normal non-enumerating authentication failure
