## Purpose

Provide a coherent seller management workspace and remove avoidable manual product-authoring inputs while retaining reliable product URLs and catalogue integrity.

## ADDED Requirements

### Requirement: Seller Center navigation shell
The system SHALL render seller-management routes within a Seller Center shell that presents a left-side navigation on desktop and a usable compact navigation on narrow viewports. The navigation MUST expose only destinations that are available to the authenticated seller, identify the current section, and include the existing shop-profile and product-management destinations.

#### Scenario: Seller enters product management
- **WHEN** an authenticated seller opens a seller-management route
- **THEN** the Seller Center shell displays the shop and product management navigation with the current destination visually identified

#### Scenario: Narrow viewport navigation
- **WHEN** the Seller Center is rendered on a narrow viewport
- **THEN** the seller can reach each available management destination without horizontal overflow or a permanently hidden navigation item

### Requirement: Server-generated immutable product identifiers
The system SHALL generate the public slug for each newly created seller product from its normalized product name and a collision-resistant hash derived at creation time. The system SHALL also generate a unique SKU for its default variant and for every generated option combination. A product creation or update request MUST NOT require or accept a seller-provided slug or SKU, and later name edits MUST NOT change the generated slug or an existing variant SKU.

#### Scenario: Product draft receives generated slug
- **WHEN** a seller creates a product draft named “Áo thun nam”
- **THEN** the stored and returned slug uses the normalized name with a creation-time-derived hash suffix

#### Scenario: Seller renames an existing product
- **WHEN** a seller changes the name of an existing product
- **THEN** its previously generated public slug remains unchanged

#### Scenario: Product without classification receives a SKU
- **WHEN** a seller creates a product without option groups
- **THEN** the system assigns a generated SKU to its one default variant without seller SKU input

#### Scenario: Product classification creates variant SKUs
- **WHEN** a seller supplies one or two option groups and saves the generated combinations
- **THEN** the system assigns a distinct generated SKU to every new combination and preserves the SKU of a retained combination

### Requirement: Eligible seller product categories
The system SHALL exclude categories with slug `mobile` and `kitchen` from seller product authoring and SHALL reject a create or update attempt that selects either category. Existing buyer-facing catalogue data in those categories MUST remain readable through existing public flows.

#### Scenario: Category selector omits retired seller categories
- **WHEN** a seller opens the product editor
- **THEN** neither `mobile` nor `kitchen` is offered as a selectable category

#### Scenario: Direct request uses excluded category
- **WHEN** a seller submits a product create or update request for a category whose slug is `mobile` or `kitchen`
- **THEN** the system rejects the request with a validation Problem Details response

### Requirement: Optional classification and generated variants
The system SHALL permit a seller to create and publish a product without product option groups. In that case, the product MUST use one default variant. The editor MUST clearly explain that a classification group is a buyer-selectable property such as Color or Size and that a variant is a sellable combination. It MUST provide an action to add a first and, at most, a second named classification group, and an action to add values within each group. When the seller supplies one or two groups, the system SHALL automatically generate the corresponding variant combinations and require per-variant stock input before publication; the seller MUST NOT manually create a duplicate variant row.

#### Scenario: Product without classification
- **WHEN** a seller leaves product classification blank and completes the default variant data
- **THEN** the product can be saved and published without a color, size, or other option group

#### Scenario: Product with two classification groups
- **WHEN** a seller adds Color values `Đỏ`, `Xanh` and Size values `M`, `L`
- **THEN** the editor presents `Đỏ · M`, `Đỏ · L`, `Xanh · M`, and `Xanh · L` as generated variant rows

#### Scenario: Seller completes generated variant stock
- **WHEN** generated variant rows are visible
- **THEN** the seller can enter a separate stock quantity for each row while its SKU remains system-managed
