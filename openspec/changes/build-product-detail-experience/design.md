## Context

See `proposal.md` for motivation and `specs/product-detail/spec.md` for observable behavior. T03 supplies `Product`, flat `ProductVariant`, `Inventory`, `ProductImage`, `Shop`, and `Category`; T08/T09 already define public-product eligibility, safe integer money, representative offers, product cards, and `/products/:id` links. The current product route is an honest T10 placeholder, all visitors are anonymous until T11, and persistent cart/checkout starts later.

The existing model has product-level images only, one image per seeded product, and no variant option-dimension model. T10 therefore treats each existing `ProductVariant` row as one complete valid combination. It must resolve variant-specific media without inventing color/size axes, shipping rates, authenticated state, reservations, review records, or order-derived sales.

## Goals / Non-Goals

**Goals:**

- Preserve one server-authoritative public-product and money/stock policy across listing and detail paths.
- Return a conservative, serializable detail contract that supports an SSR page plus a small interaction island.
- Associate gallery media with a variant using relational integrity and deterministic fallbacks.
- Make anonymous purchase intent useful for T11/T15 without claiming a cart, order, or stock mutation today.
- Extend the isolated test runner without making quick development commands migrate, seed, build, or mutate the local database.

**Non-Goals:**

- Option-axis generation, invalid Cartesian option matrices, seller media management, image uploads, zoom services, or remote image hosts.
- Authentication, refresh sessions, persistent carts, checkout, address-aware shipping quotes, vouchers, orders, or inventory reservation.
- Review bodies/distributions, live rating aggregation, real order-derived sales, shop badges/following, or recommendation ranking.
- Client polling, realtime stock, optimistic inventory, or database writes from the product page.

## Decisions

### 1. Extend catalogue with one product-detail read model

`GET /api/v1/catalog/products/:productId` remains under the catalogue capability and returns a new shared `ProductDetailResponse`; it does not create a parallel product module or reuse the list response. The contract contains product/category/shop/rating facts, `gallery`, `variants`, `initialVariantId`, `purchasable`, `shippingPreview`, and `relatedProducts` using the existing card shape.

The endpoint validates a lowercase canonical UUID before repository access, returns the same 404 for every non-public product, and uses the existing no-store/sanitized Problem Details boundary. A dedicated contract prevents a detail payload from weakening T09 list parsing or leaking Prisma records. Adding optional fields to `CatalogProductCard` was rejected because variant inventory and gallery semantics are not list concerns.

### 2. Add an optional same-product variant association to images

`product_images.variant_id` becomes a nullable UUID. The migration adds the necessary composite uniqueness/reference on variants and a composite foreign key from `(product_id, variant_id)` to the same product's variant, so an image cannot reference a variant owned by another product; null continues to mean generic product media. The relation uses deletion behavior compatible with existing restricted variant lifecycle, and existing rows remain valid without backfill.

Seed data adds ordered generic and variant images for the primary multi-variant products and makes one otherwise-public variant deterministically out of stock. This is additive except for expected seed counts/facts. A JSON media map was rejected because it would lose referential integrity; adding full color/size option tables was rejected as premature for the flat persisted variants.

### 3. Share eligibility and card mapping, but keep detail availability broader

The catalogue mapper for safe money, valid discounts, images, and related cards is extracted so T09 and T10 cannot diverge. Detail lookup enforces active/non-deleted product, shop, and category rules. It includes every active/non-deleted variant with safe price and inventory facts, including zero-stock variants, because buyers must see and understand an unavailable choice; list/related cards continue to require at least one active in-stock offer.

Available quantity is calculated as on-hand minus reserved and must be a safe non-negative integer. Unsafe price/inventory variants are returned only when they can be represented honestly; they are never purchasable. Variants are ordered by `priceMinor ASC, id ASC`. `initialVariantId` is the first purchasable variant in that order, falling back to the first representable variant or null. This makes server and browser initialization identical.

### 4. Resolve media with stable IDs rather than client URL guessing

Gallery order is `sortOrder ASC, id ASC`; the primary image is the first item. Each variant carries `preferredImageId`, chosen as its first associated image, then the primary generic/product image, then null. The client stores only `selectedVariantId`, `activeImageId`, and quantity. Selecting a variant moves to its preferred image; manually selecting another thumbnail changes the image without changing the offer. This avoids deriving a media association from SKU/name strings.

