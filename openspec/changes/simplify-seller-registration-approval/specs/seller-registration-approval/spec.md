## Purpose

Provide one understandable path from a buyer account to one active seller shop, with the administrator's approval as the only elevation gate.

## ADDED Requirements

### Requirement: Buyer-owned seller registration

The system SHALL let an active authenticated buyer who does not own a non-deleted shop submit one complete shop-registration profile. The request MUST derive ownership from the authenticated account, MUST persist the shop as `pending_approval` and `inactive`, and MUST NOT grant the seller role before an administrator approves it. Existing sellers or accounts that already own a non-deleted shop MUST receive a safe conflict response rather than a second registration.

#### Scenario: Buyer submits a first registration
- **WHEN** an active buyer submits a valid shop-registration profile
- **THEN** the system creates exactly one pending inactive shop owned by that buyer and the account remains buyer-only

#### Scenario: Buyer already has a registration or shop
- **WHEN** an account that owns a non-deleted pending, rejected, approved, inactive, active, or suspended shop submits another registration
- **THEN** the system returns a sanitized conflict and creates no additional live shop

### Requirement: Registration workspace and correction

The system SHALL expose the authenticated account's own registration workspace without requiring the seller role. A buyer with a pending or rejected registration MUST be able to view and correct the private profile. A rejected registration MUST remain buyer-only and a resubmission MUST restore `pending_approval` plus `inactive` while clearing the previous rejection reason. Seller-only shop-operating controls MUST remain unavailable until approval grants the seller role.

#### Scenario: Buyer corrects a rejected application
- **WHEN** the owner updates a rejected registration with a valid profile and resubmits it
- **THEN** the profile is updated, the state becomes pending approval and inactive, and the prior rejection reason is cleared without granting seller access

### Requirement: Approval atomically grants seller access

The system SHALL allow only an active administrator to approve or reject a pending or corrected shop registration. Approval MUST atomically set the shop to `approved` and `active` and grant the owner the seller role through the existing auditable role-assignment model. Rejection MUST set the shop to `rejected` and `inactive`, retain the administrator reason for the owner, and leave the owner without the seller role. Repeating the same decision and canonical reason MUST be idempotent.

#### Scenario: Administrator approves a buyer registration
- **WHEN** an administrator approves a pending registration with a valid reason
- **THEN** the owner receives the seller role and the shop becomes approved and active in one successful operation

#### Scenario: Administrator rejects a buyer registration
- **WHEN** an administrator rejects a pending registration with a valid reason
- **THEN** the shop is rejected and inactive, the buyer can read the reason, and the owner cannot access seller-only operations

#### Scenario: Approval transaction cannot partially elevate access
- **WHEN** persistence of either the role assignment or shop decision fails during approval
- **THEN** neither the seller role nor approved active shop state is committed

### Requirement: Single-shop seller operation after approval

The system SHALL treat an approved seller role as access to the account's one owned shop. The seller MAY update shop profile data and switch only its approved shop between active and inactive. A seller MUST NOT create another shop, self-grant a role, self-approve a registration, or set a shop to suspended.

#### Scenario: Approved seller maintains the shop
- **WHEN** an approved seller updates profile data or toggles active/inactive status
- **THEN** only that seller's owned approved shop changes and no new approval is required

### Requirement: Unified buyer-to-seller interface

The web application SHALL present a buyer-facing entry point to register a shop, a private registration workspace for pending/rejected/approved state, and seller-only operational navigation only after the role is present. The administrator interface SHALL describe approval as granting seller access. The interface MUST keep private shop data out of browser storage and retain the existing responsive and accessible form guarantees.

#### Scenario: Buyer opens seller registration
- **WHEN** an authenticated buyer without a shop opens the shop registration route
- **THEN** the application shows the registration form and does not show seller-only operating controls

#### Scenario: Approved owner returns to the application
- **WHEN** the owner refreshes their session after administrator approval
- **THEN** the application restores seller navigation and the active shop operating state
