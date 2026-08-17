## Why

Seller product management currently opens as isolated screens and makes the seller manually enter a public product slug. This creates unnecessary entry errors and does not give the seller a coherent Shop management area.

## What Changes

- Add a persistent Seller Center layout at `/seller` with a left-side navigation for shop management and product-management destinations.
- Generate a product slug and every SKU on the server; the seller no longer enters or edits either identifier.
- Exclude the legacy `mobile` and `kitchen` categories from the seller product-category selector, while retaining their existing public catalogue data.
- Make product option groups and variants explicitly optional in the seller editor; sellers add named groups and values, then the editor automatically generates the variant rows whose per-variant stock the seller completes.

## Capabilities

### New Capabilities

- `seller-console-product-authoring-refinements`: Seller Center navigation, automatic product identifiers, eligible-category filtering, and optional classification/variant authoring behavior.

### Modified Capabilities

- None.

## Impact

- Affected Next.js `/seller` routes, seller navigation shell, product editor UX, shared seller-product contract, and NestJS product creation service.
- Existing product URLs remain stable after creation; no external dependency or database migration is required.
