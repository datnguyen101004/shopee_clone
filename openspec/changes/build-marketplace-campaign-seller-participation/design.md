## Context

See `proposal.md` for the product motivation and the capability specs for normative behavior. The repository is a TypeScript modular monolith: Next.js App Router in `apps/web`, NestJS REST modules in `apps/api`, Prisma/PostgreSQL as the authoritative store, and framework-neutral contracts in `packages/contracts`.

The current catalog has `HomepageModule` and `HomepageBanner` presentation records, but a banner has no independent campaign lifecycle. The current `FLASH_SALE` homepage module is also a presentation mode rather than a typed campaign source. Seller-funded scheduled discounts are represented by `ShopDiscountCampaign` and `ShopDiscountProduct`, and `ScheduledDiscountService` is the single place that applies their price. Notifications already support a `PROMOTIONS` preference category, a deduplicated inbox record, email attempts, and bounded retries. Search uses a versioned Elasticsearch projection, PostgreSQL hydration, stored scoring inputs, and fallback paths. Seller product list/detail routes already exist but return only a smaller operational view.

The design must preserve server-authoritative prices, UTC half-open intervals, integer minor units, opaque ownership-safe identifiers, stable pagination, Problem Details errors, and the current AWS deployment shape. It introduces no new managed infrastructure.

## Goals / Non-Goals

**Goals:**

- Add a transactional one-campaign/one-banner aggregate with an auditable schedule and stable public banner ID. The banner is the campaign's homepage display identity.
- Show every currently running campaign banner on the buyer homepage and send each click to `/banner/:bannerId`.
- Keep admin-authored buyer copy to title and content, with optional card media.
- Support multiple versioned campaign types, beginning with standard events, Flash Sale, and “Rẻ Vô Địch”, without duplicating lifecycle, seller participation, discount, or checkout logic.
- Let eligible sellers make an optional, time-bounded decision and submit owned products with validated discount rates.
- Prevent one product from having overlapping seller-funded and platform campaign discounts at the database boundary.
- Reuse the central pricing, notification, search, recommendation, authorization, and seller-product module boundaries.
- Keep ranking benefit bounded, explainable, time-aware, and unable to cross lexical relevance tiers or override explicit sorts.
- Return campaign summaries with seller products without N+1 queries or unbounded response growth.

**Non-Goals:**

- Auctioning campaign placement, paid ads, seller fees, settlement, or campaign budgets.
- Manual approval of every seller submission after it passes the published eligibility rules.
- Per-variant campaign enrollment; the seller chooses a product and the discount applies to every eligible active variant.
- Storing a mutable campaign price on product variants or rewriting historical order snapshots.
- Guaranteeing a fixed search position or exposing buyer personalization weights to sellers.
- Adding Redis, a separate campaign service, or a new external scheduler.
- Allowing admins to author executable policy code, arbitrary ranking weights, or arbitrary frontend component names.
- An independent banner CMS, Markdown source document, optional CTA destinations, or a second public resource at `GET /api/v1/banners/:bannerId`.

## Decisions

### 1. Add a campaign aggregate while retaining `HomepageBanner`

Create a `MarketplaceCampaign` model containing a required `campaignTypeId`, publication/cancellation markers, `announceAt`, `enrollmentStartsAt`, `enrollmentEndsAt`, `startsAt`, exclusive `endsAt`, `minimumDiscountBasisPoints`, `version`, and audit timestamps. Add optional category rows in `MarketplaceCampaignCategory`.

Extend `HomepageBanner` with a required unique `campaignId`, restricted formatted `contentJson`, and the existing display fields. Creating a campaign creates its banner in the same transaction. The banner is the campaign's display identity: title and content are the buyer-facing copy; image/alt are optional homepage-card media. `destinationPath` is always `/banner/:bannerId` and is not an admin-editable navigation target. `HomepageBanner.id` remains the canonical public identifier used by `/banner/:bannerId`.

The homepage campaign-banner module is a derived list of running campaigns, not a separately curated CMS. It includes every published, non-cancelled campaign whose lifecycle is `ACTIVE`, ordered by banner `sortOrder`. Announced, enrolling, scheduled, ended, and cancelled campaigns stay off that list even if their public detail page remains readable after announcement. Admins do not need a second “create homepage banner” step for a running campaign to appear.

Campaign content is stored as a versioned allow-listed block document rather than arbitrary HTML or Markdown source. DTO validation normalizes supported headings, paragraphs, lists, links, and media references; rendering escapes text and permits only same-origin links and trusted marketplace media. This supports admin editing without creating a stored-XSS boundary.

