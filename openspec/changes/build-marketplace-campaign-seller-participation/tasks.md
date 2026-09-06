## 1. Contracts and Module Boundaries

- [x] 1.1 Reconcile this change with the unimplemented `add-admin-managed-banner-detail-pages` artifacts so campaign/banner contracts have one owner and no duplicate routes.
- [x] 1.2 Add framework-neutral campaign-type/policy/presentation, lifecycle, content-block, admin, seller participation, campaign product, notification, generic campaign-collection, and public detail contracts in `packages/contracts`.
- [x] 1.3 Define the versioned discriminated policy contracts, `NORMAL`/`FEATURED` importance classes, and closed presentation, product-order, and ranking-profile keys for `STANDARD`, `FLASH_SALE`, and `CHEAPEST_DEALS`.
- [x] 1.4 Extend seller product list/detail contracts with operational price, inventory, moderation, seller-promotion, and bounded typed platform-campaign summaries.
- [x] 1.5 Define strict NestJS DTOs, campaign-type filters, cursor query DTOs, idempotency/version inputs, and stable Problem Details codes for all campaign endpoints.
- [x] 1.6 Generate and verify OpenAPI/type parity for the new and expanded `/api/v1` contracts.

## 2. Persistence and Safe Migration

- [x] 2.1 Add Prisma models for the versioned campaign-type registry, generic homepage campaign collection, marketplace campaigns, eligible categories, seller participation, submitted products, idempotent commands, audits, and product promotion reservations.
- [x] 2.2 Seed stable `STANDARD`, `FLASH_SALE`, and `CHEAPEST_DEALS` type records with Vietnamese labels, `FEATURED` only for Flash Sale, `NORMAL` for the other types, and validated policy/presentation/order/ranking-profile versions.
- [x] 2.3 Extend `HomepageBanner` with its one-to-one campaign relation and versioned restricted content while preserving its stable banner ID and homepage module relation.
- [x] 2.4 Write the additive Prisma migration, supporting indexes, `btree_gist` extension, and half-open promotion-reservation exclusion constraint across all campaign types.
- [x] 2.5 Backfill reservation rows for enabled `ShopDiscountCampaign` products, detect existing overlap before constraint activation, and make the migration fail with an actionable diagnostic if repair is needed.
- [x] 2.6 Backfill safe draft campaigns for existing campaign banners, verify one-to-one coverage, and then enforce the required unique campaign relation.
- [x] 2.7 Add deterministic local/test seeds for every campaign type and draft, enrolling, scheduled, active, ended, and cancelled lifecycles plus joined, declined, withdrawn, conflicted, and unresponded sellers.
- [ ] 2.8 Add migration integration tests covering type seed stability, clean upgrade, legacy banner/Flash Sale compatibility, overlap rejection, uniqueness, rollback-safe feature disablement, and Amazon RDS PostgreSQL compatibility.

## 3. Campaign Domain and Admin API

- [x] 3.1 Create the campaign NestJS module, repository, lifecycle calculator, transaction-scoped database clock, and ownership-neutral domain errors.
- [x] 3.2 Implement the server-owned campaign policy, presentation, product-order, importance, and ranking-profile registries with schema validation, normal-by-default registration, and a safe generic presentation fallback.
- [x] 3.3 Implement allow-listed campaign content validation/normalization, same-origin link checks, trusted media checks, and escaped public rendering.
- [x] 3.4 Implement atomic typed campaign/banner create, list, detail, update, and non-persisting preview services with admin type selection, derived importance/profile, policy validation, timeline rules, and type immutability after publication.
- [x] 3.5 Implement idempotent publish and cancel commands with policy-version snapshots, optimistic versions, bounded audit records, cancellation reasons, and reservation cleanup.
- [x] 3.6 Expose and authorize `GET /api/v1/admin/campaign-types`, `GET|POST /api/v1/admin/campaigns`, `GET|PATCH /api/v1/admin/campaigns/:campaignId`, and `POST /api/v1/admin/campaigns/preview`.
- [x] 3.7 Expose and authorize admin publish, cancel, generic campaign-placement, and cursor-paginated participation reporting endpoints.
- [ ] 3.8 Add unit/API integration tests for type/policy registry validation, unsupported keys, type immutability, every lifecycle boundary, invalid timeline, stale editor, idempotent replay, preview isolation, content safety, and admin authorization.

## 4. Seller Eligibility and Voluntary Participation

