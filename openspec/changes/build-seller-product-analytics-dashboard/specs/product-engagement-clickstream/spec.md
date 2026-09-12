## Purpose

Phân biệt các bước hiển thị, click, mở trang chi tiết và thêm giỏ để seller analytics phản ánh đúng hành vi mua hàng.

## ADDED Requirements

### Requirement: Product views are captured separately from discovery clicks
The system SHALL capture one `product_viewed` event when a product detail page is successfully presented for a product. This event MUST be distinct from clicks recorded on product cards in listing, search, homepage, and recommendation surfaces.

#### Scenario: Buyer opens a product detail page from search
- **WHEN** the buyer clicks a tracked search result and the product detail page is presented
- **THEN** the pipeline contains one discovery click event and one separate product view event

### Requirement: Seller funnel event definitions are stable
For seller analytics, Impressions MUST count `product_impression` and `recommendation_impression`; Clicks MUST count `product_clicked` and `recommendation_clicked`; Product Views MUST count `product_viewed`; and Add to Cart MUST count only authoritative `cart_changed` events whose action is `add`. Events MUST be scoped by the server-enriched `shopId` and `productId`.

#### Scenario: Cart quantity is updated
- **WHEN** a buyer changes the quantity of an existing cart line without adding a new line or quantity from a product flow
- **THEN** the event is not counted as Add to Cart

#### Scenario: Buyer interacts with a recommendation
- **WHEN** a recommendation card is displayed and then selected
- **THEN** its recommendation impression and recommendation click contribute to the corresponding seller metrics

### Requirement: Unique visitors use pseudonymous identity
Unique Visitors MUST count distinct product-detail viewers using `buyerPseudonym` when present and otherwise `sessionPseudonym`. Raw identifiers, email addresses, and other direct personal data MUST NOT be added to the analytics event.

#### Scenario: Anonymous visitor views the same product repeatedly in one session
- **WHEN** the same anonymous session produces multiple product view events for a product during one period
- **THEN** that session contributes one Unique Visitor for the product and one Unique Visitor for the shop summary

### Requirement: Existing training consumers remain compatible
Adding `product_viewed` MUST NOT change the meaning of existing impression/click training labels or require historical raw objects to contain the new event type.

#### Scenario: Training job reads older raw partitions
- **WHEN** a raw partition contains no `product_viewed` event because it predates this change
- **THEN** the existing impression/click training flow continues processing that partition without schema failure
