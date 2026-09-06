## MODIFIED Requirements

### Requirement: Admins manage campaign banners

An admin SHALL manage typed platform campaigns whose presentation has exactly one campaign banner. Creating a campaign MUST create that banner atomically; the admin MUST NOT create a homepage campaign banner without an owning campaign. Admin capabilities SHALL include list and filter by type, select one enabled campaign type when creating a draft, inspect the type's localized label, importance class and effective rules, update permitted fields, preview the selected presentation, publish, monitor seller/product participation, configure eligible generic campaign-collection placement, and cancel. The admin MUST NOT directly edit ranking weights or importance classes, and the selected type MUST become immutable after publication. Standalone banner reorder commands MAY change display order among running campaign banners but MUST NOT create a banner outside its campaign lifecycle. Buyer-facing campaign/banner fields MUST include title and restricted content; optional fields MAY include image URL, alt text, theme key, and sort order. Operational fields MUST include campaign type, schedule, and minimum discount, with optional eligible categories. Public homepage links MUST use `/banner/:bannerId`. Image URLs MUST be trusted marketplace media URLs or relative media paths. The homepage campaign-banner module MUST include every running (`ACTIVE`) campaign banner without a separate placement step. Typed product-collection modules MUST include only active campaigns that match the module's configured campaign type and order.

#### Scenario: Admin creates a banner

- **WHEN** an admin submits an enabled campaign type with a valid title, content, timeline, eligibility, type policy, and sort order
- **THEN** one draft campaign with exactly one banner is persisted and remains absent from the homepage until the campaign is running

#### Scenario: External destination is rejected

- **WHEN** an admin submits an absolute external URL as the banner destination
- **THEN** the command fails and no campaign or banner row is changed

#### Scenario: Admin publishes a campaign

- **WHEN** an admin publishes a complete draft with a valid future enrollment and event window
- **THEN** the campaign becomes eligible for scheduled announcement, seller notification, and later automatic homepage banner listing while it is running

#### Scenario: Running campaigns appear on the homepage

- **WHEN** two published campaigns are inside `[startsAt, endsAt)`
- **THEN** the homepage campaign-banner module includes both banners without requiring a separate homepage banner create command

#### Scenario: Flash Sale module reads a typed campaign

- **WHEN** an admin places an active `FLASH_SALE` campaign in the Flash Sale homepage collection
- **THEN** the module uses that campaign and its accepted products rather than independently configured Flash Sale products or prices

#### Scenario: Admin chooses a campaign type

- **WHEN** an admin starts a draft and chooses Flash Sale or a normal enabled campaign type
- **THEN** the form shows the corresponding featured or normal importance label and effective rules without exposing editable raw ranking weights

#### Scenario: Admin cancels instead of deleting history

- **WHEN** an announced, enrolling, scheduled, or active campaign must stop
- **THEN** cancellation preserves participation and audit history while removing future pricing, ranking, and homepage eligibility
