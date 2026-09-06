## Purpose

Provide buyers with a stable campaign page identified by the campaign's one banner, and show every currently running campaign banner on the homepage.

## ADDED Requirements

### Requirement: Published banners have canonical public detail resources

The system SHALL expose a public campaign-detail resource and storefront page identified by the banner's opaque identifier. Each banner SHALL belong to exactly one platform campaign. The canonical storefront path MUST be `/banner/:bannerId`, and each banner returned in the public homepage campaign-banner module MUST use that canonical path as its `href`.

#### Scenario: Buyer opens a homepage banner

- **WHEN** a buyer activates a banner with identifier `bannerId` on the homepage
- **THEN** the browser navigates to `/banner/:bannerId` and renders that campaign's title and content

#### Scenario: Banner identifiers remain stable after content edit

- **WHEN** an administrator updates the title or content of an existing campaign
- **THEN** its canonical path remains unchanged and subsequent public reads show the updated title and content

### Requirement: Homepage lists every running campaign banner

The public homepage campaign-banner module SHALL include every published, non-cancelled campaign whose derived lifecycle is `ACTIVE`, represented by that campaign's single banner. Draft, announced, enrollment-open, scheduled, ended, cancelled, unpublished, and content-invalid campaigns MUST be omitted from that homepage list.

#### Scenario: Multiple campaigns are running

- **WHEN** two published campaigns are inside `[startsAt, endsAt)`
- **THEN** the homepage campaign-banner module includes both banners and each banner navigates to its own `/banner/:bannerId`

#### Scenario: Campaign is not yet running

- **WHEN** a published campaign is `ANNOUNCED`, `ENROLLMENT_OPEN`, or `SCHEDULED`
- **THEN** its banner is absent from the homepage campaign-banner module

### Requirement: Direct access follows campaign publication state

The public campaign-detail resource SHALL be available from announcement through the exclusive end time. A missing, deleted, malformed, draft, or unannounced banner MUST produce the same sanitized not-found outcome without disclosing whether an unpublished record exists.

#### Scenario: Active campaign is requested

- **WHEN** the banner exists, belongs to a published campaign, and has valid title and content
- **THEN** the public API returns the campaign detail successfully

#### Scenario: Unknown or malformed identifier is requested

- **WHEN** a visitor requests `/banner/:bannerId` with an unknown or malformed identifier
- **THEN** the storefront renders the same buyer-facing not-found state without exposing persistence details

### Requirement: Banner detail content uses a safe typed contract

The public campaign-detail contract MUST include the banner identifier, title, restricted content blocks, optional image URL, meaningful image alternative text when an image is present, canonical path, campaign lifecycle, and server evaluation time. Content SHALL support only the documented heading, paragraph, list, and same-origin-link subset; it MUST NOT expose raw HTML, scriptable URLs, embedded frames, event handlers, or executable content. The contract MUST NOT require a call-to-action destination separate from `/banner/:bannerId`.

#### Scenario: Formatted campaign content is returned

- **WHEN** an active campaign contains valid title plus heading, paragraph, list, or same-origin link blocks
- **THEN** the API returns equivalent typed content blocks and the storefront renders their intended hierarchy

#### Scenario: Executable markup reaches stored data

- **WHEN** stored content contains raw HTML, a scriptable URL, or an unsupported embedded element
- **THEN** the public response omits or safely treats that construct as text and never returns executable markup

### Requirement: Banner detail handles delivery states without fabricated content

The storefront SHALL distinguish loading, not-found, and service-failure states. It MUST NOT substitute hardcoded campaign content when the API is empty, invalid, unavailable, or unsuccessful; the shared storefront header and navigation SHALL remain usable.

#### Scenario: Banner detail is loading

- **WHEN** navigation reaches a banner detail while its data is pending
- **THEN** the page exposes a labelled, non-interactive skeleton that preserves the expected content hierarchy

#### Scenario: Banner service fails

- **WHEN** the API times out, is unreachable, returns invalid data, or returns a service error
- **THEN** the page shows a safe failure message with a retry action and does not misrepresent the result as a missing banner

### Requirement: Banner detail is responsive and accessible

The banner detail page SHALL use semantic headings and article structure, meaningful media alternatives, visible keyboard focus, and primary touch targets of at least 44 CSS pixels. It MUST avoid document-level horizontal overflow at the 360×800, 768×1024, and 1440×900 reference viewports.

#### Scenario: Keyboard user reads and acts on a banner

- **WHEN** a keyboard user traverses the banner detail
- **THEN** links and actions receive focus in visual order with visible focus indicators and informative accessible names

#### Scenario: Banner renders at each reference viewport

- **WHEN** populated, not-found, and failure states render at each reference viewport
- **THEN** the content remains readable and operable without document-level horizontal overflow
