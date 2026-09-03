## Purpose

Provide authenticated buyers with an owned, validated profile and deterministic Vietnamese delivery-address book that later checkout flows can consume safely.

## ADDED Requirements

### Requirement: Authenticated self-service account boundary

The system SHALL require a valid active authenticated session for every profile and shipping-address operation, SHALL derive the owner from that session rather than request input, and SHALL never disclose another user's profile or address.

#### Scenario: Guest requests account data

- **WHEN** a request without a valid authenticated session reads or mutates profile or address data
- **THEN** the system returns the standard authentication failure without account data

#### Scenario: User targets another owner's address

- **WHEN** an authenticated user submits an address identifier that is not an active address owned by that user
- **THEN** the system returns the same not-found response used for a nonexistent address and performs no mutation

### Requirement: Buyer profile view and edit

The system SHALL expose the authenticated user's email, display name, optional normalized phone number, and account status; SHALL keep email and status read-only; and SHALL allow only display name and phone number to be edited through the profile operation.

#### Scenario: User views profile

- **WHEN** an authenticated active user opens their profile
- **THEN** the system returns only that user's safe profile projection and marks the login email as non-editable

#### Scenario: User updates editable profile fields

- **WHEN** an authenticated user submits a valid trimmed display name and a valid phone number or explicitly clears the optional phone number
- **THEN** the system persists and returns the normalized profile while leaving email, status, roles, and credentials unchanged

#### Scenario: User submits unsupported profile fields

- **WHEN** a profile mutation contains email, role, status, credential, or any unknown property
- **THEN** the system rejects the complete request with validation Problem Details and persists no partial change

### Requirement: Vietnamese contact validation and normalization

The system MUST validate profile and recipient phone numbers server-side, accepting common Vietnamese local or `+84` presentation, and SHALL return the canonical local form `0` followed by nine digits. It SHALL trim human-readable fields, reject control characters, enforce documented length bounds, and reject empty required address components.

#### Scenario: Common Vietnamese phone formatting is submitted

- **WHEN** a user submits a valid phone with an optional `+84` prefix and supported spaces, dots, or hyphens
- **THEN** the system stores and returns the equivalent ten-digit local number beginning with `0`

#### Scenario: Invalid checkout contact is submitted

- **WHEN** a profile or address contains an invalid phone, control characters, blank required component, or a value outside its documented bound
- **THEN** the system returns field-specific validation Problem Details and writes nothing

### Requirement: Checkout-compatible shipping address records

Each active shipping address SHALL contain an opaque identifier, recipient name, normalized recipient phone number, province or centrally governed city, district, ward, detailed address line, optional user label, default flag, and canonical creation/update timestamps. The system SHALL support creating, listing, updating, and deleting those records for the authenticated owner.

#### Scenario: User creates the first address

- **WHEN** an authenticated user with no active addresses submits all required valid address fields
- **THEN** the system creates and returns the address as that user's default even when the client does not request default selection

#### Scenario: User edits an owned address

- **WHEN** an authenticated user submits valid mutable fields for one of their active addresses
- **THEN** the system returns the updated address without changing its owner or default state

#### Scenario: User lists addresses

- **WHEN** an authenticated user requests their address book
- **THEN** the system returns only active owned addresses with the default first and the remainder in a documented deterministic order

### Requirement: Exactly one deterministic default address

The system MUST maintain exactly one default among a user's active addresses whenever at least one exists, MUST maintain no default when none exist, and MUST serialize competing mutations so concurrent requests cannot leave zero or multiple defaults.

#### Scenario: User explicitly selects another default

- **WHEN** an authenticated user selects one of their non-default active addresses as default
- **THEN** that address becomes the sole default and the operation succeeds idempotently when repeated

#### Scenario: User creates an address as default

- **WHEN** a user who already has addresses creates a valid address with explicit default selection
- **THEN** the new address becomes the sole default in the same atomic operation

#### Scenario: Concurrent default mutations compete

