# Seller onboarding and shop profile (T22)

Buyer accounts submit one validated registration to open a shop. Administrator approval is the only elevation gate: it grants the seller role and activates the shop in the same transaction. Inactive and suspended shops cannot sell.

## Screens

- `/seller` remains the role-gated seller entry and links to profile management.
- `/seller/shop` is available to authenticated buyers for registration and correction, then becomes the owner profile editor after approval.
- `/admin` includes a placeholder that posts only `shopId`, `decision`, and `reason`; approval explicitly grants seller access.

Guests see the existing sign-in handoff. Buyers can see only their registration state, while seller-only navigation and operating controls appear only after the refreshed session includes `seller`. The UI uses `authenticatedFetch` only and does not persist shop payloads in browser storage.

## HTTP endpoints

All routes are under `/api/v1` and return `Cache-Control: no-store`.

### Seller

- `GET /seller/shop` — unchanged T12 safe summary (`id`, `slug`, `name`, `status`). Missing owned shop is still `403`.
- `GET /seller/shop/workspace` — `{ shop: SellerShopProfile | null }` for the authenticated buyer/seller owner.
- `POST /seller/shop` — buyer creates one pending, inactive registration. The account does not receive `seller` yet. A second live shop, or a slug/name clash, returns `409`.
- `PATCH /seller/shop/registration` — a buyer updates a pending/rejected registration. Updating a rejected registration submits it again as pending/inactive and clears its old rejection reason.
- `PATCH /seller/shop` — seller-only owner profile update after approval. The seller can switch only approved shop state between active and inactive; sellers cannot set `suspended`.

Ownership is always loaded from `shops.owner_id` and the session. Soft-deleted shops do not count as a live duplicate; a new create is allowed. Global `slug` uniqueness still reserves soft-deleted slugs.

### Admin placeholder

- `POST /admin/shops/{shopId}/approval` with `{ "decision": "approve" | "reject", "reason": string }`.
- Approve atomically grants the owner `seller`, then sets `approved` + `active`. Reject sets `rejected` + `inactive`, stores the reason, and keeps the owner buyer-only.
- Repeating the same decision and reason is idempotent. Unknown shops return sanitized `404`.

## Sellability

A shop can sell only when it is non-deleted, `active`, and `approved`. Public catalog, shop storefront, homepage displayability, cart eligibility, and checkout confirmation treat inactive and suspended shops as not sellable. Buyers do not receive a distinct suspension reason.

## Local verification

```powershell
npx --yes pnpm@10.34.5 db:migrate:deploy
npx --yes pnpm@10.34.5 db:seed
npx --yes pnpm@10.34.5 --filter @shopee-clone/contracts test
npx --yes pnpm@10.34.5 --filter @shopee-clone/api test -- seller-onboarding marketplace-ownership
npx --yes pnpm@10.34.5 --filter @shopee-clone/web test -- seller-shop
$env:RUN_SELLER_ONBOARDING_DATABASE_TESTS='1'; npx --yes pnpm@10.34.5 --filter @shopee-clone/api exec jest --runInBand test/seller-onboarding.postgres.e2e.spec.ts
npx --yes pnpm@10.34.5 test:e2e:auth:quick
```

Existing seed shops are backfilled to `approved` so catalog data stays sellable. Automatic CI triggers remain disabled.
