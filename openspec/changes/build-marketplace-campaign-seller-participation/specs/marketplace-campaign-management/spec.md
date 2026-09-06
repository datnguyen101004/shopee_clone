## Purpose

Defines one-banner platform campaigns whose schedule, buyer content, seller participation, discounted products, pricing, and lifecycle remain server-authoritative and auditable.

## ADDED Requirements

### Requirement: One campaign owns one stable banner identity

Each platform campaign SHALL own exactly one banner with an opaque stable identifier, and each banner SHALL belong to exactly one platform campaign. That banner is the campaign's homepage display identity. The canonical buyer route MUST be `/banner/:bannerId`; content or schedule edits MUST NOT change that route. The system MUST NOT persist a homepage campaign banner that has no owning campaign.

#### Scenario: Admin creates a campaign draft

- **WHEN** an admin submits valid campaign title, content, and operational fields
- **THEN** one draft campaign and one associated banner are created atomically with a stable canonical route

#### Scenario: Banner content changes

- **WHEN** an admin updates the title, optional image, or content of an existing campaign
- **THEN** the banner identifier and canonical route remain unchanged

### Requirement: Campaign types are extensible and policy-driven

Every campaign SHALL reference one enabled, stable campaign type selected by the admin while authoring the draft. A type's code, localized label, policy version, presentation key, placement eligibility, product-order strategy, importance class, and bounded ranking profile SHALL be server-owned. The initial registry MUST include `STANDARD`, `FLASH_SALE`, and `CHEAPEST_DEALS` with the Vietnamese label “Rẻ Vô Địch”. `FLASH_SALE` MUST use the `FEATURED` importance class; every other initial type and every newly registered type MUST default to `NORMAL` unless a reviewed server configuration explicitly assigns a supported class. New campaign types MUST be addable through a versioned registry and validated policy contract without creating a separate participation, reservation, pricing, or checkout domain. A campaign type MUST become immutable when the campaign is published, and disabling a type MUST prevent new campaigns without changing existing campaign history.

#### Scenario: Admin creates a Flash Sale campaign

- **WHEN** an admin selects the enabled `FLASH_SALE` type for a valid draft
- **THEN** the campaign uses the featured importance class, Flash Sale policy and presentation while retaining the common lifecycle, seller participation, pricing, and canonical banner route

#### Scenario: Admin creates a normal campaign

- **WHEN** an admin selects `STANDARD`, `CHEAPEST_DEALS`, or another enabled type without an explicit reviewed importance override
- **THEN** the campaign uses the normal importance class and lower bounded ranking profile

#### Scenario: A new campaign type is introduced

- **WHEN** a new enabled type with a supported policy and presentation key is registered
- **THEN** admins can create campaigns of that type without adding another discount or seller-participation data model

#### Scenario: Admin changes type after publication

- **WHEN** an admin attempts to change the type of a published campaign
- **THEN** the command conflicts and preserves the published type, policy version, seller eligibility, and placement behavior

### Requirement: Typed campaign collections use campaign data as their source

Homepage and buyer merchandising collections for a campaign type SHALL be derived only from active campaigns of that type and their currently eligible accepted products. The existing Flash Sale collection MUST use active `FLASH_SALE` campaign data, and a “Rẻ Vô Địch” collection MUST use active `CHEAPEST_DEALS` campaign data. Type-specific presentation and product ordering MAY differ, but displayed price, availability, campaign identity, and active boundaries MUST come from the common authoritative campaign and pricing rules. If no matching active campaign exists, the collection MUST be omitted or show its configured empty behavior without falling back to independent promotional prices.

#### Scenario: Flash Sale campaign becomes active

- **WHEN** an active `FLASH_SALE` campaign has accepted sellable products with valid campaign prices
- **THEN** the Flash Sale homepage collection displays those products using the campaign window, ordering policy, and central effective prices

#### Scenario: Flash Sale has no active campaign

- **WHEN** no eligible `FLASH_SALE` campaign is active
- **THEN** the Flash Sale collection does not present stale products or a separate Flash Sale price source

#### Scenario: Rẻ Vô Địch uses a distinct presentation

- **WHEN** an active `CHEAPEST_DEALS` campaign is placed on the homepage
- **THEN** the buyer sees the “Rẻ Vô Địch” presentation and ordering while participation, discount validation, checkout, and campaign identity remain common

### Requirement: Campaign lifecycle derives from authoritative schedule

A campaign SHALL have announcement, enrollment-start, enrollment-end, start, and exclusive end timestamps satisfying `announceAt <= enrollmentStartsAt < enrollmentEndsAt <= startsAt < endsAt`. Its public lifecycle SHALL derive as `DRAFT`, `ANNOUNCED`, `ENROLLMENT_OPEN`, `SCHEDULED`, `ACTIVE`, `ENDED`, or `CANCELLED` from publication/cancellation state and database time; reaching a time boundary MUST NOT depend on a successful state-flipping cron mutation.

#### Scenario: Enrollment opens

- **WHEN** database time reaches `enrollmentStartsAt` for a published non-cancelled campaign
- **THEN** reads derive the campaign as `ENROLLMENT_OPEN` and eligible sellers may submit participation

#### Scenario: Campaign becomes active

- **WHEN** database time reaches the inclusive `startsAt` before `endsAt`
- **THEN** reads and pricing derive the campaign as `ACTIVE`

#### Scenario: Invalid timeline

- **WHEN** an admin submits timestamps that violate the required ordering
- **THEN** the command fails atomically with field-specific errors

### Requirement: Admin controls campaign content, eligibility, publication, and cancellation

