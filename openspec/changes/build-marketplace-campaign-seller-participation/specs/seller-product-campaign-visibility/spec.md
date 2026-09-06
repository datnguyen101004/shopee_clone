## Purpose

Gives sellers a detailed operational product workspace that makes each product's pricing, inventory, moderation, and platform-campaign participation understandable in context.

## ADDED Requirements

### Requirement: Seller product list exposes bounded operational detail

The seller product workspace SHALL return owned non-deleted product summaries with primary media, name, representative SKU, category, product and moderation states, variant count, base price range, current effective price range, on-hand/reserved/available inventory totals, sold count, rating summary, update time, seller-owned promotion summary, and bounded current/upcoming platform-campaign summaries including campaign type code and localized type label. Results MUST remain stably paginated and ownership isolated.

#### Scenario: Seller lists products with campaigns

- **WHEN** owned products have active or upcoming campaign participation
- **THEN** each row identifies up to the bounded campaign summary limit and reports any additional count without duplicating product rows

#### Scenario: Seller filters by campaign

- **WHEN** the seller filters by campaign identifier and active/upcoming/history state
- **THEN** only owned products matching that participation filter are returned in stable order

### Requirement: Product detail groups campaign participation by lifecycle

The seller product detail SHALL include complete owned product information and bounded campaign entries grouped as active, upcoming or locked, and historical. Each entry MUST include campaign identity, type code and localized type label, seller response, campaign window, submitted discount, calculated campaign price preview where valid, type-specific eligibility/conflict status, and a seller campaign deep link.

#### Scenario: Product is in an active campaign

- **WHEN** the seller opens a product whose accepted campaign is active
- **THEN** the detail shows current campaign price, end time, participation status, and a truthful discovery-priority explanation

#### Scenario: Product has no campaign history

- **WHEN** no platform participation exists for the product
- **THEN** the detail shows a useful empty state and a link to campaigns the shop may join

### Requirement: Product screens present campaign status truthfully

Seller screens MUST distinguish platform campaigns from seller-owned promotions, identify overlaps or ineligibility, and MUST NOT expose internal model weights, personal scores, buyer profiles, or claim an absolute search position. The active label SHALL explain only that an eligible campaign product receives bounded priority among relevant results.

#### Scenario: Seller views discovery benefit

- **WHEN** an active eligible product receives campaign ranking boost
- **THEN** the product screen says it is prioritized among relevant results and explains that relevance, quality, inventory, and filters still apply

#### Scenario: Campaign discount is inactive

- **WHEN** the campaign is upcoming, ended, cancelled, withdrawn, or the product is no longer sellable
- **THEN** the screen does not present campaign price or discovery priority as active

### Requirement: Product campaign surfaces are responsive and accessible

The seller product list and detail campaign sections SHALL support table presentation on desktop and labelled cards on narrow viewports, keyboard-operable filters and campaign chips, visible focus, non-color status labels, and no document-level overflow at 360×800, 768×1024, and 1440×900.

#### Scenario: Mobile seller inspects campaign chips

- **WHEN** a seller activates a product campaign chip on a narrow viewport
- **THEN** labelled campaign details expand within the product card without requiring hover or horizontal page scrolling