Alternatives considered: replacing `HomepageBanner` would duplicate existing homepage integration and complicate migration; putting all campaign fields on the banner would mix lifecycle and presentation and make participation relations ambiguous; keeping a standalone banner CMS with CTA destinations would let homepage cards point away from their campaign.

### 2. Use a versioned campaign-type registry and generic campaign placements

Add `MarketplaceCampaignType` with a stable unique `code`, localized `displayName`, description, `policyKey`, `policyVersion`, validated `policyConfigJson`, `presentationKey`, `productOrderKey`, `importanceClass`, `rankingProfileKey`, enabled state, and audit timestamps. Seed these records:

- `STANDARD`: `NORMAL` importance, generic banner and product-grid presentation with common campaign eligibility.
- `FLASH_SALE`: `FEATURED` importance, countdown-led presentation and the stronger supported Flash Sale ranking/policy/order profile.
- `CHEAPEST_DEALS`: `NORMAL` importance, localized as “Rẻ Vô Địch”, with a price-led presentation and supported deal policy/order profile.

The API maps `policyKey` and version to a discriminated TypeScript policy contract. Persisted JSON contains bounded parameters such as effective minimum discount and per-seller product limit; it never contains code. `presentationKey`, `productOrderKey`, `importanceClass`, and `rankingProfileKey` must exist in server registries. Admins select an enabled type and see whether it is featured or normal, but cannot supply raw component names, SQL/order expressions, importance values, or ranking weights. Type, importance, ranking profile, and policy version are snapshotted on publish and become immutable.

Add a generic campaign-collection configuration for `HomepageModule` that references a campaign and obtains its renderer/order strategy from the published type. Migrate the existing Flash Sale module to this generic collection mode behind a compatibility flag; once enabled, it reads only an active `FLASH_SALE` campaign and its accepted products. “Rẻ Vô Địch” uses the same generic module configuration with a `CHEAPEST_DEALS` campaign. The banner module remains responsible for the one-banner placement. A safe generic renderer exists for supported new types that do not require a specialized layout.

New campaign types are introduced through reviewed seed/migration/config changes that add a policy and presentation registry entry. They default to `NORMAL`; assigning `FEATURED` requires an explicit reviewed server change. This is extensible without becoming an unvalidated admin-defined rule engine.

Alternatives considered: a database enum would require schema changes for every merchandising name; a free-form JSON type would permit unsupported policies and frontend renderers; separate Flash Sale tables would duplicate prices and allow homepage/checkout disagreement.

### 3. Derive lifecycle from database time

Persist `publishedAt` and `cancelledAt`; derive `DRAFT`, `ANNOUNCED`, `ENROLLMENT_OPEN`, `SCHEDULED`, `ACTIVE`, `ENDED`, or `CANCELLED` from those markers and one transaction-scoped database timestamp. All price and mutation checks use the same database time as their transaction. Intervals are half-open, including enrollment and event end boundaries.

A campaign schedule worker is used only for side effects such as invitations and reminders. Correct reads, pricing, and ranking eligibility never depend on a cron job changing a status column. A joined participation is returned as `LOCKED` once enrollment has closed, while the stored decision and submitted products remain unchanged.

Alternative considered: persisting each time-derived status would make worker delay or retry failure visible as incorrect pricing and stale UI.

### 4. Model seller decisions and products explicitly

Add `SellerCampaignParticipation` with a unique `(campaignId, shopId)`, stored decision (`UNRESPONDED`, `JOINED`, `DECLINED`, or `WITHDRAWN`), `version`, response timestamps, and relations to submitted products. Add `SellerCampaignProduct` with unique `(participationId, productId)`, discount basis points, acceptance timestamps, and bounded validation metadata suitable for support diagnostics.

Announcement processing creates an `UNRESPONDED` row for each currently eligible seller before emitting its invitation. An eligible seller who discovers the campaign later may create the same row atomically when responding. Join and revise replace the seller's complete selected-product set in one serializable transaction. No row is interpreted as consent until the stored decision is `JOINED`.

The API composes common validation with the published type-policy validator, then checks shop ownership, seller/shop status, product lifecycle and moderation state, category scope, active variants, price safety, product-count bounds, inventory rules, and discount range inside the transaction. Foreign product IDs receive a non-enumerating error. Automatic validation is sufficient; admin reporting is observational.

Alternative considered: storing a status directly on products cannot represent decline/withdrawal, version one seller response coherently, or support one notification per seller.

### 5. Enforce non-overlapping discount windows with shared reservations

