## Purpose

Allow an eligible seller to apply for one validated marketplace shop, manage its profile through owner-scoped routes, pass a basic administrative decision, and sell only while the shop is approved and operational.

## ADDED Requirements

### Requirement: Seller shop workspace
The system SHALL expose `GET /api/v1/seller/shop/workspace` only to an active authenticated user who currently holds the seller role. The response MUST return `Cache-Control: no-store` and either `shop: null` when the caller has no non-deleted owned shop or the caller's current shop profile without an owner identifier. The existing `GET /api/v1/seller/shop` safe summary MUST remain available and retain its current sanitized authorization behavior.

#### Scenario: Seller without a shop opens the workspace
- **WHEN** an active seller with no non-deleted owned shop requests the workspace
- **THEN** the system returns `{ "shop": null }` without creating a shop

#### Scenario: Seller with an owned shop opens the workspace
- **WHEN** an active seller who owns a non-deleted shop requests the workspace
- **THEN** the system returns only that shop's current private profile and omits `ownerId`

#### Scenario: Buyer or guest requests a seller shop route
- **WHEN** a guest or a user without the seller role requests a seller shop management route
- **THEN** the system returns sanitized `401` or `403` Problem Details and does not read or mutate private shop data

### Requirement: Single-shop onboarding application
The system SHALL expose `POST /api/v1/seller/shop` to create the caller's shop application. An eligible caller MUST be an active authenticated user with the current seller role and no non-deleted owned shop. A successful create MUST derive ownership only from the authenticated session, persist onboarding status `pending_approval` and operational status `inactive`, and return the canonical private shop profile. Browser mutations MUST pass the existing trusted-origin protection.

#### Scenario: Eligible seller submits a valid application
- **WHEN** a seller with no non-deleted shop submits a valid create body
- **THEN** the system creates exactly one shop owned by that user as pending approval and inactive

#### Scenario: Seller already owns a live shop
- **WHEN** the same seller submits another create request while a non-deleted owned shop exists
- **THEN** the system returns sanitized `409` Problem Details and creates no second live shop

#### Scenario: Concurrent duplicate applications
- **WHEN** two valid create requests for the same seller race
- **THEN** exactly one non-deleted shop is created and the other request receives a sanitized conflict

#### Scenario: Soft-deleted shop does not count as active ownership
- **WHEN** the seller's only previous shop is soft-deleted and all unique identity fields are available
- **THEN** the initial ownership policy permits creation of a new shop

### Requirement: Validated shop identity and logistics addresses
Create and update requests MUST accept only documented fields: kebab-case `slug`, live shop `name`, `description`, optional HTTPS `logoUrl` and `bannerUrl`, `location`, Vietnamese `contactPhone`, normalized `contactEmail`, and complete pickup and return addresses. Address fields MUST follow the existing Vietnamese recipient, phone, province, district, ward, and address-line rules. Unknown properties, control characters, invalid values, and non-HTTPS media URLs MUST be rejected with sanitized `400` Problem Details that name only safe invalid parameters. Slug MUST be globally unique, including reserved soft-deleted slugs; name MUST be case-insensitively unique among non-deleted shops.

#### Scenario: Identity and addresses are valid
- **WHEN** a seller submits normalized identity, contact, and complete pickup and return addresses
- **THEN** the system stores canonical values and returns them on the next owner read

#### Scenario: Slug or live name is already taken
- **WHEN** a submitted slug is reserved by any shop or a submitted name matches a non-deleted shop ignoring case
- **THEN** the system rejects the complete request with `409` and persists none of the conflicting identity

#### Scenario: Address, contact, or media field is invalid
- **WHEN** an address, phone, email, slug, name, or media URL fails its documented validation rule
- **THEN** the system returns `400` with safe invalid parameter names and does not persist the change

#### Scenario: Request contains unknown properties
- **WHEN** a seller includes an undocumented property such as `ownerId`, `status`, or `onboardingStatus` in a create request
- **THEN** the system returns `400` and does not trust or persist that property

### Requirement: Owner-scoped shop profile updates
The system SHALL expose `PATCH /api/v1/seller/shop` for the authenticated seller's owned non-deleted shop. Ownership MUST be loaded from persistence and MUST ignore any client-supplied owner identity. A seller MAY update identity, media, contact, and pickup/return addresses while onboarding is pending, approved, or rejected. A seller MAY set operational status to `active` or `inactive` only after approval and MUST NOT set `suspended`. Unknown, foreign, or deleted ownership MUST produce the same sanitized denial as other seller management failures.

#### Scenario: Owner updates profile and pickup address
- **WHEN** the owning seller patches valid profile and pickup-address fields
- **THEN** the system atomically updates only that owned shop and returns its canonical private profile

#### Scenario: Unapproved shop cannot be activated
- **WHEN** a seller whose shop is pending approval or rejected attempts to set status `active`
- **THEN** the system returns `409` and leaves the shop inactive

#### Scenario: Seller attempts to set suspended status
- **WHEN** a seller submits `suspended` as an operational status
- **THEN** the system rejects the request and does not alter the shop status

