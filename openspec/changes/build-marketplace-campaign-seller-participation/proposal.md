> **Display coupling superseded.** Homepage banners are no longer required to be 1:1 with campaigns. See `separate-homepage-cms-and-promotion-campaigns` for the Homepage/CMS vs Promotion/Campaign split. This change still owns campaign economics, seller participation, and pricing.

## Why

Homepage banners and merchandising shelves are currently presentation records rather than complete marketplace events: they do not own an independent schedule, seller enrollment, discounted product participation, or discovery behavior. Buyers need a simple rule: one running campaign appears as one banner, and activating that banner opens that campaign. The marketplace also needs several campaign types—such as standard events, Flash Sale, and “Rẻ Vô Địch”—without implementing a separate pricing and participation system for every new merchandising concept. A campaign needs one extensible type model and one coherent lifecycle so admins can announce an event, sellers can choose whether and how to participate, and buyers see truthful campaign prices and bounded discovery priority only while the event is active.

## What Changes

- Treat each platform campaign as one event with exactly one banner. That banner is the campaign's homepage display identity, not a standalone CMS page, and the canonical buyer page remains `/banner/:bannerId`.
- On the buyer homepage, the campaign-banner module lists every currently running (`ACTIVE`) campaign's banner. Activating a banner navigates to that campaign. Draft, announced, enrolling, scheduled, ended, and cancelled campaigns MUST NOT appear in that homepage list.
- Keep admin-authored buyer copy simple: a required title and required content. Optional image/alt text may accompany the homepage card. Admins MUST NOT set an independent destination or call-to-action; the banner always links to its campaign. Type, schedule, eligibility, and minimum discount remain operational campaign fields, not extra banner-CMS fields.
- Add an extensible, versioned campaign-type registry. Seed `STANDARD`, `FLASH_SALE`, and `CHEAPEST_DEALS` (“Rẻ Vô Địch”); admins select one enabled type when authoring a campaign. `FLASH_SALE` is the featured campaign class and receives a stronger bounded discovery profile, while all other current and newly registered types default to the normal class with a lower profile. Each type also selects validated eligibility/discount policy, presentation, homepage placement, and product ordering while sharing the same campaign lifecycle, participation, reservation, pricing, and audit foundations.
- Make the existing homepage Flash Sale shelf read active `FLASH_SALE` campaigns and their accepted products as its sole campaign/price source. Generic campaign-collection placement allows future types such as “Rẻ Vô Địch” to add a shelf without creating another discount domain.
- Let admins author the title and content, set eligibility rules, minimum discount, announcement and enrollment windows, event start/end times, preview, publish, monitor participation, and cancel eligible campaigns.
- Notify eligible sellers when a campaign is announced and remind non-responders before enrollment closes, using deduplicated promotion notifications and deep links.
- Give sellers a dedicated campaign workspace where participation is optional; sellers can join with selected owned products and discount rates, decline, revise, or withdraw before enrollment closes.
- Validate ownership, lifecycle, moderation, inventory, category eligibility, minimum discount, price safety, and overlap with existing shop discount campaigns before accepting campaign products.
- Apply participating platform-campaign discounts through the existing server-authoritative effective-price pipeline without changing variant base prices or historical order snapshots.
- Add campaign detail and product discovery to the buyer page, omitting products whose campaign price is not currently active or whose product/shop is not sellable.
- Extend seller product list/detail screens with richer operational summaries and current, upcoming, locked, and historical platform-campaign participation.
- Add a bounded active-campaign feature to relevance search and personalized daily recommendations. It raises valid discounted campaign products within comparable relevance while preserving exact-match hierarchy, filters, sellability, explicit primary sorts, diversity, deterministic ties, and fallbacks.
- Record lifecycle and participation mutations with version/idempotency controls and bounded audit metadata.
- Supersede the unimplemented planning scope in `add-admin-managed-banner-detail-pages`. This change owns the banner-as-campaign workflow. Independent banner Markdown, CTA destinations, and `GET /api/v1/banners/:bannerId` are out of scope.

## Capabilities

### New Capabilities

- `marketplace-campaign-management`: Covers the one-campaign/one-banner aggregate, title-and-content buyer copy, homepage listing of every running campaign banner, extensible campaign-type registry and policies, generic campaign placements including Flash Sale and “Rẻ Vô Địch”, admin lifecycle and schedule management, buyer campaign detail, campaign product discovery, pricing activation, cancellation, and audit behavior.
- `seller-campaign-participation`: Covers voluntary seller notification response, type-specific conditions, product/rate selection, eligibility validation, join/decline/revise/withdraw transitions, locking, and ownership isolation.
- `seller-product-campaign-visibility`: Covers detailed seller product summaries and per-product typed current, upcoming, locked, and historical campaign participation on list and detail screens.
- `campaign-notification-delivery`: Covers eligible-seller recipient selection, type-aware announcement and reminder events, deduplication, channel preferences, and campaign deep links.
- `campaign-aware-product-ranking`: Covers globally bounded, type-profiled active-campaign scoring in relevance search and personalized daily recommendations, including the stronger featured Flash Sale profile and lower normal profile, index freshness, anti-abuse eligibility, deterministic ordering, evaluation, and fallbacks.

### Modified Capabilities

- `admin-catalog-configuration`: Replaces standalone campaign-banner CRUD and destination/CTA editing with one-to-one typed campaign/banner administration. Creating a campaign creates its banner. The homepage campaign-banner module lists every running campaign automatically while preserving sort order.

## Impact

- **Persistence:** Add campaign-type/policy records, platform campaign, generic placement, banner content, seller participation, participating product, idempotent command, and lifecycle/audit relations. Existing seller-owned `ShopDiscountCampaign` remains separate and overlapping product windows are rejected across all campaign types.
- **API and contracts:** Add campaign-type discovery, public campaign detail, admin campaign management/preview/participation reporting, seller campaign response/product-selection, typed homepage collection, and seller product campaign-summary contracts under `/api/v1`.
- **Pricing:** Extend the central effective-price resolver with one active platform campaign source while retaining integer minor units, half-open time windows, current quote/checkout re-evaluation, and immutable order snapshots.
- **Notifications:** Add campaign announcement and deadline-reminder notification types under the existing `PROMOTIONS` category, in-app/email routing, preferences, retries, and deduplication.
- **Search and recommendations:** Extend product projections and stored scoring inputs with campaign type, importance class, and a globally bounded type profile. Active Flash Sale products receive the stronger featured contribution; other campaign products receive the lower normal contribution. PostgreSQL hydration remains authoritative and Elasticsearch/personalization failures retain existing fallback paths.
- **Frontend:** Add admin campaign-type selection, a title-and-content authoring surface, admin and seller campaign workspaces, `/banner/:bannerId`, a homepage campaign-banner list of every running campaign, generic typed campaign shelves/presentations, and richer `/seller/products` list/detail surfaces. Flash Sale and “Rẻ Vô Địch” receive distinct labels/presentation while consuming the shared campaign data model.
- **Operations and verification:** Add deterministic seeds, migrations, scheduled lifecycle/outbox work, reindex/reconciliation behavior, API/unit/integration tests, ranking evaluation, and responsive Playwright journeys.
