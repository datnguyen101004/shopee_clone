## 1. Expand contracts and persistence

- [x] 1.1 Add shared banner-target contracts (`CAMPAIGN`, `PRODUCT`, `SHOP`, `CATEGORY`, `SEARCH`, `URL`), CMS banner admin/public summaries, and runtime guards.
- [x] 1.2 Add nullable `HomepageBanner` target, display-window, enabled, and priority fields; make the legacy `campaignId` relation nullable before enabling independent writes.
- [x] 1.3 Add campaign-owned detail content/media fields needed by create, update, preview, publish, public detail, and existing campaign contracts.
- [x] 1.4 Add an expand/backfill migration that copies legacy banner `contentJson` and campaign-detail media into campaign-owned fields and maps every legacy banner to `targetType = CAMPAIGN` plus `targetId = campaignId`, without dropping legacy values or rows.
- [x] 1.5 Add migration integrity checks for row counts, orphaned targets, malformed campaign content, and ordering collisions; keep new write paths disabled until checks pass.
- [x] 1.6 Update seeds and persistence fixtures so a banner can exist without a campaign and a campaign can exist and retain complete detail content without a banner.

## 2. Homepage CMS module

- [x] 2.1 Add `HomepageCmsService` (and module wiring) that owns banner list/create/update/reorder/delete; do not put these writes on `MarketplaceCampaignsService` or `SellerPromotionsService`.
- [x] 2.2 Validate typed targets on write: active published campaign for a newly created or changed CAMPAIGN target, entity existence for PRODUCT/SHOP/CATEGORY, bounded search query, same-origin URL, and trusted media.
- [x] 2.3 Allow non-target fields of a legacy or previously valid banner to be edited after its campaign becomes unavailable while preserving and visibly flagging the stale target.
- [x] 2.4 Move `AdminHomepageController` banner endpoints onto the CMS service and stop fabricating unpublished `STANDARD` campaigns when creating a banner.
- [x] 2.5 Record privileged audit summaries for banner mutations without copying signed URLs or full target payloads.

## 3. Decouple promotion campaigns and Seller consumers

- [x] 3.1 Move campaign create/update/preview/publish/public-detail reads to campaign-owned content/media with a temporary legacy banner fallback during rollout.
- [x] 3.2 Stop `MarketplaceCampaignsService` create/update from inserting or updating `HomepageBanner`, and ensure campaign publish no longer requires a banner.
- [x] 3.3 Remove required `bannerId` from campaign DTOs, runtime guards, Seller campaign summaries, invitation events, participation links, and notification deep links; use `campaignId` as identity.
- [x] 3.4 Remove the Seller invitation scheduler's banner-presence guard so an eligible campaign without a banner still creates invitations and notifications.
- [x] 3.5 Expose a read-only campaign lookup that verifies existence, publication, and derived `ACTIVE` lifecycle for CMS create/retarget and click-through checks; campaigns MUST NOT accept CMS banner payloads.
- [x] 3.6 Add public campaign detail keyed by campaign id (`GET /api/v1/campaigns/:campaignId` and `/campaigns/[campaignId]`).
- [x] 3.7 Keep `GET /api/v1/campaigns/by-banner/:bannerId` only as a temporary compatibility alias that resolves a CAMPAIGN-targeted CMS banner, then remove client usage before the contract phase.

## 4. Public homepage mapping and admin notification

- [x] 4.1 Map the homepage campaign-banner module from eligible CMS banners (enabled, in display window), ordered by priority, even when a previously valid campaign target is unavailable.
- [x] 4.2 Resolve href per target type; for `CAMPAIGN`, attach the campaign route and campaign-owned content only when the campaign exists, is published, and is `ACTIVE`; otherwise keep the banner and omit href/content.
- [x] 4.3 Omit the module only when no banner passes CMS display rules; never auto-generate cards from the active-campaign inventory.
- [x] 4.4 Redirect `/banner/:bannerId` to the campaign route only when that banner still targets an active campaign; otherwise preserve CMS display behavior without opening the failed campaign.
- [x] 4.5 Emit a normalized target-failure event from explicit lifecycle transitions, scheduled stale-target reconciliation, and CMS read-time fallback for `ENDED`, `CANCELLED`, `MISSING`, and `FETCH_FAILED` states.
- [x] 4.6 Persist at most one in-app notice per admin for each stable banner/campaign/normalized-reason key, tolerate duplicate concurrent emitters, and isolate notification failures from homepage responses; do not implement recovery-based dedupe reset.

## 5. Admin and buyer UI

- [x] 5.1 Rebuild `/admin/homepage` banner editor for typed targets, display window, priority, unavailable-target state, and non-persisting preview.
- [x] 5.2 List active campaigns in the target picker and surface a server validation error without saving if a selected campaign is no longer valid at submit time.
- [x] 5.3 Keep non-target controls editable for a banner whose campaign later becomes unavailable, with a clear unavailable-target state and a valid retarget action.
- [x] 5.4 Remove homepage-banner creation from `/admin/campaigns` and point operators to Homepage CMS when they want a card.
- [x] 5.5 Keep the buyer carousel on CMS banners; clicking a valid CAMPAIGN target opens `/campaigns/:campaignId`, while a failed campaign target leaves the banner visible without that link.
- [x] 5.6 Implement one controlled carousel index/timer: auto-advance and loop every 3 seconds when at least two banners are eligible; expose previous/next icon controls and selectable position indicators inside the banner frame, plus touch swipe; restart after manual navigation; continue through hover/focus and pause only when the banner leaves the viewport; clean up timer/observer and hide redundant controls for zero or one banner.

## 6. Contract cleanup and quick verification

- [x] 6.1 After dual-read integrity checks pass and all clients use campaign ids, remove campaign reads from legacy banner content and retire client use of the by-banner alias.
- [x] 6.2 Drop the legacy required/unique banner-campaign relation only after independent campaign/banner writes and all replacement readers are active; document the roll-forward-only boundary after independent rows exist.
- [x] 6.3 Update the non-mutating seeded quick journey to cover an independent CMS banner, a campaign with no banner, active campaign target navigation, unavailable-target presentation, 3-second automatic advance and looping, previous/next and in-frame position controls, timer reset after manual navigation, continued autoplay during hover/focus, and pause when scrolling the banner out of the viewport where browser automation can observe it without changing database state.
- [x] 6.4 Run only `pnpm test:e2e:homepage:quick` against already-running API/web. Do not start Docker, migrate, seed, build, snapshot, mutate the developer database, run isolated/full E2E, or fan out into full unit/API test suites.