Add `ProductPromotionReservation`, one row per product and scheduled discount source, with source kind (`SHOP_CAMPAIGN` or `MARKETPLACE_CAMPAIGN`), source ID, `[startsAt, endsAt)`, and enabled state. A PostgreSQL GiST exclusion constraint using `btree_gist` rejects overlapping enabled ranges for the same product. Raw SQL in the Prisma migration creates the extension and constraint; the repository translates violations into a product-specific promotion conflict.

Both seller promotion commands and platform participation commands write reservations in the same transaction as their source rows. Campaign type does not participate in conflict selection: one product cannot hold overlapping platform campaign reservations of any type or an overlapping shop promotion. Disabling, archiving, withdrawing, or cancelling a source disables its reservations. Updating a schedule replaces reservations transactionally. This closes the race in either direction, including creating a shop promotion after joining a platform campaign. Existing enabled `ShopDiscountCampaign` products are backfilled before the constraint is enabled.

Alternative considered: application-only overlap queries can pass concurrently; advisory locks reduce the race but leave correctness dependent on every future write path using the same convention.

### 6. Extend the central price resolver with typed sources

`ScheduledDiscountService` continues to be the only scheduled product-discount resolver. It reads active reservations and their typed source detail, validates current source state and published type policy, and returns source kind, campaign identity, campaign type, discount, base/effective price, and evaluation time. Because reservations prohibit overlap, resolution never chooses between competing campaign types. It applies integer arithmetic to every eligible active variant and falls back to base price if the computed price is unsafe.

Catalog cards, campaign detail, cart quote, checkout, search projection, and order construction consume this resolver. Checkout re-evaluates inside its existing transaction. Order lines retain their immutable price/source snapshot; later campaign cancellation changes only future evaluations.

Alternative considered: calculating campaign price in each controller would create inconsistent cart, checkout, catalog, and search behavior.

### 7. Use versioned idempotent commands and bounded audit records

Create `MarketplaceCampaignCommand` keyed by `(actorId, idempotencyKey)` with command scope, request digest, and bounded replay response. Admin create/publish/cancel and seller response/withdraw mutations use it. Update DTOs require the current aggregate or participation version and return `409` Problem Details for stale writes or changed-input key reuse.

Create `MarketplaceCampaignAudit` for privileged lifecycle/content mutations and seller decision transitions. Store actor, resource, action, timestamp, reason code, version change, and a small metadata allow-list; do not copy full formatted content, signed URLs, or seller product payloads.

Alternative considered: relying on HTTP retry behavior would allow duplicate side effects and offers no safe recovery after a lost response.

### 8. Reuse the notification engine with a DB-claimed schedule sweep

Add `CAMPAIGN_ANNOUNCED` and `CAMPAIGN_ENROLLMENT_REMINDER` notification types mapped to `PROMOTIONS`. A campaign schedule script selects due work in bounded batches with `FOR UPDATE SKIP LOCKED`, materializes eligible seller participation rows, and calls the existing notification service. Deduplication keys include campaign ID, campaign publication version, seller ID, and event kind.

The reminder point is stored as configuration relative to `enrollmentEndsAt`. It rechecks `UNRESPONDED`, type-policy eligibility, seller eligibility, and the open enrollment boundary before notification. Notification copy includes the localized campaign-type label and effective conditions. In-app and email routing continue to honor current preferences and retries independently. Deep links target `/seller/campaigns/:campaignId`; the destination repeats authorization and eligibility checks.

Alternative considered: creating notifications in the publish request makes the admin request scale with seller count and cannot naturally handle a future `announceAt`.

### 9. Introduce capability-owned REST contracts

Add DTOs and shared contracts for these endpoints:

- Public: `GET /api/v1/campaigns/by-banner/:bannerId` with title, content, type metadata, and cursor-paginated active products; `GET /api/v1/homepage` returns every running campaign banner in the campaign-banner module plus generic campaign collections with supported presentation keys. There is no `GET /api/v1/banners/:bannerId`.
- Admin: `GET /api/v1/admin/campaign-types`, `GET|POST /api/v1/admin/campaigns`, `GET|PATCH /api/v1/admin/campaigns/:campaignId`, `POST /api/v1/admin/campaigns/preview`, `POST /api/v1/admin/campaigns/:campaignId/publish`, `POST /api/v1/admin/campaigns/:campaignId/cancel`, and `GET /api/v1/admin/campaigns/:campaignId/participations`.
- Seller: `GET /api/v1/seller/campaigns` with a type filter, `GET /api/v1/seller/campaigns/:campaignId`, `PUT /api/v1/seller/campaigns/:campaignId/participation` for join/revise/decline, and `POST /api/v1/seller/campaigns/:campaignId/participation/withdraw`.
- Seller products: extend `GET /api/v1/seller/products` with `campaignId` and campaign-state filters and extend `GET /api/v1/seller/products/:productId` with grouped campaign detail.

