## Why

Seller Center currently uses a basic deletion confirmation and leaves soft-deleted product records indefinitely. Sellers need a clearer deletion experience, while the system needs predictable retention cleanup and a more recognizable inventory screen that focuses on products actually published for sale.

## What Changes

- Keep seller product deletion as soft delete: the owned product receives `deletedAt`, immediately disappears from Seller Center/public commerce reads, and can no longer be edited, purchased, or reserved.
- Replace the native/basic confirmation with a responsive custom dialog showing the product image, name, permanent-cleanup warning, keyboard/focus behavior, loading state, and inline API errors.
- Add a server-side recurring cleanup job that runs every day at `04:00` in `Asia/Ho_Chi_Minh` and processes products whose database-derived `deletedAt` is strictly older than seven days.
- Make cleanup idempotent, single-runner safe across multiple API instances, batch bounded, and transactional; products with immutable order, review, reservation, or commerce-linked inventory history remain protected tombstones rather than breaking historical data. Authoring-only stock setup rows may be removed with an otherwise eligible product graph.
- Keep historical reviews usable when their product becomes a tombstone: review/order-history contracts return the stored product snapshot plus an authoritative `productAvailable` flag, but retain navigation to the normal product URL. A soft-deleted/tombstoned product detail returns a minimal deleted-product state so the destination screen shows `Sản phẩm đã bị xóa` instead of a generic loading failure.
- Permanently remove eligible product authoring/catalog rows and schedule their object-storage media for retryable cleanup. Expose operational counts for deleted, historically retained, failed, and remaining candidates.
- Change seller inventory listing to include only non-deleted, actively published products and active variants, excluding draft, hidden, archived, suspended, and soft-deleted products.
- Add the product primary image URL to inventory contracts and display a thumbnail with an accessible fallback in `/seller/inventory`.
- Add strict API, scheduler, PostgreSQL, contract, UI, and E2E tests for retention boundaries, timezone behavior, concurrency, rollback, filtering, and image rendering.

## Capabilities

### New Capabilities

- `seller-product-retention-cleanup`: Custom seller deletion confirmation, seven-day soft-delete retention, safe daily permanent cleanup, history protection, media cleanup, and operational visibility.
- `seller-inventory-published-products`: Published-product-only inventory visibility with product thumbnails and strict seller-owned response contracts.

### Modified Capabilities

None. The repository has no synced main specs for seller deletion retention or the seller inventory presentation rules; this change introduces both as new capabilities.

## Impact

- Seller product list/detail UI, deletion dialog styling, focus management, authenticated delete client, and post-delete list refresh.
- NestJS seller product deletion service plus a scheduled cleanup service/module, database-time cutoff queries, PostgreSQL advisory locking, health/operational reporting, and structured logs.
- Prisma queries and possibly a forward migration for cleanup indexes or deliberate relation behavior; immutable commerce history continues to take precedence over physical removal.
- Product media assets and S3/local object cleanup, with failed object deletion retained for later retry.
- Historical review/order response contracts, the public product-detail unavailable/deleted distinction, and screens that navigate to a dedicated deleted-product state without exposing tombstone data.
- Shared inventory contracts, inventory repository filtering/projection, seller inventory table UI, and product-image fallback behavior.
- Existing `DELETE /api/v1/seller/products/:productId` remains a soft-delete operation; no hard-delete API is exposed to the seller.
