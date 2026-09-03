## Purpose

Provides buyers with a scheduled, API-driven marketplace homepage whose campaign, category, and product modules remain useful and honest across normal, empty, partial, and unavailable-data conditions.

## ADDED Requirements

### Requirement: Public homepage API returns active modules in configured order

The system SHALL expose `GET /api/v1/homepage` without requiring authentication. Each successful response SHALL include the server evaluation time and a deterministically ordered list containing only enabled modules whose optional UTC activation window contains that evaluation time.

#### Scenario: Request during active campaign window

- **WHEN** enabled modules have started, have not expired, and have distinct configured display positions
- **THEN** the endpoint returns those modules in configured order with an ISO 8601 UTC evaluation time

#### Scenario: Request outside a module window

- **WHEN** a module is disabled, has a future start time, or has reached its exclusive end time
- **THEN** the endpoint omits that module without treating the request as an error

#### Scenario: Equal display positions

- **WHEN** two active modules have the same configured display position
- **THEN** the endpoint applies a stable secondary ordering so repeated requests return the same sequence

### Requirement: Homepage modules use typed buyer-facing payloads

The homepage response MUST represent campaign banners, category shortcuts, mock Flash Sale, curated top-selling products, Mall-style products, and daily recommendations as a discriminated module union. Every module SHALL have a stable identifier, type, display order, heading metadata, and a payload valid for that type.

#### Scenario: Resolve a campaign banner module

- **WHEN** an active campaign module contains valid seeded banners
- **THEN** the response includes their ordered Vietnamese copy, optional media, schedule metadata, and safe internal destinations

#### Scenario: Resolve category shortcuts

- **WHEN** an active category module references enabled, non-deleted categories
- **THEN** the response includes ordered category labels and catalogue query destinations for those categories

#### Scenario: Resolve a product-backed module

- **WHEN** an active Flash Sale, top-selling, Mall-style, or daily recommendation module references an active product from an active shop
- **THEN** the response includes a product summary with opaque identifier, name, shop, primary media or explicit fallback, integer-minor-unit price, valid optional compare-at price, presentation metadata, and stable product-detail destination

#### Scenario: Referenced catalogue record is unavailable

- **WHEN** a configured item references a deleted, inactive, or otherwise non-displayable catalogue record
- **THEN** the endpoint omits that item and continues resolving the other configured items

### Requirement: Module availability degrades independently

The API SHALL omit an active module when none of its configured items can be rendered, while preserving every other valid module. A successful response with zero modules SHALL remain a valid empty homepage response rather than fabricating campaign or product data.

#### Scenario: One module becomes empty

- **WHEN** one configured module has no renderable items but other modules remain valid
- **THEN** the response omits only the empty module and returns the remaining modules normally

#### Scenario: Every module is empty or inactive

- **WHEN** no configured homepage module is currently renderable
- **THEN** the endpoint returns success with an empty module list and the server evaluation time

#### Scenario: Homepage data source fails

- **WHEN** the backend cannot read the homepage configuration or catalogue data
- **THEN** the endpoint returns an `application/problem+json` service error without exposing database, stack, or credential details

### Requirement: Storefront renders API modules without hardcoded commerce fallback

The buyer homepage SHALL obtain its commerce modules from the public homepage API and render each recognized module according to its discriminated type. It MUST NOT silently replace an empty or failed API response with hardcoded campaign, category, or product content.

#### Scenario: Homepage request succeeds

- **WHEN** the API returns one or more recognized modules
- **THEN** the storefront renders those modules in response order inside the existing buyer shell

#### Scenario: Homepage request is pending

- **WHEN** navigation reaches the homepage while server data is still loading
- **THEN** the storefront exposes labelled, non-interactive skeletons that preserve the expected page hierarchy without announcing fake product content

#### Scenario: Homepage response is empty

- **WHEN** the API returns a valid response with zero modules
- **THEN** the storefront renders a calm marketplace empty state with a useful catalogue action

#### Scenario: Homepage request fails

- **WHEN** the API is unreachable, times out, returns an invalid contract, or returns a server error
- **THEN** the storefront renders an explicit failure state with a retry action while the global header and navigation remain usable

#### Scenario: Response contains an unknown module type

- **WHEN** the storefront receives a module type it does not recognize alongside valid known modules
- **THEN** it ignores the unknown module, renders the known modules, and does not crash the page

### Requirement: Homepage links use stable non-broken buyer destinations

Every rendered campaign, category, and product action SHALL use a non-empty, safe internal destination supplied or derived by the backend. Product cards MUST link to a stable product-detail route that returns a buyer-facing page even before the full T10 product detail capability is available.

#### Scenario: Open a category shortcut

- **WHEN** a buyer activates a homepage category shortcut
- **THEN** the browser reaches `/search` with the corresponding category query parameter

#### Scenario: Open a product card before T10

- **WHEN** a buyer activates a homepage product card before full product details are implemented
- **THEN** the browser reaches an honest product-detail placeholder inside the shared storefront shell instead of a missing route

#### Scenario: Seeded destination is unsafe

- **WHEN** a configured destination is empty, external, or not an allowed buyer path
- **THEN** the API excludes that action or item rather than returning an unsafe link

### Requirement: Homepage remains responsive and accessible

The rendered homepage SHALL preserve semantic section headings, meaningful media alternatives, visible keyboard focus, at least 44 CSS pixel primary touch targets, and no document-level horizontal overflow at the 360×800, 768×1024, and 1440×900 reference viewports.

#### Scenario: Navigate homepage modules by keyboard

- **WHEN** a keyboard user traverses campaign, category, and product actions
- **THEN** each interactive item receives focus in visual order with a visible focus indicator and an informative accessible name

#### Scenario: Render each reference viewport

- **WHEN** the API-driven homepage renders at a supported reference viewport
- **THEN** all returned module types remain readable and operable without document-level horizontal overflow

#### Scenario: Inspect automated accessibility rules

- **WHEN** automated accessibility analysis runs against populated, empty, and failure homepage states
- **THEN** no serious or critical violation is reported
