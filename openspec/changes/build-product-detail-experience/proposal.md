## Why

T08/T09 now expose server-backed product cards whose primary links still land on a placeholder, so buyers cannot inspect a product or choose a purchasable offer before later cart work begins. T10 turns that handoff into a trustworthy product-detail experience using the existing catalogue, shop, variant, inventory, and media data while keeping authentication and persistent commerce state in their later roadmap tasks.

## What Changes

- Add a public, versioned product-detail read endpoint with product, category, shop, gallery, rating/sales summary, active variants, server-authoritative prices/discounts, available stock, shipping preview, and simple same-category related products.
- Add variant-aware product media persistence so selecting a flat, valid variant combination can resolve the appropriate price, SKU, stock, discount, and gallery image without exposing unavailable purchase options.
- Replace the `/products/[productId]` placeholder with a responsive server-backed page containing an accessible gallery, description, shop/rating summary, variant and quantity controls, shipping context, related products, and explicit loading/not-found/unavailable/error states.
- Provide add-to-cart and buy-now entry points that reject unavailable selections and route anonymous buyers to the existing login handoff with a safe return path and intent; T10 does not create a cart or claim that a purchase was persisted.
- Add contract, migration/seed, NestJS, Next.js, interaction, accessibility, screenshot, and isolated PostgreSQL/browser verification for the complete detail journey.

## Capabilities

### New Capabilities

- `product-detail`: Defines public product-detail eligibility, gallery and variant resolution, stock/quantity rules, shipping/shop/rating context, anonymous purchase handoff, route states, related products, and responsive accessibility behavior.

### Modified Capabilities

None. Earlier T03/T08/T09 changes have not been synced into `openspec/specs`; T10 consumes their implemented behavior without declaring a modification to a nonexistent main spec.

## Impact

- **Persistence:** Adds an optional variant-to-image association plus deterministic gallery/stock fixtures and an additive Prisma migration; no cart, checkout, review, address, or stock-reservation tables are introduced.
- **Contracts:** Adds framework-neutral product-detail, gallery, variant, shop, shipping-preview, and related-card types with conservative runtime parsing.
- **Backend:** Extends the NestJS catalogue capability with `GET /api/v1/catalog/products/:productId`, strict identifier handling, displayability rules, deterministic offer/media calculations, related products, and sanitized Problem Details failures.
- **Frontend:** Replaces the product placeholder with a dynamic Next.js detail adapter/page and a focused client interaction island for media, variant, quantity, and anonymous purchase intent.
- **Testing/tooling:** Adds real PostgreSQL/API fixtures and a focused product-detail quick/isolated Playwright selector while retaining manual-only GitHub Actions.