Mutation requests use the existing idempotency header convention and body version. All endpoints use strict DTO validation, role/shop guards, stable cursors, and Problem Details. The public lookup returns the same sanitized `404` for malformed, missing, draft, and unannounced banner IDs.

Alternative considered: extending generic homepage admin endpoints would couple campaign economics and seller participation to a presentation-only module.

### 10. Build bounded seller-product summaries in repository queries

The seller product list repository selects product/media/category/state, aggregates variant price and inventory, joins rating/sales summaries, and fetches seller promotion plus active/upcoming typed platform campaign summaries in bounded batched queries. The service assembles one row per product, returns type code/label on at most two campaign chips and an `additionalCampaignCount`, and retains the existing stable cursor. Campaign and campaign-type filters are applied in SQL before pagination.

Product detail uses a separate bounded campaign-history query grouped by active, upcoming/locked, and historical state. It returns calculated preview price only after using the central resolver and never returns internal search weights or buyer profile data.

Alternative considered: loading campaigns per product is simple but creates N+1 behavior and unstable pagination when joins duplicate rows.

### 11. Add a bounded campaign feature to search and recommendations

Increment the search projection and scoring versions. Project server-owned `marketplace_campaign_id`, `campaign_type_code`, `campaign_policy_version`, `campaign_starts_at`, `campaign_ends_at`, `campaign_discount_basis_points`, and `campaign_eligible` from accepted participation and current sellability. Request-time scripts require eligibility and `[startsAt, endsAt)` so a stale document contributes zero after the end boundary.

For relevance search, calculate a lexical tier separately from the within-tier score and sort by `(lexicalTier DESC, withinTierScore DESC, productId ASC)`. The within-tier score adds lexical score, baseline quality, eligible personalization, and a non-negative campaign term capped by `CAMPAIGN_RANKING_BOOST_MAX`. A server registry maps `rankingProfileKey` to bounded coefficients and enforces `0 <= NORMAL < FEATURED <= CAMPAIGN_RANKING_BOOST_MAX`. `FLASH_SALE` uses `FEATURED`; all other initial types use `NORMAL`. No type, admin, or client input can exceed the global cap. Each profile combines its fixed weight with a capped normalized discount-depth component. For otherwise equivalent candidates in one lexical tier, featured Flash Sale ranks above a normal campaign, which ranks above no campaign. No campaign profile can cross a lexical tier. Explicit price, sold, and newest sorts omit campaign score from their primary ordering.

Personalized daily recommendations add the same versioned, bounded importance/profile feature before the existing shop/category diversity pass. Guest/cold-start ranking may use the profile's fixed baseline term. PostgreSQL fallback applies the matching featured or normal term only to candidates for which the existing fallback can establish the same relevance tier; otherwise it preserves current order.

Offline evaluation adds campaign exposure, lexical-tier inversion, explicit-sort violation, sellability, concentration, latency, and relevance metrics. Any tier, explicit-sort, or sellability violation blocks rollout. Configuration supports reducing the weight to zero without a code rollback.

Alternative considered: multiplying the whole search score can push weak matches over exact matches and makes the campaign influence hard to bound.

### 12. Render role-specific Next.js routes from shared contracts

Add `/banner/[bannerId]`, `/admin/campaigns`, `/admin/campaigns/[campaignId]`, `/seller/campaigns`, and `/seller/campaigns/[campaignId]`. Server components load the initial authorized view; client components let admins select an enabled type and show its featured/normal importance plus policy-derived fields without exposing raw weights. The admin editor's buyer-facing copy is title and content, with optional card media. They also handle seller product selection, version conflicts, retained invalid input, confirmation dialogs, and cursor interactions. Existing seller product list/detail components consume the expanded contracts. The homepage campaign-banner carousel renders every running campaign banner from the homepage aggregate and does not invent a second destination.

Create a closed frontend presentation registry keyed by the server-approved `presentationKey`. It contains generic, Flash Sale, and “Rẻ Vô Địch” renderers, each consuming the same normalized campaign/product contract. Unknown keys use a safe generic renderer and produce an observability event; API content cannot request an arbitrary component. The existing Flash Sale shelf stops reading independently curated product prices when the campaign-collection flag is enabled.

