## Purpose

Cung cấp cho seller một màn hình phân tích thống nhất để theo dõi phễu hiển thị, truy cập, mua hàng và doanh thu của shop theo thời gian.

## ADDED Requirements

### Requirement: Seller can select an analytics period
The system SHALL let an authenticated seller select `Today`, `Yesterday`, `Last 7 days`, `Last 30 days`, or a custom inclusive date range of no more than 31 calendar days. The system MUST interpret calendar boundaries in the current shop time zone and MUST reject a future-only or invalid range.

#### Scenario: Seller selects a preset
- **WHEN** the seller selects one of the four preset periods
- **THEN** the dashboard requests and displays analytics for the server-resolved period in the shop time zone

#### Scenario: Seller selects a custom period
- **WHEN** the seller selects valid start and end dates spanning no more than 31 calendar days
- **THEN** the dashboard displays analytics for the inclusive custom period

### Requirement: Dashboard exposes the complete seller funnel
The system SHALL show Impressions, Product Views, Unique Visitors, Clicks, CTR, Add to Cart, Orders, Units Sold, Revenue, and Conversion Rate for the seller's current shop. CTR MUST equal `clicks / impressions`; Conversion Rate MUST equal `orders / unique visitors`; a zero denominator MUST produce a zero rate.

#### Scenario: Seller reads shop summary metrics
- **WHEN** the selected period contains tracked engagement and eligible orders
- **THEN** the dashboard displays all ten metrics using server-authoritative counts, rates, and VND revenue

#### Scenario: Period contains no activity
- **WHEN** the selected period contains no tracked engagement and no eligible orders
- **THEN** every count and amount is zero and both rates are displayed as zero rather than an error or infinity

### Requirement: Every metric is compared with the immediately preceding period
For every metric, the system MUST return the current value, previous value, and relative percentage change against the immediately preceding period of equal duration. If both values are zero, change MUST be `0`; if the previous value is zero and the current value is positive, change MUST be represented as `new` rather than infinity.

#### Scenario: Metric increases from a non-zero previous value
- **WHEN** Revenue is 12,450,000 VND in the current period and its previous-period value is lower
- **THEN** the dashboard displays the current value and the correctly calculated positive percentage change

#### Scenario: New activity has no previous baseline
- **WHEN** a metric is positive in the current period and zero in the previous period
- **THEN** the dashboard displays the metric as new activity without an infinite percentage

### Requirement: Comparison periods are fair for partial days
For `Today`, the current period MUST run from local midnight to the request time and the previous period MUST cover the same elapsed duration on the previous day. `Yesterday` MUST compare the complete previous local day with the complete day before it. Other periods MUST compare with the immediately preceding range of the same elapsed duration.

#### Scenario: Seller opens Today before the day ends
- **WHEN** the seller opens the dashboard at 15:00 shop-local time
- **THEN** current metrics cover today from 00:00 to 15:00 and previous metrics cover yesterday from 00:00 to 15:00

### Requirement: Seller can inspect trends and product rows
The dashboard SHALL show an hourly trend for `Today` and `Yesterday`, a daily trend for longer periods, and a number-paginated product table. Every product row MUST expose the same ten metrics and previous-period comparison as the shop summary, scoped to that product.

#### Scenario: Seller opens a multi-day period
- **WHEN** the seller selects `Last 7 days`, `Last 30 days`, or a multi-day custom period
- **THEN** the dashboard shows daily trend points and product rows for that range

#### Scenario: Product had no orders
- **WHEN** a product had engagement but no eligible order during the current period
- **THEN** its engagement metrics remain visible and its Orders, Units Sold, Revenue, and Conversion Rate values are zero

### Requirement: Analytics are owner scoped
The system MUST derive the shop from the authenticated seller account and MUST NOT accept a caller-provided shop identifier as authority. Returned totals, trends, and products MUST belong only to that shop.

#### Scenario: Seller requests analytics
- **WHEN** an authenticated seller calls the seller analytics endpoint
- **THEN** the endpoint derives the current shop from server-owned data and returns only that shop's analytics

### Requirement: Dashboard follows the Seller workspace UI
The `/seller/analytics` page MUST use the existing blue-and-white Seller workspace shell, responsive KPI cards, an accessible trend visualization, and a management table whose actions use accessible icons and number pagination. The page MUST NOT display invented fallback metrics.

#### Scenario: Dashboard has no data
- **WHEN** the API returns valid zero metrics and no product rows
- **THEN** the page renders a truthful empty state within the Seller workspace instead of placeholder analytics
