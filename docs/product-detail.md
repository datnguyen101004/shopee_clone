# Product Detail (T10)

## Public endpoint

`GET /api/v1/catalog/products/:productId` returns anonymous, server-authoritative product detail for one lowercase canonical UUID. Successful responses and every product-detail fetch use `Cache-Control: no-store`.

- Malformed IDs return sanitized `400` Problem Details.
- Missing, draft, archived, soft-deleted, inactive-shop, or inactive-category products return the same sanitized `404` response.
- Data-source errors return sanitized `503` Problem Details.

The framework-neutral `ProductDetailResponse` lives in `@shopee-clone/contracts`. It includes identity, description, category, rating/sales display facts, shop context, shipping preview, gallery, flat variants, purchase availability, and up to six eligible related `CatalogProductCard` items.

## Media, variants, and stock

`product_images.variant_id` is nullable. A NULL value is generic product media. A composite foreign key on `(product_id, variant_id)` means an image can reference only a variant of the same product; the database rejects cross-product links. Gallery order is `sortOrder ASC, id ASC`.

Each public active, non-deleted flat variant has a safe integer-minor-unit price, optional valid promotion, current available quantity (`quantityOnHand - quantityReserved`), availability, and preferred image. Zero-stock variants remain visible but cannot be bought. The initial choice is the lowest-priced available variant, then ID; if none is available it falls back to the first representable variant.

The detail page is a point-in-time read. Since T16 it can write the selected variant and quantity to the server-side cart, but it never reserves inventory or promises a price/stock quote at checkout.

## Anonymous purchase intent

For a valid selection, the page sends buyers to the internal `/login` placeholder with only allowlisted fields:

- `intent=add-to-cart` or `intent=buy-now`
- `returnTo=/products/<product-id>`
- returned `productId`, `variantId`, and validated whole-number `quantity`

T10 did not create a session, collect credentials, persist a cart, create an order, or claim a successful purchase. T16 later added authenticated cart persistence and requires login before add-to-cart, while leaving order creation and checkout out of scope. The shipping preview shows the server-owned shop origin and explains that delivery fee and time are confirmed only after an address is known.

## Local verification

```bash
pnpm db:verify
pnpm test:e2e:product:quick # requires pnpm dev plus an already migrated/seeded database
pnpm test:e2e:product       # isolated Docker, migration, seed, PostgreSQL and browser verification
```

`test:e2e:product:quick` only health-checks already-running services and runs the focused Playwright spec. It does not start Docker, migrate, seed, build, or mutate local data. The isolated command owns those mutations and cleans up its temporary Compose project.

## Deliberate T10 non-goals

Color/size option axes, image uploads, checkout, address-aware rates, vouchers, reservations, review bodies, real order-derived sales, realtime stock, and personalized recommendations belong to later roadmap tasks. Authentication and persistent carts were delivered by T11/T16.
