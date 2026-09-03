## Purpose

Define a safe seller product deletion and retention lifecycle that hides products immediately, cleans eligible records after seven days, and preserves immutable commerce history.

## ADDED Requirements

### Requirement: Seller deletion remains a private soft-delete operation
The system SHALL allow only the authenticated owner of an approved seller shop to delete one of that shop's products. A successful request MUST set a server-owned deletion timestamp, return a non-cacheable success response, and immediately exclude the product and its variants from seller listings, public discovery, product detail, cart mutation, pricing, reservation, and checkout. The seller MUST NOT receive a direct permanent-delete API.

#### Scenario: Seller deletes an owned product
- **WHEN** an authenticated seller confirms deletion of a non-deleted product owned by their shop
- **THEN** the product is soft deleted once, disappears from seller and buyer commerce reads, and the API returns success without exposing internal cleanup state

#### Scenario: Foreign or unknown product is requested
- **WHEN** a seller attempts to delete a product that is unknown, already deleted, or owned by another shop
- **THEN** the API returns the same non-enumerating private not-found response and changes no product

### Requirement: Seller Center uses an accessible custom deletion dialog
Seller Center SHALL use an application-styled confirmation dialog instead of a native browser confirmation. The dialog MUST show the product thumbnail or fallback, product name, a clear seven-day retention/permanent-cleanup warning, distinct cancel and destructive actions, initial focus, trapped keyboard focus, Escape cancellation, focus restoration, duplicate-submit prevention, and an inline recoverable error state.

#### Scenario: Seller opens and cancels deletion
- **WHEN** a seller invokes delete from a product row and then cancels with the button or Escape
- **THEN** no API mutation occurs, the dialog closes, and focus returns to the invoking delete control

#### Scenario: Deletion request is pending or rejected
- **WHEN** the seller confirms deletion and the request is pending or fails
- **THEN** repeated submission is prevented and a sanitized error remains visible without losing the selected product context

#### Scenario: Deletion succeeds
- **WHEN** the soft-delete API succeeds
- **THEN** the dialog closes, a success message is announced, and the deleted product is removed from the current Seller Center result without requiring manual form re-entry

### Requirement: Daily cleanup uses an exact seven-day database-time boundary
The system SHALL attempt retention cleanup every calendar day at `04:00` in the `Asia/Ho_Chi_Minh` timezone. Eligibility MUST be derived from authoritative database time and MUST require `deletedAt` to be strictly earlier than database time minus seven complete days; a product exactly seven days old MUST remain until a later cleanup attempt.

#### Scenario: Product is exactly seven days old
- **WHEN** cleanup evaluates a product whose deletion timestamp is exactly seven days before database time
- **THEN** the product is not permanently removed during that run

#### Scenario: Product is older than seven days
- **WHEN** cleanup evaluates an otherwise eligible product whose deletion timestamp is more than seven complete days before database time
- **THEN** the product becomes eligible for permanent cleanup

#### Scenario: Application was unavailable at four o'clock
- **WHEN** no instance can run the scheduled cleanup at `04:00`
- **THEN** no product is removed early and overdue candidates remain eligible for the next successful daily run

### Requirement: Cleanup preserves immutable commerce history
Permanent cleanup MUST NOT delete or invalidate immutable order, review, reservation, voucher-redemption, or commerce-linked inventory history. Authoring-only inventory setup and product-edit rows MAY be removed with an otherwise eligible product graph. A candidate with a protected historical reference SHALL remain a non-public soft-deleted tombstone and SHALL be reported as historically retained rather than repeatedly treated as a successful deletion.

#### Scenario: Soft-deleted product has no protected history
- **WHEN** an older-than-seven-days candidate has only deletable authoring, engagement, cart, catalog-placement, voucher-scope, inventory-balance, and media dependencies
- **THEN** the complete eligible product graph is permanently removed atomically

#### Scenario: Soft-deleted product has protected history
- **WHEN** an older-than-seven-days candidate is referenced by immutable commerce history
- **THEN** public access remains unavailable, historical data remains readable, and the cleanup outcome records the candidate as retained

