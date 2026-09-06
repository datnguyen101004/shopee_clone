## Purpose

Allows eligible sellers to make a voluntary, ownership-safe, and time-bounded decision about platform campaigns and the discounted products they submit.

## ADDED Requirements

### Requirement: Sellers discover only campaigns relevant to their shop

An authenticated approved seller SHALL list and read announced campaigns available to the seller's active shop, with stable pagination and filters for campaign type, available, joined, upcoming, active, and ended campaigns. A campaign with category eligibility SHALL be available only when the shop owns at least one otherwise eligible product in scope. Seller reads MUST include the localized campaign type and presentation label, schedule, effective type/campaign conditions, minimum discount, response status, and owned submitted products without exposing another seller's response or private data.

#### Scenario: Eligible seller opens campaign workspace

- **WHEN** an approved seller owns an active product in an eligible category
- **THEN** the campaign appears with its timeline, conditions, and the seller's current response

#### Scenario: Seller addresses another shop's participation

- **WHEN** a seller requests a participation resource owned by another shop
- **THEN** the system returns a non-enumerating denial and exposes no products or response state

### Requirement: Participation is voluntary and follows a bounded state machine

During `ENROLLMENT_OPEN`, a seller SHALL be able to join with products, explicitly decline, revise an existing submission, or withdraw. The authoritative participation state SHALL be `UNRESPONDED`, `JOINED`, `DECLINED`, `WITHDRAWN`, or `LOCKED`; a draft product selection in the browser MUST NOT count as joined. At `enrollmentEndsAt`, a joined response becomes locked and all other response states become immutable for that campaign.

#### Scenario: Seller joins a campaign

- **WHEN** the seller submits at least one valid product and discount during enrollment
- **THEN** one joined participation is persisted and subsequent reads return the accepted product set

#### Scenario: Seller declines

- **WHEN** the seller confirms “Không tham gia” during enrollment
- **THEN** the response becomes declined without enrolling products

#### Scenario: Seller withdraws before cutoff

- **WHEN** a joined seller confirms withdrawal before enrollment ends
- **THEN** the response becomes withdrawn and its products cannot receive campaign price or boost

#### Scenario: Seller edits after cutoff

- **WHEN** a seller attempts to join, decline, revise, or withdraw at or after `enrollmentEndsAt`
- **THEN** the command conflicts, the response is derived as locked where applicable, and stored selections remain unchanged

### Requirement: Submitted campaign products satisfy all eligibility rules

Every submitted product MUST belong to the seller's resolved shop, be non-deleted, published, moderation-active, category-eligible, contain at least one active price-safe variant, satisfy the selected campaign type's versioned product-count, price, inventory, and other eligibility policy, and use a discount from the effective type/campaign minimum through 9000 basis points. The product MUST NOT have an overlapping enabled product discount campaign of any type. Invalid products SHALL be reported with seller-safe reasons and the command MUST be atomic.

#### Scenario: Seller submits eligible products

- **WHEN** all selected products are owned, sellable, in scope, non-overlapping, and meet the minimum discount
- **THEN** the complete product set and rates are accepted atomically

#### Scenario: One selected product belongs to another shop

- **WHEN** a submission mixes owned identifiers with a foreign product identifier
- **THEN** the entire command fails without revealing which foreign record exists

#### Scenario: Product conflicts with shop promotion

- **WHEN** a selected product has an overlapping enabled seller-owned campaign
- **THEN** that conflict is explained safely and no submitted product changes are persisted

#### Scenario: Flash Sale product violates its type rule

- **WHEN** a seller submits a product that satisfies common campaign rules but violates the published `FLASH_SALE` policy
- **THEN** the product receives a seller-safe type-specific reason and the complete participation command remains atomic

### Requirement: Participation mutations resist retries and stale editors

Join, decline, revise, and withdraw commands SHALL require an idempotency key and current participation version where a record exists. Equivalent retries SHALL return the original result; changed-input key reuse and stale versions SHALL conflict. Mutations MUST re-evaluate database time and product eligibility inside one transaction.

#### Scenario: Join response is lost

- **WHEN** a seller retries the equivalent join request with the same idempotency key
- **THEN** the original participation is returned without duplicate products or events

#### Scenario: Enrollment closes during submission

- **WHEN** a seller starts before cutoff but the transactional evaluation occurs at or after cutoff
- **THEN** the command is rejected and no partial participation is committed

### Requirement: Seller campaign screens explain decisions and corrections

Seller Center SHALL provide `/seller/campaigns` and `/seller/campaigns/:campaignId` with campaign-type labels and filters, type-specific presentation and conditions, responsive tabs, timeline, product selection, discount preview, conflict explanations, confirmations, and loading, empty, stale, unauthorized, and unavailable states. Unsaved choices SHALL survive a rejected submission so the seller can correct them.

#### Scenario: Product is not eligible

- **WHEN** an owned product is hidden, out of scope, price-unsafe, or promotion-conflicted
- **THEN** it remains visible with selection disabled and a specific safe correction message

#### Scenario: Save fails validation

- **WHEN** the API rejects the submitted selection
- **THEN** the screen retains entered discounts, maps errors to affected products, and permits resubmission before cutoff