#### Scenario: Non-owner cannot mutate a shop
- **WHEN** another authenticated seller calls the owner update route
- **THEN** the system returns a sanitized denial and changes no shop

### Requirement: Administrative approval placeholder
The system SHALL expose `POST /api/v1/admin/shops/{shopId}/approval` only to an active authenticated admin. The body MUST contain `decision` (`approve` or `reject`) and a bounded operational `reason`. Approve MUST set onboarding status `approved` and operational status `active`. Reject MUST set onboarding status `rejected`, set operational status `inactive`, and retain the reason for the owner. Repeating the same decision and reason MUST be idempotent. This placeholder MUST NOT collect business documents, tax identifiers, identity-verification data, or Mall certification. Unknown and deleted shop IDs MUST return the same sanitized `404` response.

#### Scenario: Admin approves a pending shop
- **WHEN** an admin submits a valid approve decision for a pending shop
- **THEN** the shop becomes approved and active and later owner reads reflect the decision

#### Scenario: Admin rejects a pending shop
- **WHEN** an admin submits a valid reject decision and reason
- **THEN** the shop becomes rejected and inactive while remaining editable by its owner

#### Scenario: Admin repeats the same decision
- **WHEN** an admin repeats the already-applied decision with the same canonical reason
- **THEN** the endpoint returns the existing canonical result without a second state change

#### Scenario: Non-admin attempts approval
- **WHEN** a seller or buyer posts an approval decision
- **THEN** the system returns sanitized `403` and leaves onboarding status unchanged

### Requirement: Shop sellability boundary
A shop SHALL be eligible for new sales only when it is non-deleted, operationally `active`, and onboarding-approved. Public catalog, public shop storefront, cart line admission, authoritative pricing, and checkout confirmation MUST reject or omit shops that do not satisfy this predicate. Existing historical orders MUST remain readable. Buyer-facing responses MUST NOT reveal whether unavailability is caused by suspension, rejection, inactivity, pending approval, or deletion.

#### Scenario: Inactive or unapproved shop is excluded from new sales
- **WHEN** a shop is inactive, pending approval, or rejected
- **THEN** its products are unavailable on public sell surfaces and cannot enter a newly confirmed sale

#### Scenario: Suspended shop is excluded without reason leakage
- **WHEN** a shop is suspended
- **THEN** buyer surfaces treat it as unavailable without exposing the suspension reason

#### Scenario: Status changes after an item entered the cart
- **WHEN** a previously sellable shop becomes inactive, suspended, or unapproved before pricing or checkout confirmation
- **THEN** the server refuses the affected cart pricing or checkout operation without creating a sale

#### Scenario: Approved active shop can sell
- **WHEN** a shop is non-deleted, approved, and active
- **THEN** its otherwise displayable products remain eligible for catalog, storefront, cart, pricing, and checkout

### Requirement: Isolated seller management experience
The web application SHALL provide role-gated seller management at `/seller` and `/seller/shop`. Guests MUST receive a sign-in handoff, and authenticated users without the seller role MUST receive a forbidden state without calling seller mutations. Sellers without a shop MUST see onboarding; sellers with a shop MUST see its current onboarding state, profile editing, and a clear cannot-sell explanation when applicable. The admin area SHALL expose only a minimal approval placeholder. Private requests MUST use the authenticated client boundary, and the browser MUST NOT persist shop payloads, credentials, or owner identifiers in URLs or browser storage.

#### Scenario: Seller without a shop opens management
- **WHEN** session restoration confirms a seller with no shop
- **THEN** the UI renders the onboarding form and does not claim the shop can sell

#### Scenario: Seller with a pending or rejected shop opens management
- **WHEN** the owner opens the shop workspace before approval
- **THEN** the UI shows the decision state, permits profile correction, and offers no activation control

#### Scenario: Approved seller updates operational state
- **WHEN** an approved shop owner switches between active and inactive
- **THEN** the UI submits the owner-scoped update and renders the server-confirmed state

#### Scenario: Guest opens the seller area
- **WHEN** an unauthenticated visitor opens `/seller` or `/seller/shop`
- **THEN** the UI presents a safe login handoff and sends no private seller mutation

### Requirement: Responsive and accessible seller forms
Seller onboarding, profile management, and the admin approval placeholder MUST be keyboard operable, expose associated labels and error messages, retain valid user input after recoverable errors, prevent duplicate submissions, announce pending/success/failure states, and avoid horizontal overflow at 360px, 768px, and 1440px viewport widths.

#### Scenario: Validation fails in the seller form
- **WHEN** a seller submits invalid or incomplete shop data
- **THEN** the UI identifies the affected fields, focuses or announces the error, and retains other valid input

#### Scenario: Mutation is pending
- **WHEN** a create, update, or approval request is in flight
- **THEN** the UI prevents duplicate submission while keeping the current state understandable to assistive technology

#### Scenario: Seller form is used at supported viewport sizes
- **WHEN** onboarding or profile management is opened at 360px, 768px, or 1440px
- **THEN** all required controls remain readable, reachable, and free of horizontal page overflow