The frontend follows the Vietnamese UI/UX spec in `docs/ui-ux/build-marketplace-campaign-seller-participation.md`, including desktop tables, mobile cards, keyboard operation, non-color status labels, localized UTC display, loading/empty/error/stale states, and no document-level overflow at target viewports.

Alternative considered: one universal campaign screen would blur admin economics, seller participation, and public content authorization.

### 13. Verify domain boundaries and end-to-end behavior

Unit tests cover type/policy registry validation, presentation/order/boost registry resolution, lifecycle boundaries, formatted-content validation, discount arithmetic, participation transitions, scoring caps, and status grouping. PostgreSQL integration tests cover campaign-type seeds, migration/backfill, exclusion conflicts across campaign types and seller/platform commands, version/idempotency replay, transaction-time enrollment cutoff, ownership isolation, notification claims, and price re-evaluation. Contract tests cover OpenAPI/shared types. Component and Playwright tests cover standard, Flash Sale and “Rẻ Vô Địch” presentation, the main admin publish, seller join/decline/revise/withdraw, product campaign visibility, public banner, and responsive paths.

Ranking evaluation fixtures contain comparable products, exact-versus-fuzzy controls, explicit sorts, expired/stale index entries, and diversity pressure. Operational metrics count due notification lag, participation validation failures, reservation conflicts, campaign price applications, reindex lag, and campaign exposure without product or seller identifiers in labels.

## Risks / Trade-offs

- [The exclusion constraint adds migration and write-path complexity] -> Backfill in validation mode, fail migration on detected overlap, enable the constraint only after repair, and cover both promotion modules with integration tests.
- [A seller can lose eligibility after enrollment] -> Re-evaluate sellability and source validity at read, price, indexing, cart, and checkout boundaries; retain participation history but suppress price and boost.
- [Notification sweeps can lag] -> Claim small retryable batches, expose due-work lag metrics, and keep lifecycle/pricing independent from notification delivery.
- [Campaign joins increase seller-product query cost] -> Filter before pagination, use bounded aggregate queries and supporting indexes, cap summaries, and measure query plans with representative data.
- [Search index metadata can be stale] -> Evaluate time in the scoring script, hydrate from PostgreSQL, emit incremental projection events, retain reconciliation/full reindex, and keep a zero-weight kill switch.
- [Discount boost can reduce perceived relevance] -> Use a separate lexical tier, cap the within-tier term, preserve explicit sorts and diversity, and require offline release gates.
- [Formatted campaign content expands the XSS surface] -> Store versioned allow-listed blocks, validate links/media, escape rendering, and disallow raw HTML.
- [A campaign-type registry can become an unbounded rule engine] -> Keep policy keys and schemas in reviewed server code, validate all persisted parameters, provide a safe generic presentation, and prohibit executable expressions or raw ranking weights.
- [Migrating Flash Sale can temporarily create two sources] -> Put the campaign-backed collection behind one feature flag, compare outputs in shadow metrics, and disable the legacy source atomically when enabling it.

## Migration Plan

1. Add campaign-type registry and generic campaign-collection configuration, seed `STANDARD`, `FLASH_SALE`, and `CHEAPEST_DEALS`, then add campaign tables/relations, the nullable `HomepageBanner.campaignId`, indexes, command/audit tables, and `ProductPromotionReservation` in an additive migration.
2. Enable `btree_gist`, backfill reservations for enabled seller campaigns, detect/report existing overlaps, and then add the exclusion constraint.
3. Create campaign rows for existing campaign-banner records with safe draft defaults, connect each banner, and make `campaignId` required/unique after verification. Existing public homepage behavior remains until the feature flag is enabled.
4. Deploy type/policy/presentation registries, API read paths, contracts, reservation writes for existing seller promotions, dual-compatible central pricing, and campaign modules behind disabled feature flags.
5. Deploy the web routes, generic campaign-collection renderers, and seller-product contract expansion, run the notification worker in dry-run metrics mode, and build the new search index version.
6. Enable admin authoring, then seller invitations/participation, then public active campaigns. Shadow the campaign-backed Flash Sale collection against the legacy shelf, switch its single source only after parity checks, and enable “Rẻ Vô Địch” through the generic placement.
7. Alias-swap the search index only after ranking gates pass; start every type profile at zero and raise it within the approved global bound.
8. Remove compatibility reads only after all banners, Flash Sale placements, and promotion reservations reconcile successfully.

Rollback disables campaign publication/invitations and sets campaign ranking weight to zero, rolls the search alias back, and leaves additive data intact. Active campaign pricing can be stopped by the feature flag/cancellation path without deleting participation or order history. A schema rollback is not attempted after campaign data is written; a forward migration repairs defects.
