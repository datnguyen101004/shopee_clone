## 1. Contracts, schema, and scheduling foundation

- [x] 1.1 Extend the strict shared `InventoryBalance` contract/parser/tests with nullable `productImageUrl`, keeping exact-key rejection and canonical URL/null validation.
- [x] 1.2 Add Prisma cleanup outcome fields and the `(deletedAt, purgeBlockedAt, id)` candidate index, then create and validate a forward-only PostgreSQL migration.
- [x] 1.3 Add `@nestjs/schedule`, centralized retention constants/configuration, and an API module that registers the `04:00` `Asia/Ho_Chi_Minh` cron without changing the existing pg-boss reservation queue.
- [x] 1.4 Add a private cleanup status contract/health projection for readiness, last attempt/success, and aggregate deleted, retained, failed, and remaining counts without sensitive fields.

## 2. Unified product soft deletion and custom dialog

- [x] 2.1 Refactor `deleteDraft` into an ownership-safe soft-delete transaction supporting draft, active, hidden, and archived products while using database time and the same private 404 for unknown, foreign, or already-deleted IDs.
- [x] 2.2 Remove ephemeral cart/engagement/placement/scope dependencies during soft deletion, increment affected cart versions, and verify all public catalog, pricing, reservation, checkout, and Seller Center reads exclude `deletedAt` products immediately.
- [x] 2.3 Keep attached product media private during retention and return `204` with `Cache-Control: no-store`; update OpenAPI descriptions, Problem Details mapping, clients, and service/controller tests.
- [x] 2.4 Replace all seller product `window.confirm` deletion paths with one responsive custom `alertdialog` showing image/fallback, product name, seven-day warning, cancel/delete actions, progress, and inline recoverable errors.
- [x] 2.5 Implement focus trap, initial/destructive focus policy, Escape cancellation, focus restoration, scroll locking, duplicate-submit prevention, success announcement, and post-delete list removal for keyboard, mobile, and desktop use.
- [x] 2.6 Add React tests for cancel/no-request, pending duplicate clicks, API failure, successful row removal, image fallback, focus behavior, Escape, and both draft/published product entry points.

## 3. Seven-day retention cleanup

- [x] 3.1 Implement the cleanup repository using PostgreSQL `clock_timestamp()`, strict `deleted_at < now - interval '7 days'`, stable bounded ordering, `FOR UPDATE SKIP LOCKED`, and a process-independent advisory lock.
- [x] 3.2 Implement durable-history classification for order lines, reviews, reservations, dataset ownership, sold/reserved inventory, and commerce-linked adjustments; mark protected products as retained tombstones without exposing them publicly.
- [x] 3.3 Implement atomic purge of eligible authoring graphs, including authoring-only initial/edit adjustments, balances, variants, options, attributes, carts/engagement, merchandising/voucher scopes, and product rows, with per-candidate rollback and idempotent retry behavior.
- [x] 3.4 Stage attached media metadata with database time inside the purge transaction, delete S3/local objects only after commit, delete media rows only after storage success, and preserve failed objects for existing retry cleanup.
- [x] 3.5 Wire the daily cron runner, structured aggregate logs, last-run state, backlog count, disabled-by-configuration rollout switch, and graceful skip when another API instance holds the advisory lock.
- [x] 3.6 Add unit tests for schedule configuration, single-runner behavior, stable batching, protected-versus-authoring-only classification, transaction rollback, retry/idempotency, sanitized status, and media success/failure.
- [x] 3.7 Add PostgreSQL integration tests for 6d23h59m, exactly 7d, 7d+1ms, `04:00` Vietnam timezone behavior, missed schedules, two concurrent runners, a dependency race, protected tombstones, eligible graph deletion, cart versioning, and recoverable media cleanup.

## 4. Published-product-only inventory with imagery

- [x] 4.1 Extract one seller inventory eligibility predicate requiring approved active shop, non-deleted active/moderation-active product, active category, and active non-deleted variant; reuse it for list, history, and adjustment authorization.
- [x] 4.2 Move eligibility and low-stock filtering before cursor pagination in PostgreSQL, project the first attached product image by `(sortOrder, id)`, and return `productImageUrl` without staged media or storage credentials.
- [x] 4.3 Revalidate eligibility inside inventory adjustment transactions so a product hidden/deleted after listing returns private no-store Problem Details without an adjustment audit mutation.
- [x] 4.4 Update `/seller/inventory` to show a fixed product thumbnail beside name/variant/SKU with meaningful alt text, a layout-stable missing/error fallback, and responsive rows that keep quantities and actions visible.
- [x] 4.5 Update the empty state to explain that only products currently published for sale appear, while preserving low-stock, adjustment, history, loading, and pagination interactions.
- [x] 4.6 Add contract, API, and PostgreSQL tests for draft/hidden/archived/suspended/soft-deleted exclusion, inactive variants, category/shop eligibility, low-stock-before-pagination, stable cursors, primary-image ordering, null images, and mutation lifecycle races.
- [x] 4.7 Add React tests for image/fallback rendering, responsive row content, published-only empty state, pagination, low-stock filtering, and refresh after an ineligible adjustment response.

## 5. Historical review experience for deleted products

- [x] 5.1 Extend strict historical review/order response contracts with the immutable product name/image snapshot and required `productAvailable`, and add minimal product-detail `410 Gone` Problem Details code `PRODUCT_DELETED` to shared parsing tests.
- [x] 5.2 Update backend review/order-history projections to source display data from `OrderLine` snapshots and derive `productAvailable`; update public product detail to distinguish a retained soft-deleted/tombstone row from an unknown ID without exposing deletion timestamps, cleanup reasons, descriptions, seller identity, media, or storage metadata.
- [x] 5.3 Keep the normal product link on historical reviews regardless of availability, and update the product-detail screen/error boundary to render `Sản phẩm đã bị xóa` with safe back-navigation when it receives `PRODUCT_DELETED`, while retaining the generic retry/not-found states for other failures.
- [x] 5.4 Add API/PostgreSQL and React tests for available products, soft-deleted products, retained tombstones, unknown IDs, incomplete legacy image snapshots, keyboard/pointer navigation, minimal 410 payloads, and direct stale product URLs.

## 6. End-to-end verification and documentation

- [x] 6.1 Add seller E2E coverage for custom deletion of draft and published products, immediate disappearance from seller/public/cart flows, preserved historical review display, navigation to the dedicated deleted-product screen, and non-enumerating seller ownership behavior.
- [x] 6.2 Add seller inventory E2E coverage proving only active published products appear with S3/local thumbnails or fallback and that adjustment/history actions still work.
- [x] 6.3 Add the approved soft-delete/cleanup, deleted-product review navigation, and published-inventory Mermaid diagrams to `flow.md`, documenting the strict boundary, protected tombstone branch, historical snapshot-to-410 page branch, image projection, endpoints, and verification screens.
- [x] 6.4 Run Prisma validation/generation/migration checks, contracts/API/web typecheck, lint, focused Jest/Vitest suites, `test:e2e:seller:quick`, and `test:e2e:homepage:quick`; record any environment-only skipped tests with exact reproduction commands.
- [x] 6.5 Run `openspec validate schedule-soft-deleted-product-cleanup-and-refine-inventory --strict` and reconcile implementation, specs, design, tasks, and flow documentation before marking the change complete.
