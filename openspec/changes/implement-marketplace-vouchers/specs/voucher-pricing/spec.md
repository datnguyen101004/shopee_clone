## Purpose

Defines how eligible vouchers participate in the authoritative cart quote, reconcile exact VND totals, and remain usable by both the cart UI and future checkout.

## ADDED Requirements

### Requirement: Accept voucher codes only at the authenticated pricing boundary

`POST /api/v1/cart/quote` SHALL remain authentication-required, Origin-protected, private, non-cacheable, and guarded by the current cart `If-Match`. Its optional voucher selection SHALL contain at most one platform merchandise code, at most one shop merchandise code for each selected shop, and at most one free-shipping code. The request SHALL accept no voucher ID, eligibility flag, discount rate, discount amount, subtotal, fee, or payable total from the browser.

#### Scenario: Request a promotion-aware quote

- **WHEN** an authenticated buyer submits canonicalizable codes, an owned address, service choices, and the current cart ETag
- **THEN** the system reloads the current cart and voucher definitions before returning a server-owned quote

#### Scenario: Attempt to forge a discount

- **WHEN** the request contains an undocumented amount, rate, issuer, usage, subtotal, or eligibility field
- **THEN** exact-key validation returns sanitized `400` Problem Details and no supplied value influences pricing

### Requirement: Version the promotion-aware quote contract

The promotion-aware response SHALL identify `pricingVersion: "pricing-v2"`, `voucherVersion: "voucher-v1"`, `shippingVersion: "mock-v1"`, and currency `VND`. It SHALL always include exact voucher selection results and zero-valued voucher discount fields even when no code is supplied, so strict clients observe one stable shape.

#### Scenario: Quote without vouchers

- **WHEN** the buyer supplies no voucher selection
- **THEN** the response remains a valid `pricing-v2` quote with no applied or rejected vouchers and every voucher discount equal to zero

#### Scenario: Old strict client reads the new contract

- **WHEN** a consumer supports only `pricing-v1`
- **THEN** it rejects the response rather than silently interpreting promotion-aware totals with the old contract

### Requirement: Apply only the approved voucher slots

The calculator SHALL apply at most one shop merchandise voucher per included shop, one platform merchandise voucher per complete quote, and one free-shipping voucher per complete quote. A shop slot SHALL match its requested shop; the platform and shipping slots SHALL match their benefit types. Unknown, unavailable, or ineligible codes SHALL be returned as rejected selections and SHALL NOT make an otherwise valid quote fail.

#### Scenario: Stack approved voucher types

- **WHEN** two selected shops each have one eligible shop voucher and the quote also has eligible platform and free-shipping vouchers
- **THEN** all four selections can apply in their documented slots without applying more than one shop voucher to either shop

#### Scenario: Put a voucher in the wrong slot

- **WHEN** a free-shipping code is submitted as a merchandise voucher or a shop code is assigned to another shop
- **THEN** the quote succeeds with that selection rejected by `TYPE_MISMATCH` or `SCOPE_MISMATCH` and grants no benefit from it

### Requirement: Calculate fixed and percentage benefits with exact integer VND

A fixed merchandise benefit SHALL be capped by its eligible remaining merchandise base. A percentage benefit SHALL use integer basis points, floor `eligible base × basis points ÷ 10,000`, apply its configured maximum discount, and never exceed its eligible remaining base. Free-shipping benefit SHALL never exceed its configured cap or the eligible authoritative shipping fee. Minimum spend SHALL always use the scope-eligible selling-price merchandise subtotal before any voucher discount.

#### Scenario: Floor a percentage discount

- **WHEN** a percentage calculation does not divide into an integer VND amount
- **THEN** the benefit rounds down exactly and no binary floating-point rate participates

#### Scenario: Cap a fixed benefit by remaining value

- **WHEN** a fixed voucher is larger than its eligible remaining merchandise base
- **THEN** its discount equals that remaining base and never creates a negative payable amount

#### Scenario: Cap free shipping

- **WHEN** eligible shipping costs exceed a free-shipping voucher's maximum benefit
- **THEN** only the configured maximum is discounted and the remaining shipping stays payable

### Requirement: Use one deterministic calculation and allocation order

