# Public shop storefront, following, and followed-shop list

T15 adds a public shop profile/catalog and private buyer following without changing the canonical product-card rules used by `/search`.

## Screens

- `/shops/{shopSlug}` renders the active shop profile, marketplace aggregates, category-aware product discovery, pagination, favorite buttons, and follow state.
- `/products/{productId}` links the shop identity to its storefront.
- `/account/followed-shops` renders the authenticated buyer's paginated followed shops and supports confirmed unfollow.
- Unknown, inactive, deleted, and non-canonical shops share the same public not-found presentation.

The shop header uses a deterministic text initial and CSS banner. Logo/banner persistence and seller management remain outside T15. Response rate/time are explicitly shown as unavailable; the UI does not invent those metrics.

## HTTP endpoints

All routes are under the `/api/v1` prefix and return `Cache-Control: no-store`.

### Public reads

- `GET /shops/{shopSlug}` returns the active, non-deleted public profile. Unknown, inactive, and deleted shops all return the same privacy-safe `404` Problem Details.
- `GET /shops/{shopSlug}/products` accepts only `q`, `category`, `sort`, `page`, and `pageSize`.

Shop catalog bounds:

- `q`: normalized whitespace, at most 120 characters.
- `category`: canonical category slug; selecting a parent includes descendants.
- `sort`: `relevance`, `newest`, `best-selling`, `price-asc`, or `price-desc`.
- `page`: positive integer, default `1`.
- `pageSize`: `1..48`, default `12`.

Facets are computed from all displayable products in that shop, so filtering does not make category choices disappear. An out-of-range page returns an empty item list with unchanged canonical totals.

### Authenticated buyer state

- `GET /account/followed-shops?page=1&pageSize=20` returns only the authenticated buyer's relationships, ordered by `followedAt DESC, shopId ASC`. Page size is bounded to `1..48`.
- `GET /account/followed-shops/status?shopIds={id1,id2}` accepts 1–48 distinct canonical UUIDs and preserves request order. Unknown/unavailable shops return `isFollowing: false`.
- `PUT /account/followed-shops/{shopId}` follows an active shop. It is idempotent, preserves the first `followedAt` timestamp under repeat/concurrent requests, and returns the confirmed follower count. Following your own shop returns `409`.
- `DELETE /account/followed-shops/{shopId}` removes only the authenticated buyer's relation. It is idempotent and also works after the shop becomes unavailable. In that case `followerCount` is `null` rather than leaking non-public shop state.

Mutations require the existing trusted-origin guard in addition to a valid bearer session. The frontend calls these routes only through `authenticatedFetch`; it never stores follow state, tokens, shop IDs, or queued guest actions in browser storage.

The list keeps inactive and soft-deleted relationships removable but projects them as unavailable with only `id`, retained name, and `href: null`. It never exposes their slug, location, follower count, or lifecycle details. Hard-deleting a shop removes the relationship through the existing database cascade. Public shops include their canonical storefront link, current location, and current grouped follower count.

T15.1 reuses the existing `(user_id, followed_at DESC, shop_id)` index. It does not change the Prisma schema and introduces no migration.

## Aggregate formulas

- Active products and category counts include only products accepted by the canonical catalog displayability and presentation projection.
- Sold count is the safe-integer sum of active product sold counts.
- Rating count is the safe-integer sum of active product rating counts.
- Shop rating is `round(sum(productRatingBasisPoints × productRatingCount) / sum(productRatingCount))`; an empty rating set yields `0`.
- Follower count is read from persisted `shop_followers` relations.

## Local verification

Start PostgreSQL and both applications, then inspect:

```bash
npx --yes pnpm@10.34.5 infra:up
npx --yes pnpm@10.34.5 db:migrate:deploy
npx --yes pnpm@10.34.5 db:seed
npx --yes pnpm@10.34.5 dev
```

Open a product, select its shop name, then check profile metrics, keyword/category/sort controls, pagination, favorites, guest sign-in handoff, and authenticated follow/unfollow. After following a shop, open **Tài khoản → Shop đang theo dõi** or `/account/followed-shops`; verify available/unavailable cards, pagination, confirmed removal, retry behavior, and the preceding-page fallback.

Focused verification:

```bash
npx --yes pnpm@10.34.5 --filter @shopee-clone/contracts test
npx --yes pnpm@10.34.5 --filter @shopee-clone/api test -- shop-storefront
npx --yes pnpm@10.34.5 --filter @shopee-clone/web test -- shop-storefront shop-follow shop-catalog
$env:RUN_SHOP_STOREFRONT_DATABASE_TESTS='1'; npx --yes pnpm@10.34.5 --filter @shopee-clone/api exec jest --runInBand test/shop-storefront.postgres.e2e.spec.ts
npx --yes pnpm@10.34.5 test:e2e:shop:quick
```

The quick browser suite uses real public read-only shop/catalog data but intercepts session, private followed-shop lists, status, and follow mutations. It does not mutate the developer database. The guarded PostgreSQL suite verifies real ordering, page boundaries, current aggregate counts, owner isolation, unavailable retention/removal, and hard-delete cascade behavior. Automatic CI triggers remain disabled.
