## 1. Product-authoring contract and server rules

- [x] 1.1 Remove seller-controlled slug and SKU inputs from product write contracts, then generate immutable server-owned product slugs and variant SKUs during product creation and combination generation.
- [x] 1.2 Filter `mobile` and `kitchen` from seller category discovery and reject either legacy category at the server validation boundary.
- [x] 1.3 Add contract and backend tests for generated/immutable slugs and SKUs, category exclusion, the default no-classification variant, and deterministic Color × Size stock combinations.

## 2. Seller Center experience

- [x] 2.1 Add a responsive `/seller` layout with a left-side Seller Center navigation, route active state, and links only to live shop-profile and product-management pages.
- [x] 2.2 Redesign the product editor with Vietnamese explanations of classification groups, values, and generated variants; add actions for the first/second group and group values; automatically refresh combinations; and collect stock for each generated row without manual variant-row insertion.
- [x] 2.3 Add frontend coverage for Seller Center navigation, responsive-safe markup, system-managed identifiers, dynamic group/value controls, and Color/Size combination stock behavior.

## 3. Verification and documentation

- [x] 3.1 Add or update end-to-end coverage for creating products with and without classifications, verifying generated identifiers and independently entered stock for each generated combination.
- [x] 3.2 Update `flow.md` and seller-product documentation with the Seller Center navigation, automatic slug/SKU behavior, and classification guidance.
- [x] 3.3 Run focused contract, API, frontend, and browser tests plus strict OpenSpec validation.
