## MODIFIED Requirements

### Requirement: Admins manage campaign banners

An admin SHALL manage platform campaigns whose presentation has exactly one campaign banner. Creating a campaign MUST create that banner atomically. Buyer-facing fields MUST include a nonblank title and nonblank restricted content; optional fields MAY include image URL, alt text, theme key, and sort order. Public homepage links MUST be generated as `/banner/:bannerId`; administrators MUST NOT override this canonical path. Image URLs MUST be trusted marketplace media URLs or relative media paths. The public homepage campaign-banner module MUST include every running (`ACTIVE`) campaign banner without a separate banner-create step.

#### Scenario: Admin creates a banner

- **WHEN** an admin submits a valid title, content, and operational campaign fields
- **THEN** one draft campaign with exactly one banner is persisted and remains absent from the homepage until the campaign is running

#### Scenario: External destination is rejected

- **WHEN** an admin submits an absolute external URL as the banner destination
- **THEN** the command fails and no campaign or banner row is changed

#### Scenario: Admin opens an existing campaign

- **WHEN** an admin selects a campaign from the campaign administration screen
- **THEN** the Admin Console loads its title, content, and operational fields without exposing them through a public unpublished response

#### Scenario: Running campaigns appear on the homepage

- **WHEN** two published campaigns are inside `[startsAt, endsAt)`
- **THEN** the homepage campaign-banner module includes both banners without requiring a separate homepage banner create command

#### Scenario: Admin deletes or cancels a campaign banner identity

- **WHEN** an admin cancels a campaign that owns a banner
- **THEN** the banner is omitted from subsequent homepage lists and future pricing stops while the canonical banner identifier remains stable

## ADDED Requirements

### Requirement: Admins edit and preview title and content

The Admin Console SHALL provide campaign create and edit surfaces whose buyer-facing copy is title and content. Preview MUST use the same restricted formatting semantics as the public page and MUST NOT persist or publish unsaved input. Title and content MUST contain non-whitespace text. The editor MUST NOT expose an independent destination or call-to-action pair.

#### Scenario: Admin saves valid content

- **WHEN** an admin edits a campaign with a valid title and content and submits the form
- **THEN** the update is persisted atomically, the form shows a success state, and a later public read reflects the saved version

#### Scenario: Admin previews unsaved content

- **WHEN** an admin requests a preview after entering a valid unsaved title and content
- **THEN** the editor renders a clearly labelled preview without publishing or persisting the draft

#### Scenario: Content is empty

- **WHEN** an admin submits whitespace-only title or content
- **THEN** the form and API reject it with bounded field-specific errors and preserve the previous campaign

#### Scenario: Content contains unsupported active markup

- **WHEN** an admin submits raw HTML, an embedded frame, or a scriptable link
- **THEN** the form and API reject the unsafe construct without echoing executable markup

### Requirement: Banner content changes are auditable without copying content bodies

Create, update, and cancel campaign commands SHALL record privileged audit events tied to the acting administrator and campaign/banner identifier. Audit summaries MUST identify which fields changed, but MUST NOT copy full content bodies, signed media URLs, credentials, or other unrestricted content into the audit log.

#### Scenario: Admin updates campaign content

- **WHEN** an authenticated admin changes campaign title or content
- **THEN** one privileged audit event records the actor, campaign target, action, time, and changed field names without storing the full before or after content body

#### Scenario: Campaign update fails validation

- **WHEN** a campaign update is rejected before persistence
- **THEN** no successful campaign-update audit event is recorded
