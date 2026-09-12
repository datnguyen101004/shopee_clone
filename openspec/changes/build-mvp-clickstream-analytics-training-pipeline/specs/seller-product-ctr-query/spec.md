## Purpose

Cung cấp cho seller chuỗi thời gian impression, click và CTR của một sản phẩm thuộc shop bằng cách query trực tiếp dữ liệu S3 Raw qua Athena.

## ADDED Requirements

### Requirement: Seller product CTR endpoint

The system SHALL expose `GET /api/v1/seller/analytics/products/:productId/ctr` for an authenticated seller. The endpoint MUST accept a UTC `from`, UTC `to`, and supported `interval`, and MUST return only analytics for a product owned by the seller's current shop.

#### Scenario: Seller queries an owned product

- **WHEN** an authenticated seller requests CTR for a product owned by the seller's current shop and supplies a valid time range
- **THEN** the endpoint queries only that shop and product and returns the requested time-series result

### Requirement: CTR is derived from impression and click events

For every returned time bucket, the system SHALL count `product_impression` events as impressions and `product_clicked` events as clicks. The system MUST calculate `ctr` as `clicks / impressions` and return `bucketStart`, `impressions`, `clicks`, and `ctr` in ascending time order.

#### Scenario: Athena returns product events for a time range

- **WHEN** a requested bucket contains valid impression and click events for the selected shop and product
- **THEN** the endpoint returns their counts and the CTR calculated from those counts for that bucket

### Requirement: Athena queries only relevant raw partitions

The system SHALL expose the S3 Raw schema through the Glue Data Catalog and SHALL constrain each CTR query by the requested UTC date/hour partitions, `shopId`, `productId`, event types, and occurrence time.

#### Scenario: A seller requests a bounded time range

- **WHEN** the endpoint builds the Athena query for the request
- **THEN** the query scans only partitions that overlap the requested range and projects only columns required to calculate the CTR response

### Requirement: Seller isolation is enforced before analytics query execution

The backend MUST establish product ownership from server-owned seller and shop data before starting the Athena query. Client-supplied shop identity MUST NOT determine the authorization scope.

#### Scenario: Ownership is established for a valid request

- **WHEN** the authenticated seller requests an owned product
- **THEN** the backend derives the shop identifier from its trusted authorization context and uses that identifier in the Athena query