### Requirement: Historical reviews navigate to an explicit deleted-product page state
Review and order-history responses that represent an existing review SHALL preserve the immutable product name and image snapshot and SHALL include an authoritative `productAvailable` boolean derived from public product-detail eligibility. The historical review UI MUST retain navigation to the normal product URL regardless of that flag. When the referenced product is soft deleted or retained as a tombstone, public product detail MUST return a minimal `410 Gone` Problem Details response with code `PRODUCT_DELETED`; the destination screen MUST show `Sản phẩm đã bị xóa` instead of a generic failure. Tombstone-only fields and cleanup reasons MUST remain private.

#### Scenario: User views a review for an available product
- **WHEN** a historical review references a product that is still eligible for public product detail
- **THEN** the response returns its stored product snapshot with `productAvailable: true` and the UI permits navigation to that product

#### Scenario: User views a review for a deleted product
- **WHEN** a historical review references a soft-deleted product or protected tombstone
- **THEN** the review and stored product snapshot remain visible, `productAvailable` is `false`, and its product link still navigates to the normal product URL

#### Scenario: Deleted product detail is opened from review history
- **WHEN** a user opens the normal product URL for a soft-deleted product or protected tombstone
- **THEN** the API returns `410 Gone` with code `PRODUCT_DELETED` and the product screen renders `Sản phẩm đã bị xóa` with safe navigation back to shopping or review history

#### Scenario: Unknown product detail is requested
- **WHEN** a user opens a product identifier that does not represent a retained deleted product
- **THEN** the API retains its generic not-found behavior and does not claim that an unknown product was deleted

#### Scenario: Deleted-product review response stays private
- **WHEN** a client receives historical review data for a deleted product
- **THEN** the response contains no product description, deletion timestamp, cleanup reason, storage key, or other tombstone-only data

#### Scenario: Deleted-product detail response stays minimal
- **WHEN** public product detail reports `PRODUCT_DELETED`
- **THEN** the Problem Details response contains no product name, seller identity, description, deletion timestamp, cleanup reason, media URL, or storage metadata

### Requirement: Cleanup is atomic, bounded, and safe under concurrency
Each cleanup run SHALL process a bounded stable batch, permit at most one active runner across application instances, revalidate candidate state while deleting, and be idempotent across retries. Concurrent checkout, reservation, review, restore-like, or cleanup activity MUST resolve without orphan references, partial deletion, or duplicate media cleanup claims.

#### Scenario: Two instances start cleanup together
- **WHEN** multiple API instances reach the daily schedule concurrently
- **THEN** at most one instance mutates cleanup candidates and the other exits without duplicating work

#### Scenario: A dependency appears during cleanup
- **WHEN** a protected reference is committed while a candidate is being revalidated
- **THEN** either the protected reference commits and deletion is skipped or deletion commits and the competing operation fails safely, with no broken reference

#### Scenario: A deletion transaction fails
- **WHEN** any database mutation in a candidate cleanup fails
- **THEN** all database changes for that candidate roll back and the product remains eligible for a later run

### Requirement: Media cleanup is recoverable
Permanent product cleanup SHALL remove database-visible product images atomically with the eligible product graph while retaining enough seller-owned storage metadata to retry physical object deletion after commit. An object-storage failure MUST NOT recreate the product or mark database cleanup as failed, and MUST remain discoverable for later media cleanup.

#### Scenario: Object deletion succeeds
- **WHEN** an eligible product is permanently removed and all associated objects are deleted successfully
- **THEN** no product media remains publicly accessible and cleanup records a successful media outcome

#### Scenario: Object deletion fails after database commit
- **WHEN** object storage is temporarily unavailable after eligible database cleanup commits
- **THEN** the product remains permanently removed and the orphaned storage objects remain queued or staged for retry

### Requirement: Cleanup exposes sanitized operational status
The system SHALL expose private or operationally scoped status containing the last attempted run, last successful run, runner readiness, and counts for deleted, historically retained, failed, and remaining eligible candidates. Logs and status MUST NOT expose product descriptions, buyer data, object-storage credentials, or other secrets.

#### Scenario: Operator inspects cleanup health
- **WHEN** an authorized operational check reads cleanup status
- **THEN** it receives timestamps, readiness, and aggregate counts sufficient to diagnose backlog without sensitive product or user payloads
