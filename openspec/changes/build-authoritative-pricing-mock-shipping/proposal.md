## Why

The cart currently exposes current merchandise subtotals but has no reusable, authoritative quote for discounts, shipping, or final payable totals. T17 establishes one server-owned calculation boundary now so the cart and the future T19 checkout cannot diverge or trust client-supplied money.

## What Changes

- Add a server-authoritative commerce quote that reloads selected cart lines, current variant prices, availability, and the buyer-owned destination before calculating money.
- Standardize all VND calculations on non-negative safe integers where one minor unit equals one VND, with explicit overflow and rounding rejection.
- Itemize list-price merchandise, product discounts, selling-price merchandise, per-shop shipping components, and final payable totals.
- Add deterministic mock shipping services calculated per shop from normalized shop origin, destination province, total shipment weight, and selected service.
- Extend product-variant persistence and canonical dataset import with deterministic weight data needed by shipping calculations.
- Integrate the quote into the authenticated cart screen and provide a stable API/contract seam that T19 checkout will reuse.
- Add table-driven unit, contract, PostgreSQL API, component, and quick browser coverage plus documentation and the T17 flow diagram.
- Keep vouchers, taxes, inventory reservation, real carrier APIs, and order creation out of scope.

## Capabilities

### New Capabilities

- `authoritative-pricing`: Defines authenticated server-owned cart quotes, integer-VND arithmetic, itemized merchandise/discount totals, stale-cart protection, and a calculator shared by cart and future checkout.
- `mock-shipping`: Defines deterministic per-shop shipping services and itemized fees derived from origin, destination, shipment weight, and service without calling a real carrier.

### Modified Capabilities

None. The repository has no synchronized main capability for cart pricing or shipping yet; this change introduces both behaviors as new delta specs.

## Impact

- **Persistence and dataset:** Prisma product variants, migration/backfill, seed/import normalization, and verification gain positive `weightGrams` data.
- **Backend:** A NestJS pricing module owns quote orchestration and pure calculators; authenticated cart APIs expose quote creation using current PostgreSQL facts and buyer-owned addresses.
- **Contracts:** Shared framework-neutral quote, money, shipping-service, request, response, parser, and Problem Details contracts are added.
- **Frontend:** The cart lets an authenticated buyer choose an owned address and per-shop mock service, then renders only server-confirmed itemized totals.
- **Testing/docs:** Table-driven calculator tests, ownership/tampering/rounding tests, responsive quick E2E coverage, OpenAPI documentation, commerce docs, and `flow.md` are updated.
