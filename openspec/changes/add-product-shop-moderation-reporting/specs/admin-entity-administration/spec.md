## ADDED Requirements

### Requirement: Product moderation is independent and reversible
An authenticated admin SHALL be able to suspend a non-deleted product and restore a moderation-suspended product with a trimmed reason between 8 and 240 characters. Suspension MUST change only `ProductModerationStatus` and MUST NOT overwrite the seller's draft, published, hidden, or archived lifecycle state. Restore MUST change only moderation state and MUST NOT make a seller-hidden, archived, invalid-category, inactive-shop, or otherwise ineligible product public. Direct admin product actions and moderation-case decisions MUST enforce the same invariants and public purchaseability predicate.

#### Scenario: Admin suspends a published product
- **WHEN** an admin suspends a non-deleted published product with a valid reason
- **THEN** its moderation state becomes suspended while its seller-authored published lifecycle is retained

#### Scenario: Admin restores an archived product
- **WHEN** an admin restores moderation state for an archived product
- **THEN** the moderation state becomes active but the product remains archived and unavailable

### Requirement: Direct and case-driven target actions remain compatible
Existing direct product and shop admin action routes SHALL remain supported for manual operations that have no buyer report. A moderation-case decision MUST call the same authoritative transition rules and produce the same target state as the equivalent direct action. A direct action MUST NOT fabricate a moderation case or seller report; it MUST still produce its existing privileged audit and, when the target state effectively changes, the same seller-safe notice. Repeated commands for an already requested outcome SHALL remain no-op idempotent and MUST NOT duplicate audit or notice records.

#### Scenario: Admin directly suspends an unreported shop
- **WHEN** an admin uses the existing shop action route for an approved active shop with no report case
- **THEN** the shop is suspended, one audit and one seller notice are written, and no synthetic report or case is created

#### Scenario: Case decision targets an already suspended product
- **WHEN** an admin selects suspend for a product already suspended by a direct action
- **THEN** the case resolves with an immutable no-state-change decision and case-targeted audit without duplicating a target-transition audit or seller notice
