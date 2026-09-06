## Purpose

Notifies eligible sellers about voluntary platform campaigns at useful moments while preventing duplicate, unauthorized, or preference-bypassing promotional delivery.

## ADDED Requirements

### Requirement: Campaign announcement targets eligible sellers once

When a published campaign reaches `announceAt`, the system SHALL identify active approved seller shops with at least one potentially eligible published product under the campaign type and campaign rules and emit one deduplicated `PROMOTIONS` notification per eligible seller account. The notification MUST identify the localized campaign type, summarize the campaign, enrollment deadline, event window, effective type/campaign conditions, and deep link to `/seller/campaigns/:campaignId` without enrolling the seller.

#### Scenario: Campaign announcement becomes due

- **WHEN** the announcement worker evaluates a newly due campaign more than once
- **THEN** each eligible seller receives at most one announcement notification for that campaign version

#### Scenario: Seller has no eligible product category

- **WHEN** a category-scoped campaign is announced and a seller owns no potentially eligible product in scope
- **THEN** that seller receives no campaign invitation

### Requirement: Non-responders receive one bounded deadline reminder

The system SHALL emit at most one reminder for an eligible seller who remains `UNRESPONDED` at the configured reminder point before `enrollmentEndsAt`. Joined, declined, withdrawn, ineligible, suspended, and deactivated sellers MUST NOT receive that reminder. A reminder that becomes due after enrollment has closed MUST be skipped.

#### Scenario: Seller has not responded before deadline

- **WHEN** the reminder point is reached while enrollment remains open
- **THEN** one reminder notification is delivered with the remaining deadline and campaign deep link

#### Scenario: Seller already declined

- **WHEN** the reminder worker evaluates a declined participation
- **THEN** no reminder is created

### Requirement: Campaign delivery reuses preferences and resilient channels

Campaign notifications SHALL use the existing in-app and email delivery engine under the `PROMOTIONS` category, honor the recipient's channel preferences, make in-app availability independent of email failure, and retry transient email failures with the existing bounded policy. Campaign messages MUST NOT be classified as mandatory notifications.

#### Scenario: Seller disabled promotional email

- **WHEN** a campaign announcement is routed for a seller who disabled `PROMOTIONS` email
- **THEN** no campaign email is queued while allowed in-app delivery follows the current preference policy

#### Scenario: Email delivery times out

- **WHEN** an allowed campaign email fails transiently
- **THEN** the in-app notification remains available and the email attempt follows bounded retry without duplicating the notification

### Requirement: Notification navigation preserves seller authorization

Opening a campaign notification SHALL mark it read under existing inbox behavior and navigate to the seller campaign route. The destination MUST independently enforce authentication, seller role, approved shop state, campaign eligibility, and ownership-safe participation reads.

#### Scenario: Non-seller opens copied deep link

- **WHEN** an account without eligible seller access opens a campaign deep link
- **THEN** the campaign workspace denies access without exposing seller participation data