- [x] 4.1 Implement the eligible-campaign query for approved active shops with type-policy/category-eligible owned products, stable pagination, and type/available/joined/upcoming/active/ended filters.
- [x] 4.2 Implement seller campaign detail with localized type metadata, effective type/campaign conditions, seller-safe product eligibility, conflict reasons, current decision, submitted products, and non-enumerating ownership behavior.
- [x] 4.3 Implement atomic join/revise/decline and withdraw transitions with transaction-time cutoff checks, complete-set replacement, current version, and idempotent replay.
- [x] 4.4 Create, replace, or disable marketplace promotion reservations in the same transaction as seller participation and translate exclusion violations into actionable product conflicts.
- [x] 4.5 Update existing shop-promotion create/update/archive paths to maintain the same reservation table and reject overlap in the opposite write direction.
- [x] 4.6 Expose and authorize seller campaign list/detail, `PUT .../participation`, and `POST .../participation/withdraw` endpoints.
- [ ] 4.7 Add unit/API/PostgreSQL tests for all response states, type-specific rules, mixed valid/invalid products, foreign IDs, price safety, category rules, lost responses, stale versions, exact enrollment cutoff, and concurrent overlap across platform campaign types and shop promotions.

## 5. Authoritative Campaign Pricing

- [x] 5.1 Extend `ScheduledDiscountService` to resolve shop/platform promotion reservations and return source kind, campaign identity/type, policy version, basis points, prices, and evaluation time.
- [x] 5.2 Apply platform campaign prices consistently to homepage/catalog cards, product detail, public campaign products, and seller previews without mutating variant base prices.
- [x] 5.3 Re-evaluate campaign price in cart quote and checkout transactions and retain immutable source/price order snapshots.
- [x] 5.4 Ensure cancellation, withdrawal, loss of sellability, and the exclusive end boundary immediately suppress future campaign price resolution.
- [ ] 5.5 Add arithmetic, half-open-window, unsafe-price fallback, cart/checkout expiry, cancellation, and historical-order regression tests.

## 6. Campaign Notifications and Scheduled Work

- [x] 6.1 Add type-aware announcement/reminder notification types, metadata validation, Vietnamese in-app/email templates, and `PROMOTIONS` category mapping.
- [x] 6.2 Implement bounded due-campaign claiming with `FOR UPDATE SKIP LOCKED`, eligible seller materialization, versioned deduplication keys, and retry-safe announcement delivery.
- [x] 6.3 Implement the configurable pre-deadline reminder sweep with response, eligibility, shop status, and enrollment-open rechecks.
- [ ] 6.4 Wire the campaign schedule script into the existing worker deployment, structured metrics, retry logging, and lag health signal without making lifecycle correctness worker-dependent.
- [ ] 6.5 Add tests for repeated/concurrent sweeps, no eligible products, preference-disabled email, independent in-app delivery, retry behavior, skipped responders, and protected deep links.

## 7. Detailed Seller Product API

- [x] 7.1 Expand the seller product repository to batch operational media, SKU/category/status, variant price range, inventory totals, sold/rating summary, update time, and seller-promotion summary without N+1 reads.
- [x] 7.2 Add bounded active/upcoming campaign summaries with type code/label, `additionalCampaignCount`, campaign/type/state SQL filters before pagination, and stable cursor behavior to product list responses.
- [x] 7.3 Add bounded active, upcoming/locked, and historical typed campaign groups with truthful price preview, policy-specific eligibility/conflict state, and seller deep link to product detail responses.
- [ ] 7.4 Add ownership-isolation, aggregation accuracy, no-duplicate-row, filter/pagination, bounded-response, and representative query-plan tests.

## 8. Campaign-Aware Search and Recommendations

- [x] 8.1 Increment projection/analyzer/scoring metadata and add server-owned campaign ID, type code, importance class, ranking-profile version, policy version, active bounds, discount basis points, and eligibility fields to the strict Elasticsearch document mapping.
- [x] 8.2 Extend projection/reconciliation triggers for campaign, type-policy, participation, reservation, product, shop, inventory, and cancellation changes, including full reindex repair.
- [x] 8.3 Implement separate lexical-tier sorting and registry-selected profiles satisfying `0 <= NORMAL < FEATURED <= global cap`, with `FLASH_SALE` featured, other types normal by default, and deterministic product-ID ties.
- [x] 8.4 Preserve price, best-selling, and newest primary sorts and apply equivalent bounded campaign behavior only to comparable PostgreSQL fallback candidates.
- [x] 8.5 Add the versioned featured/normal campaign profile to personalized daily recommendation scoring before the existing shop/category diversity pass and retain guest/cold-start fallbacks.
- [ ] 8.6 Extend offline evaluation with campaign exposure, relevance, tier inversion, explicit-sort violation, sellability, concentration, and latency gates plus a zero-weight kill switch.
- [ ] 8.7 Add query/projection/recommendation/fallback tests proving featured Flash Sale outranks an otherwise equivalent normal campaign, normal outranks no campaign, neither crosses lexical tiers/global cap, and unsupported/raw weights, explicit sorts, stale campaigns, personalization failure, and diversity pressure remain safe.

