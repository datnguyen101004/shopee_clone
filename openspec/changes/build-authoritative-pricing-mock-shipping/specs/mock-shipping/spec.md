## Purpose

Defines deterministic per-shop mock delivery services and itemized shipping fees from persisted origin, destination, shipment weight, and service inputs until real carrier adapters are introduced.

## ADDED Requirements

### Requirement: Persist a positive shipping weight for every variant

Every purchasable product variant SHALL have a positive integer `weightGrams`. Existing rows and imported dataset records with no source weight SHALL receive a documented deterministic fallback, while new writes SHALL reject zero, negative, fractional, or unsafe weight values.

#### Scenario: Import a record without weight

- **WHEN** canonical source data omits product weight
- **THEN** normalization generates a repeatable positive gram value, persists it, and records that the field was generated

#### Scenario: Backfill an existing variant

- **WHEN** the schema migration encounters a variant created before T17
- **THEN** it assigns the documented positive fallback before enforcing the non-null and positive constraints

#### Scenario: Reject invalid weight

- **WHEN** a variant write attempts a zero, negative, fractional, or out-of-range weight
- **THEN** persistence rejects the value before it can participate in a shipping quote

### Requirement: Offer a fixed versioned mock service catalog

Calculation version `mock-v1` SHALL expose `ECONOMY`, `STANDARD`, and `EXPRESS` for every non-empty shop shipment. Their base fees SHALL be 15,000 VND, 22,000 VND, and 35,000 VND respectively, with documented estimated delivery windows of 4–6, 2–4, and 1–2 days. An omitted shop service SHALL default to `STANDARD`; an unknown service SHALL be rejected.

#### Scenario: Default a missing shop choice

- **WHEN** a request omits the service for an included shop
- **THEN** the quote uses `STANDARD` and reports that service explicitly

#### Scenario: Select a supported service

- **WHEN** the buyer selects `ECONOMY`, `STANDARD`, or `EXPRESS` for an included shop
- **THEN** the returned shipment uses the corresponding base fee and estimated delivery window

#### Scenario: Reject an unsupported service

- **WHEN** the request submits a service code outside the versioned catalog or repeats a shop selection
- **THEN** strict validation returns sanitized `400` Problem Details and no quote

### Requirement: Calculate deterministic zone and weight components

The mock calculator SHALL normalize shop location and destination against the legacy 63-province snapshot. Zone surcharge SHALL be 0 VND for the same province, 6,000 VND for different provinces in the same north/central/south macro-region, and 12,000 VND across regions or when a location cannot be normalized. The first 500 grams SHALL be included in the base fee; each started additional 500-gram block SHALL cost 3,000 VND for `ECONOMY`, 4,000 VND for `STANDARD`, or 6,000 VND for `EXPRESS`.

#### Scenario: Ship within one province

- **WHEN** origin and destination normalize to the same legacy province and shipment weight is at most 500 grams
- **THEN** zone and weight surcharges are zero and the shipping fee equals the selected service base fee

#### Scenario: Ship a heavier cross-region parcel

- **WHEN** a 1,200-gram shipment crosses macro-regions using `STANDARD`
- **THEN** the quote itemizes 22,000 VND base, 12,000 VND zone, two 4,000 VND additional-weight blocks, and 42,000 VND total shipping

#### Scenario: Normalize an unknown location safely

- **WHEN** origin or destination cannot be matched after documented accent, case, whitespace, and common-prefix normalization
- **THEN** the calculator deterministically applies the cross-region surcharge rather than returning a cheaper ambiguous fee

### Requirement: Calculate one shipment per selected shop

The system SHALL aggregate eligible selected quantities by canonical shop, calculate total shipment weight as the checked sum of `weightGrams × quantity`, and apply exactly one selected/default service and one shipping fee per non-empty shop. It SHALL return origin, destination, weight, service, fee components, and shop payable total without combining different shops into one shipment.

#### Scenario: Quote multiple shops

- **WHEN** selected eligible lines belong to two shops
- **THEN** the response contains two independently calculated shipments and the overall shipping total equals their exact sum

#### Scenario: Quote multiple lines from one shop

- **WHEN** several selected variants belong to the same shop
- **THEN** their checked weights are aggregated and exactly one zone and service fee is charged for that shop

#### Scenario: Exclude an invalid line from shipment weight

- **WHEN** a selected cart line is not currently eligible for pricing
- **THEN** its quantity contributes neither weight nor shipping cost

### Requirement: Keep mock shipping pure and reproducible

For the same calculation version, canonical shop facts, destination, variants, quantities, and service selections, the mock shipping result SHALL be independent of request order, clock time, random values, browser state, and external networks. The response SHALL label the provider as mock so it cannot be mistaken for a real carrier promise.

#### Scenario: Repeat identical calculations

- **WHEN** identical logical inputs are submitted in different line or service-selection order
- **THEN** the itemized shipping result and totals are identical apart from no fields

#### Scenario: Calculate without a carrier network

- **WHEN** no external carrier service is available
- **THEN** the mock quote remains available and clearly identifies `provider: MOCK`

### Requirement: Let buyers compare per-shop mock services

The cart SHALL display the three mock services, delivery windows, and authoritative fee for every quoted shop and SHALL request a new server quote when the buyer changes address or a shop's service. The client SHALL preserve the previous confirmed quote only as visibly stale while a replacement is pending and SHALL never calculate the fee itself.

#### Scenario: Change one shop service

- **WHEN** the buyer changes one shop from `STANDARD` to `EXPRESS`
- **THEN** the client requests a complete new quote and replaces all totals only after validating the server response

#### Scenario: Change destination

- **WHEN** the buyer selects another owned shipping address
- **THEN** the client requests a quote using that address and the current service choices without deriving a zone surcharge locally
