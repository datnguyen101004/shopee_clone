# Buyer favorites and recently viewed products

T14 adds private, authenticated buyer-product relationships without personalizing the public homepage or catalogue contracts. Browser code keeps favorite state in React memory only; it does not store favorites, history, access tokens, or complete relationship collections in URLs, local storage, or session storage.

## API

All routes require a bearer session and return `Cache-Control: no-store`:

- `GET /api/v1/account/favorites?page=1&pageSize=20`
- `GET /api/v1/account/favorites/status?productIds=<uuid>,<uuid>`
- `PUT /api/v1/account/favorites/:productId`
- `DELETE /api/v1/account/favorites/:productId`
- `GET /api/v1/account/recently-viewed?page=1&pageSize=20`
- `PUT /api/v1/account/recently-viewed/:productId`

Browser mutations also pass the existing trusted-origin guard. Page size is at most 48, favorite status accepts at most 48 distinct canonical UUIDs, and each buyer retains at most 100 recent product relationships. PUT and DELETE are idempotent. Re-saving a favorite keeps its original `favoritedAt`; revisiting a product promotes `lastViewedAt`.

Favorite pages retain unavailable saved products with a minimal, non-clickable projection so buyers can remove them. Recently viewed pages omit unavailable products from both items and totals. Public catalogue responses remain unchanged.

History recording locks the active buyer row before the composite upsert and deterministic trim. Favorite insert uses conflict-safe `createMany(..., skipDuplicates)` followed by an owner-scoped read, preventing concurrent inserts from changing the original timestamp.

## Screens

- `/`: batched favorite controls for visible homepage products.
- `/search`: batched favorite controls for the current result page.
- `/products/:productId`: favorite control and one non-blocking authenticated view record per mount.
- `/account/favorites`: protected, paginated available/unavailable favorites with removal.
- `/account/recently-viewed`: protected, paginated displayable recent history.

Guests clicking a favorite control are sent to `/login?returnTo=<current internal path>`. No pending mutation or product engagement value is put in the URL.

## Verification

```bash
npx --yes pnpm@10.34.5 db:verify
npx --yes pnpm@10.34.5 --filter @shopee-clone/contracts test -- engagement.spec.ts
npx --yes pnpm@10.34.5 --filter @shopee-clone/api exec jest --runInBand engagement
$env:RUN_ENGAGEMENT_DATABASE_TESTS='1'; npx --yes pnpm@10.34.5 --filter @shopee-clone/api exec jest --runInBand test/engagement.postgres.e2e.spec.ts
npx --yes pnpm@10.34.5 --filter @shopee-clone/web exec vitest run lib/engagement-api.test.ts components/engagement/favorite-state-provider.test.tsx
npx --yes pnpm@10.34.5 test:e2e:engagement:quick
```

The quick Playwright suite mocks authentication and every engagement response/mutation. It can inspect the real public storefront but cannot mutate the developer database.
