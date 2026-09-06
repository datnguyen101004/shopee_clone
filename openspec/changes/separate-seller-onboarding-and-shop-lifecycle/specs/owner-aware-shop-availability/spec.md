## Purpose

Prevent public discovery and new purchases from shops whose owners are suspended, while preserving independent shop status and existing transaction history.

## ADDED Requirements

### Requirement: Effective availability includes owner eligibility
A shop SHALL be publicly available and eligible for new selling only when the shop is non-deleted, approved and active and its owner is non-deleted and active. Product visibility MUST additionally preserve existing product, category and variant eligibility rules. Missing owner eligibility MUST fail closed. Private owner/admin views MUST distinguish stored shop status from effective availability without leaking internal restriction details to buyers.

#### Scenario: Shop active but owner suspended
- **WHEN** a buyer requests a shop or product whose shop is approved/active but owner is suspended
- **THEN** public access is unavailable and the response exposes no internal suspension reason

#### Scenario: Owner active but shop suspended
- **WHEN** the owner remains active while the shop is suspended
- **THEN** the shop and its products are publicly unavailable

#### Scenario: Owner restored and shop eligible
- **WHEN** the owner is restored and the shop is still approved/active/non-deleted
- **THEN** the shop can become public again subject to existing product eligibility, without rewriting shop or product lifecycle statuses

### Requirement: Public discovery and direct routes consistently hide unavailable shops
Catalog, product detail, public shop pages, shop product lists, search, homepage, recommendations, campaign/banner product listings and other public discovery surfaces SHALL exclude unavailable shops and products. A previously indexed, recommended or cached identifier MUST NOT bypass the current eligibility decision after suspension commits. Direct routes MUST return the established unavailable/not-found presentation. New responses MUST enforce this rule; already-rendered browser content is not required to disappear through a new push mechanism.

#### Scenario: Stale search candidate
- **WHEN** a search index still returns a product after its owner has been suspended
- **THEN** the public response excludes the product after checking current eligibility

#### Scenario: Stale cached shop page
- **WHEN** a request arrives after owner suspension for a previously cached shop page
- **THEN** the system does not serve the old sellable page as current public content

#### Scenario: Shop-scoped campaign entry
- **WHEN** a public campaign or banner contains a now-ineligible shop/product reference
- **THEN** it cannot expose a purchasable listing or working public shop link for that reference

### Requirement: New purchases revalidate effective eligibility
Cart admission, cart availability, pricing/checkout eligibility and creation of a new purchase SHALL reject unavailable shops using current owner and shop state. Stale client state or an earlier successful quote MUST NOT authorize a new purchase after suspension. Concurrent purchase admission and suspension MUST have a defined transactional ordering: a suspension committed first MUST prevent later purchase admission. Existing purchase/payment completion and historical orders MUST NOT be automatically canceled, refunded or deleted by this change.

#### Scenario: Shop becomes unavailable after add to cart
- **WHEN** a buyer opens or checks out a cart containing a product whose owner has since been suspended
- **THEN** the item is shown as unavailable and cannot be included in a new purchase

#### Scenario: Quote predates owner suspension
- **WHEN** a new purchase is submitted using a quote obtained before suspension took effect
- **THEN** current eligibility is revalidated and purchase creation is rejected without partial orders or reservations

#### Scenario: Purchase predates suspension
- **WHEN** a valid purchase was already created before suspension and a payment callback arrives later
- **THEN** the existing idempotent payment/order lifecycle continues without this change introducing an automatic cancellation or refund

### Requirement: Personal history is preserved without public selling access
Existing order/return snapshots and historical communication SHALL remain available under their existing access controls. Personal favorites, followed-shop and recently-viewed references MUST either omit unavailable entities or show the existing unavailable placeholder without an active shop/product purchase link. These records MUST NOT become a bypass into public selling routes or be silently deleted merely because of suspension.

#### Scenario: Buyer views an earlier order
- **WHEN** a buyer opens their order from a shop whose owner is now suspended
- **THEN** authorized order history remains visible while public shop/product navigation remains unavailable

#### Scenario: Followed shop becomes unavailable
- **WHEN** a buyer opens a saved or followed-shop list containing an unavailable shop
- **THEN** the reference is omitted or presented as unavailable without a live public selling entry
