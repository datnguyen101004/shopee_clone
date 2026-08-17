## Purpose

Provide a safe, low-friction way for a seller to start a shop profile with the default shipping address that the same account has already maintained.

## ADDED Requirements

### Requirement: Seller workspace exposes the account default address
The seller shop workspace SHALL return the authenticated account's active default shipping address as an address-default candidate, or `null` when the account has no active default address.

#### Scenario: Account has a default shipping address
- **WHEN** an authenticated buyer opens the seller shop workspace
- **THEN** the workspace includes the account default address as the address-default candidate

#### Scenario: Account has no shipping address
- **WHEN** an authenticated buyer with no active shipping address opens the seller shop workspace
- **THEN** the workspace returns a `null` address-default candidate

### Requirement: Incomplete shop addresses are prefilled from the account default
The seller shop screen SHALL use the workspace address-default candidate for each pickup or return address that is absent or incomplete when the screen is first populated.

#### Scenario: Legacy shop lacks fulfilment addresses
- **WHEN** an owner opens a legacy shop profile whose pickup and return addresses are absent
- **THEN** the form initially shows the account default address in both sections

#### Scenario: New seller registration
- **WHEN** a buyer with a default shipping address opens an empty seller shop workspace
- **THEN** the registration form initially shows that address for pickup and return

### Requirement: Saved shop addresses remain independent
The system SHALL preserve a complete address already stored on a shop and SHALL NOT overwrite it when the account default address changes.

#### Scenario: Shop already has a complete pickup address
- **WHEN** the owner opens the seller shop workspace after changing the account default address
- **THEN** the form continues to show the stored shop pickup address

#### Scenario: Seller saves a prefilled address
- **WHEN** the seller submits the prefilled profile without changing the address
- **THEN** the existing seller-shop create or update operation persists the submitted address normally