## 9. Admin Campaign Experience

- [x] 9.1 Add Seller/Admin navigation entries and build `/admin/campaigns` with campaign-type/lifecycle filters, stable pagination, participation summaries, loading, empty, and retry states.
- [ ] 9.2 Build the campaign create/edit flow with enabled type selection, visible featured/normal importance, policy-derived fields, required title and content, optional card media, eligibility, minimum discount, timeline, and review without exposing editable ranking weights, independent destinations, or CTA fields.
- [ ] 9.3 Build safe type-specific live preview, publish confirmation, type/importance/economic immutable-field explanations, stale-version recovery, cancellation confirmation/reason, and participation report views.
- [ ] 9.4 Add admin component tests and responsive checks for standard, Flash Sale, and “Rẻ Vô Địch” selection/presentation plus keyboard, focus, validation, publish, stale edit, and cancel flows.

## 10. Seller Campaign and Product Experience

- [x] 10.1 Build `/seller/campaigns` with campaign-type filters/labels, available/joined/upcoming/active/ended tabs, deadlines, response states, pagination, and accessible responsive cards.
- [x] 10.2 Build `/seller/campaigns/[campaignId]` with type-specific presentation/conditions, timeline, eligible/ineligible product selection, per-product discount preview, conflict help, and retained rejected input.
- [x] 10.3 Implement explicit join/revise/decline/withdraw confirmations, cutoff locking, idempotent retry UI, stale-version recovery, and authorization/unavailable states.
- [x] 10.4 Upgrade `/seller/products` desktop table/mobile cards with complete operational detail, seller-promotion summary, bounded typed platform-campaign chips, and campaign/type filters.
- [x] 10.5 Upgrade `/seller/products/[productId]` with typed active, upcoming/locked, and history groups, truthful discovery-priority copy, price preview, empty state, and campaign deep links.
- [ ] 10.6 Add seller component tests for campaign decisions, correction flows, product details/filters, keyboard/focus behavior, non-color labels, chip expansion, and no viewport overflow.

## 11. Public Campaign Experience

- [x] 11.1 Expose `GET /api/v1/campaigns/by-banner/:bannerId` with sanitized lookup, type/presentation metadata, derived public status, restricted content, cursor products, and central effective prices.
- [ ] 11.2 Derive the homepage campaign-banner module from every currently `ACTIVE` campaign banner, link each card to `/banner/:bannerId`, and exclude draft, announced, enrollment-open, scheduled, ended, cancelled, unpublished, and malformed records.
- [x] 11.3 Add the generic homepage campaign-collection contract/configuration and closed frontend renderer registry for standard, Flash Sale, “Rẻ Vô Địch”, and safe fallback presentation.
- [ ] 11.4 Switch the existing Flash Sale shelf behind a feature flag to active `FLASH_SALE` campaign products and central prices, with shadow parity metrics and no independent campaign-price source.
- [x] 11.5 Build `/banner/[bannerId]` with type-specific upcoming/active/ended/cancelled presentation, accessible content, localized schedule/countdown, truthful campaign prices, product pagination, and resilient empty/error states.
- [ ] 11.6 Add public API/component tests for Flash Sale and “Rẻ Vô Địch” source selection/order/presentation, safe fallback, sanitized not-found outcomes, timing boundaries, unavailable products, content safety, price truth, and responsive rendering.

## 12. End-to-End Verification and Operational Readiness

- [ ] 12.1 Add Playwright journeys for standard, Flash Sale, and “Rẻ Vô Địch” admin create/preview/publish/placement, invited seller join/revise/withdraw, seller decline, typed product visibility, buyer campaign collection/detail, and campaign checkout expiry.
- [ ] 12.2 Verify responsive behavior at 360x800, 768x1024, and 1440x900 plus keyboard-only operation and automated accessibility checks for new routes.
- [ ] 12.3 Run format, lint, strict typecheck, unit, contract, API integration, PostgreSQL migration, ranking evaluation, Playwright, and production build gates.
- [x] 12.4 Document campaign type/policy/presentation registry extension, environment variables, worker schedule, generic collection and Flash Sale migration flags, RDS `btree_gist` prerequisite, search reindex/alias rollout, monitoring, zero-boost rollback, and forward-repair procedure.
- [x] 12.5 Create `flow.md` after implementation with the Vietnamese end-to-end admin, seller, buyer, pricing, notification, search/recommendation, error, retry, and cancellation flows tied to verified routes and tests.
- [ ] 12.6 Run `openspec verify` against all proposal/design/spec/task requirements and resolve every incomplete, incorrect, or incoherent item before archiving the change.