An authenticated admin SHALL create, read, edit, preview, publish, list, filter, and cancel campaigns. Buyer-facing copy MUST include a nonblank title and nonblank restricted content. An image URL and alternative text MAY be supplied as homepage-card media. The system MUST NOT require a separate call-to-action label or an admin-editable public destination; homepage and card navigation MUST always use `/banner/:bannerId`. A campaign MUST also define an enabled campaign type, schedule, minimum discount basis points, and optional eligible category scope, and MUST satisfy the selected type's versioned policy. Preview MUST render the selected type without persisting or publishing unsaved input. The campaign type MUST be immutable after publication; after enrollment opens, the schedule, category scope, minimum discount, and type-governed economic rules MUST also be immutable. Title and content MAY be corrected without changing campaign economics. Cancellation MUST stop future participation, campaign pricing, typed homepage placement, and ranking boost without rewriting historical order or participation records.

#### Scenario: Admin previews a draft

- **WHEN** an admin previews valid unsaved campaign content
- **THEN** the system returns the selected campaign type's buyer presentation without persisting, publishing, notifying, or auditing a successful mutation

#### Scenario: Admin changes economics after enrollment opens

- **WHEN** an admin attempts to change the minimum discount, eligible categories, or schedule after enrollment has opened
- **THEN** the system rejects the change and preserves the campaign and seller submissions

#### Scenario: Campaign violates its type policy

- **WHEN** an admin submits a product limit, discount rule, placement, or ordering option not allowed by the selected campaign type
- **THEN** the command fails with field-specific policy errors and no campaign data is changed

#### Scenario: Admin cancels an active campaign

- **WHEN** an admin confirms cancellation with a bounded reason
- **THEN** campaign price and discovery boost cease for subsequent evaluations while prior order snapshots and participation history remain unchanged

### Requirement: Buyer campaign visibility is truthful

The campaign detail SHALL be publicly readable from announcement through the exclusive end time and SHALL show whether it is upcoming, accepting seller enrollment, scheduled, active, ended, or cancelled. The homepage campaign-banner module MUST include every published, non-cancelled campaign whose derived lifecycle is `ACTIVE`, represented by that campaign's single banner, with `href` `/banner/:bannerId`. Draft, announced, enrollment-open, scheduled, ended, cancelled, unpublished, and content-invalid campaigns MUST be omitted from that homepage list. Public participating-product cards MUST occur only during `[startsAt, endsAt)`. Missing, malformed, draft, or unannounced identifiers MUST return the same sanitized not-found outcome.

#### Scenario: Multiple campaigns are running

- **WHEN** two published campaigns are inside `[startsAt, endsAt)`
- **THEN** the homepage campaign-banner module includes both banners and each banner navigates to its own `/banner/:bannerId`

#### Scenario: Campaign is announced but not yet running

- **WHEN** a published campaign is `ANNOUNCED`, `ENROLLMENT_OPEN`, or `SCHEDULED`
- **THEN** its banner is absent from the homepage campaign-banner module while `/banner/:bannerId` remains readable after announcement

#### Scenario: Buyer opens an announced future campaign

- **WHEN** the canonical banner URL is requested after announcement but before campaign start
- **THEN** the page shows the title, content, and start time without presenting campaign prices as active

#### Scenario: Buyer opens an active campaign

- **WHEN** an active campaign has sellable participating products with effective discounts
- **THEN** the page shows the title, content, remaining time, and those products with truthful base and campaign prices

#### Scenario: Campaign ends

- **WHEN** database time reaches the exclusive `endsAt` of a previously running campaign
- **THEN** its banner is omitted from the homepage campaign-banner module

#### Scenario: Participating product becomes unavailable

- **WHEN** a participating product or shop is hidden, suspended, deleted, or out of sellable inventory
- **THEN** the product is omitted without making the rest of the campaign unavailable

### Requirement: Platform campaign pricing uses the central resolver

An accepted campaign product SHALL store a discount satisfying both the campaign and selected type policy, from the effective minimum through 9000 basis points, without changing variant base prices. During the active half-open window, the central resolver SHALL apply at most one valid product-level discount source, calculate with integer minor units, expose campaign identity, campaign type, and evaluation time, and re-evaluate price at cart quote and checkout. A product MUST NOT have an overlapping enabled seller-owned or platform campaign discount window regardless of campaign type.

#### Scenario: Campaign price activates

- **WHEN** an accepted product is sellable and its platform campaign becomes active
- **THEN** every eligible variant receives the centrally calculated campaign price and honest comparison price

#### Scenario: Existing shop campaign overlaps

- **WHEN** seller enrollment would overlap an enabled `ShopDiscountCampaign` for the same product
- **THEN** participation is rejected for that product with a conflict that identifies the seller-owned schedule to resolve

#### Scenario: Campaign expires between quote and checkout

- **WHEN** the campaign ends after quote but before checkout commits
- **THEN** checkout uses current authoritative pricing and refreshes or rejects stale expectations without changing earlier orders

### Requirement: Campaign mutations are versioned, idempotent, and audited

Campaign create, publish, cancel, and other retryable actions SHALL require canonical idempotency keys; equivalent retries SHALL replay the original outcome and changed-input reuse SHALL conflict. Updates SHALL require the current version. Successful admin mutations and cancellation MUST record bounded privileged audit metadata without copying full formatted content or signed media URLs.

#### Scenario: Publish response is lost

- **WHEN** an admin retries the same publish command with the same idempotency key
- **THEN** the original result is replayed without duplicate notifications or lifecycle events

#### Scenario: Stale admin editor saves

- **WHEN** an admin submits a campaign update using an obsolete version
- **THEN** the update conflicts and no campaign, banner, participation, or audit state is partially changed