The system SHALL calculate current catalog markdowns first, then apply each shop merchandise voucher in canonical shop order, then the platform merchandise voucher, and finally the free-shipping voucher. Later merchandise vouchers SHALL use value remaining after earlier voucher allocations while eligibility minimum spend remains based on pre-voucher eligible merchandise. Merchandise discounts SHALL be allocated proportionally across eligible line value using largest remainder with canonical `(shop ID, line ID)` as the final tie-breaker; shipping discounts SHALL use eligible fee and canonical shop ID.

#### Scenario: Shop and platform vouchers overlap

- **WHEN** both vouchers cover the same merchandise
- **THEN** the shop benefit applies first and the platform benefit cannot discount value already removed by the shop voucher

#### Scenario: Allocation has a remainder

- **WHEN** a platform or shipping benefit cannot be divided evenly between eligible shops
- **THEN** proportional allocation plus canonical tie-breaking distributes every VND exactly and produces the same result regardless of request or database row order

### Requirement: Return applied and rejected voucher evidence

The response SHALL return each requested canonical code, requested slot and shop when applicable, acceptance state, stable rejection reason when rejected, display-safe voucher metadata when found, and exact merchandise or shipping discount when applied. It SHALL NOT expose internal counters, other buyers' usage, unpublished definitions, or raw database errors.

#### Scenario: Mix eligible and rejected codes

- **WHEN** some selected vouchers apply and another is expired
- **THEN** the quote itemizes the applied discounts, reports `EXPIRED` for the rejected code, and calculates payable totals from applied vouchers only

#### Scenario: Preview an unknown code

- **WHEN** a syntactically valid code has no visible voucher definition
- **THEN** the quote reports `NOT_FOUND` without leaking internal records or failing the other quote calculations

### Requirement: Reconcile line, shop, voucher, and quote totals exactly

The quote SHALL preserve T17 list subtotal, product discount, merchandise subtotal, and pre-voucher shipping fields. It SHALL additionally return shop, platform, merchandise-voucher, shipping-voucher, and total-voucher discounts with allocations whose sums reconcile. Final payable SHALL equal `merchandise subtotal + shipping total - merchandise voucher discount - shipping voucher discount`, and no shop or quote amount SHALL be negative or unsafe.

#### Scenario: Reconcile a multi-shop discounted quote

- **WHEN** several approved vouchers apply across multiple shops
- **THEN** every voucher discount equals its allocations, every shop payable equals its pre-voucher value minus allocated benefits, and the quote summary equals the exact sum of shops

#### Scenario: No effective selected lines

- **WHEN** the cart has no currently eligible selected lines
- **THEN** the response is a valid zero quote, every voucher is rejected with no eligible items as applicable, and no shipping or voucher benefit is invented

### Requirement: Recalculate vouchers for future checkout

A cart quote SHALL remain informational. Future checkout SHALL reload current cart, catalog, address, shipping, voucher, and usage facts and run the same versioned calculation inside its transaction before consuming the resulting applied voucher set. It SHALL NOT trust codes, discounts, eligibility, or totals copied from a prior response.

#### Scenario: Voucher changes after quote

- **WHEN** a voucher expires, reaches a limit, is disabled, or changes scope after the buyer sees a quote
- **THEN** checkout recalculation reflects the new state and does not consume the stale preview benefit

#### Scenario: Identical authoritative snapshots

- **WHEN** cart quote and checkout provide identical authoritative facts, evaluation instant, versions, and selected codes
- **THEN** they produce structurally and monetarily identical voucher results

### Requirement: Present voucher preview accessibly in the cart

The authenticated cart SHALL let buyers enter or remove one platform code, one free-shipping code, and one shop code per displayed shop, then request a complete new quote. The client SHALL render only validated server discounts and localized explanations for stable rejection reasons, mark old totals unavailable while requoting, and preserve practical keyboard, focus, touch, responsive, loading, empty, and retry behavior at 360, 768, and 1440 pixel widths.

#### Scenario: Apply an eligible code

- **WHEN** a buyer submits a code from the cart
- **THEN** the screen requotes the current cart and shows the server-confirmed benefit in its slot and total summary

#### Scenario: Show a rejection reason

- **WHEN** the server rejects a voucher for minimum spend, activity, limit, type, or scope
- **THEN** the corresponding control shows a clear localized explanation without discarding other confirmed quote details

#### Scenario: Change cart inputs after applying vouchers

- **WHEN** the buyer changes selection, quantity, address, or shipping service
- **THEN** the screen marks previous voucher totals stale and requests a full replacement quote using the latest ETag and retained code selections