### 5. Compute related products as a bounded catalogue query

After the primary detail query, the repository fetches at most six other T08-displayable candidates from the same category ordered by `createdAt DESC, id ASC`. Mapping and eligibility happen before the final six-card limit when inventory makes a database candidate undisplayable. The current ID is excluded. This is explicitly related context, not personalized recommendation; a hardcoded placeholder list was rejected because product links and prices would drift from the database.

### 6. Keep shipping preview honest and server-owned

The API returns origin from `shop.location`, destination label `Toàn quốc`, null fee/time fields, and Vietnamese explanatory copy that checkout will confirm address-specific terms. The UI does not calculate or imply free shipping. Persisting fake carrier tables or a constant fee was rejected because T13/T19/T24 own the inputs and authority needed for a real quote.

### 7. Use SSR for data and one client island for selection

The route validates `productId`, fetches through a server-only adapter with a short timeout and runtime parsing, calls the App Router not-found path for malformed/404 products, and renders a recoverable state for other failures. A serializable response is passed to a `ProductDetailExperience` client component that owns gallery thumbnails, flat variant buttons, quantity input/steppers, live status text, and purchase links. Description, shop, rating, shipping, and related cards stay semantically present in the rendered page.

Keeping the whole page client-fetched was rejected because it would duplicate error/CORS/loading behavior and weaken first render. Making every component server-only was rejected because offer/media/quantity changes require immediate accessible interaction.

### 8. Serialize anonymous purchase intent from trusted detail state only

For a valid selection the client constructs `/login` with fixed `intent` (`add-to-cart` or `buy-now`), fixed internal `returnTo=/products/<response product id>`, selected returned variant ID, and validated quantity. No incoming URL is copied. Controls label that sign-in is required and do not display success feedback. The T11 login placeholder may show the preserved safe intent context but still collects no credentials in T10.

Session storage, local cart state, cookies, and a fake POST endpoint were rejected because each would create persistence or authentication behavior owned by later tasks.

### 9. Add a focused product-detail verification lane

Contract, repository/service, Supertest, adapter, selection-helper, and Testing Library tests cover malformed data and all offer transitions. Seed verification asserts cross-product image integrity and unavailable fixtures. A guarded real-PostgreSQL suite covers public/non-public products, generic/variant media, stock, and related exclusion.

The runner gains `product-detail` selection plus `test:e2e:product:quick`, `test:e2e:product`, and screenshot-update scripts. Quick mode uses already-running services and skips all data mutation. The isolated mode creates its own Compose project, deploys/seeds/verifies, runs only guarded product-detail database tests, builds, runs the three Playwright viewports, and proves exact cleanup. Existing homepage/catalog quick gates remain development regression checks; GitHub Actions stays manual-only.

## Risks / Trade-offs

- **[A flat variant name is less expressive than Shopee option axes]** → Present it as one complete variant choice and defer option-dimension modeling until seller catalogue requirements demand it.
- **[Exposing available quantity is a point-in-time read, not a reservation]** → Label stock as current availability, perform no mutation, and require future cart/checkout to revalidate atomically.
- **[Composite image/variant relations increase migration complexity]** → Add an additive nullable column, verify same-product foreign-key rejection in real PostgreSQL, and keep generic null associations backward compatible.
- **[Anonymous intent cannot complete before T11/T15]** → Use an honest login handoff with no success claim and document the contract for later consumption.
- **[Two catalogue queries can drift between primary and related reads]** → Use stable ordering/shared mapping and accept snapshot-level consistency at current scale; a transaction is unnecessary for non-critical browsing.
- **[SSR payload includes all active variants/gallery entries]** → Keep seed/catalogue bounds small for T10 and measure before introducing pagination or a separate media endpoint.

## Migration Plan

1. Add the nullable variant image relation and composite integrity migration without changing existing rows.
2. Extend deterministic seed/verification data and deploy the migration idempotently in an isolated database.
3. Ship the shared contract and backend endpoint before the frontend begins consuming it.
4. Replace the placeholder route, add the client interaction island, then enable focused browser tests.
5. On rollback, restore the placeholder/adapter/API/contract together, then reverse the unused nullable relation only if required; existing generic image rows remain valid and no buyer data needs cleanup.