- **WHEN** two valid requests concurrently create or select different default addresses for the same user
- **THEN** both operations preserve database integrity and the committed order leaves exactly one active default

### Requirement: Deterministic address deletion

Address deletion SHALL be idempotent from the owner's perspective, SHALL remove the address from active reads, and SHALL choose the oldest remaining active address by creation time and identifier as the sole replacement when the deleted address was default.

#### Scenario: User deletes a non-default address

- **WHEN** an authenticated user deletes an owned non-default address
- **THEN** that address disappears from active reads and the existing default is unchanged

#### Scenario: User deletes the default while addresses remain

- **WHEN** an authenticated user deletes the default address and another active address exists
- **THEN** the deletion and deterministic replacement selection commit atomically

#### Scenario: User deletes the final address

- **WHEN** an authenticated user deletes their only active address
- **THEN** the address book becomes empty and no default address exists

### Requirement: Privacy-safe account API behavior

Profile and address responses SHALL be non-cacheable and SHALL return full contact/address values only to their authenticated owner. Logs, metrics, errors, and audit-style outcomes MUST NOT contain raw phone numbers, recipient names, street lines, credentials, or complete address payloads.

#### Scenario: Account mutation fails

- **WHEN** validation, ownership, database, or service failure prevents an account mutation
- **THEN** the response and logs contain only stable problem metadata, opaque identifiers where safe, and coarse outcomes without contact or address values

#### Scenario: Owner reads checkout data

- **WHEN** an authenticated owner successfully reads their profile or addresses
- **THEN** the API returns the complete values needed to edit and later use at checkout with `Cache-Control: no-store`

### Requirement: Responsive account management experience

The web application SHALL provide authenticated profile and address-management views using the existing session coordinator, SHALL expose accessible forms and default/delete controls, and SHALL represent loading, guest, empty, field-validation, pending, success, and recoverable failure states without persisting contact data in browser storage.

#### Scenario: Guest opens an account route

- **WHEN** session restoration resolves to guest on a profile or address route
- **THEN** the page presents a clear sign-in action with a safe internal return path and does not render stale account data

#### Scenario: User manages addresses from the web form

- **WHEN** an authenticated user creates, edits, selects, or deletes an address through the responsive account interface
- **THEN** controls prevent duplicate submission, errors remain associated with the relevant fields or action, and the refreshed list identifies exactly one default when addresses remain

#### Scenario: Account page is reloaded

- **WHEN** an authenticated account route reloads
- **THEN** the application restores the HttpOnly-backed session through the existing coordinator, reloads server data, and writes no profile or address values to local storage, session storage, URL parameters, or browser-readable cookies

### Requirement: Legacy Vietnamese province and district selection

The web address form SHALL present province/city and district as searchable accessible popups backed by a pinned snapshot of the 63 province-level units and their districts that existed on 30 June 2025. District choices SHALL depend on the selected province, changing province SHALL clear an incompatible district, and submitted values SHALL remain the human-readable names accepted by the existing account API. Ward/commune entry remains a validated text field.

#### Scenario: User selects a province and district

- **WHEN** a user opens the province popup, searches for and selects one of the legacy provinces, then opens the district popup
- **THEN** the district popup shows only districts belonging to that province and the chosen human-readable names are submitted with the address

#### Scenario: User changes the selected province

- **WHEN** an address form has a selected district and the user chooses another province that does not contain it
- **THEN** the district selection is cleared and the user must choose a district from the newly selected province

#### Scenario: User edits an existing textual address

- **WHEN** a stored province or district uses an unaccented or abbreviated representation that resolves to a unique legacy entry
- **THEN** the form preserves the stored value until the user makes a selection and offers the matching district choices without silently mutating persisted data

#### Scenario: User searches or navigates a popup

- **WHEN** a user searches with or without Vietnamese accents or navigates using keyboard and assistive technology
- **THEN** matching choices remain discoverable, the dialog has an accessible name, and selection returns focus through the dialog primitive
