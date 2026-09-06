## Context

See `proposal.md` and the change specs for buyer/admin behavior. Today `HomepageBanner.campaignId` is required and unique. `MarketplaceCampaignsService.createAdmin` inserts a banner in the same transaction, stores campaign detail content/media on that banner, and requires banner content during publish. `AdminService` homepage banner CRUD also fabricates an unpublished `STANDARD` campaign. Public homepage mapping filters banners by campaign lifecycle. Campaign response guards, seller invitation events, and `GET /api/v1/campaigns/by-banner/:bannerId` treat the banner id as required campaign identity.

Promotion economics (campaign types, seller participation, reservations, pricing) stay in `MarketplaceCampaignsModule` and existing promotion services. This design only severs presentation from that aggregate.

## Goals / Non-Goals

**Goals:**

- Own banner persistence, admin CRUD, target resolution, and homepage mapping in a Homepage/CMS service.
- Store an optional typed target instead of a required campaign foreign key.
- Move campaign detail content/media to campaign-owned persistence before decoupling writes.
- Keep campaign publish, public detail, seller invitation, and participation operational without a banner.
- Resolve and validate click-through at public read time.
- Move campaign public identity off the banner id.
- Migrate existing 1:1 rows without dropping campaign or banner history.

**Non-Goals:**

- A long-form Markdown/article CMS or per-banner public article route.
- Seller-authored banners, paid placement, or auctions.
- Changing campaign pricing, enrollment, vouchers, or flash-sale product shelves.
- Putting banner writes on `MarketplaceCampaignsService` or `SellerPromotionsService`.
- Isolated full-stack Playwright (`pnpm test:e2e:homepage`) as a delivery gate for this change.

## Decisions

### 1. Give each domain its own service and persisted content

Create `HomepageCmsService` (and admin controller) under `HomepageModule` or a dedicated `HomepageCmsModule` imported by `AppModule`. It owns banner list/create/update/reorder/delete, target validation on write, and the public mapping helper used by `HomepageService`. `AdminHomepageController` delegates to this service instead of `AdminService` campaign-fabricating paths.

Add campaign-owned detail fields for the content/media currently sourced from `HomepageBanner` (including content blocks and any campaign detail image, alt text, eyebrow, and theme values required by existing contracts). Campaign create/update/publish/preview/public-detail reads use those fields after backfill. `MarketplaceCampaignsService` then stops creating or updating `HomepageBanner`; deleting a CMS banner cannot remove campaign detail content.

Campaign code exposes a read-only query such as “is this campaign publicly active?” for target checks. It MUST NOT accept CMS banner payloads. Campaign DTOs, runtime guards, seller invitation events, seller participation links, and notification deep links use `campaignId`; `bannerId` is no longer required. The seller invitation scheduler MUST NOT skip a campaign because it has no banner.

Alternative considered: keeping campaign detail content on `HomepageBanner` would make campaign publish/detail and seller flows fail for a campaign with no banner, so duplicating during migration and moving ownership is required before severing the relation.

### 2. Replace required `campaignId` with typed target columns

On `HomepageBanner`:

- `targetType`: `CAMPAIGN | PRODUCT | SHOP | CATEGORY | SEARCH | URL`
- `targetId`: UUID for CAMPAIGN/PRODUCT/SHOP/CATEGORY
- `targetQuery`: string for SEARCH keyword or URL path when needed
- `displayFrom` / `displayUntil`: optional timestamptz
- `priority`: integer (existing `sortOrder` may remain as the unique-per-module order key)
- `isEnabled`: boolean

Make legacy `campaignId` nullable during the expand phase, before enabling either independent write path. It may remain temporarily unique for compatibility, but new CMS writes use only `targetType`/`targetId`; this permits multiple banners to target one campaign and a campaign to have no banner. Remove the legacy relation only in the contract phase after all readers have switched.

Write-time checks: target exists for entity types; URL is a same-origin relative path; SEARCH query is bounded text; media is allowlisted. Creating a banner with a CAMPAIGN target, or changing its target, performs a server-authoritative lookup and accepts only a campaign that exists, is published, and derives to `ACTIVE` at command evaluation time. A lifecycle change racing immediately after validation is handled by read-time validation. An update that leaves the stored target unchanged may still edit banner copy, media, schedule, enabled state, or priority after the campaign becomes unavailable.

Alternative considered: allowing inactive or missing campaign identifiers to be newly saved produces knowingly broken links. Existing migrated links are treated differently because preserving historical banner rows is required.

### 3. Resolve href at homepage read time

`HomepageService` asks the CMS mapper for eligible banners: enabled, in display window, module enabled. For each banner it resolves:

| targetType | href if valid                | if target fails                                                     |
| ---------- | ---------------------------- | ------------------------------------------------------------------- |
| CAMPAIGN   | `/campaigns/:campaignId`     | keep the banner card, omit href and campaign content, notify admins |
| PRODUCT    | existing product public href | omit href, keep the banner                                          |
| SHOP       | existing shop public href    | omit href, keep the banner                                          |
| CATEGORY   | existing category href       | omit href, keep the banner                                          |
| SEARCH     | `/search?q=...`              | omit href if query empty                                            |
| URL        | the stored relative path     | omit href if unsafe                                                 |

Do not auto-append active campaigns that have no banner. Do not hide a CMS-eligible banner because its campaign fetch failed.

Public campaign detail becomes `GET /api/v1/campaigns/:campaignId` (or equivalent campaign-owned path). Keep `GET /api/v1/campaigns/by-banner/:bannerId` only as a temporary compatibility alias that looks up a CMS banner with a CAMPAIGN target and then returns that campaign; remove it once clients use campaign ids. Storefront route `/campaigns/[campaignId]` is canonical; `/banner/[bannerId]` may redirect when the banner still targets a campaign, otherwise not-found.

Alternative considered: keeping `/banner/:bannerId` as campaign identity leaves CMS and promotion sharing one URL space.

### 4. Use one controlled carousel timer

The buyer carousel keeps one active index and one 3-second timer only when at least two eligible banners exist. Advancing beyond the final index wraps to zero; previous from zero wraps to the final index. Previous/next icons and position indicators render inside the banner frame, while touch swipe updates the same controlled index rather than maintaining separate navigation state.

Any manual navigation clears the current timer, updates the index, and starts a new full interval. Pointer hover and focus within the carousel do not suspend the timer. An `IntersectionObserver` pauses the timer only when the banner frame has no visible intersection with the viewport; re-entry starts a new full interval. Effect cleanup clears the timer and observer when eligibility changes or the component unmounts, preventing duplicate timers and stale indexes. Zero or one eligible banner does not allocate an autoplay timer or render redundant controls.

Alternative considered: independent timers inside each slide make manual navigation and visibility changes race, causing skipped slides or multiple advances.

### 5. Independent clocks and idempotent target-failure notification

Banner eligibility uses homepage evaluation time against `displayFrom`/`displayUntil` and `isEnabled`. Campaign activity uses existing `campaignLifecycleAt` only to decide whether to attach a campaign href and campaign content. Cancelling, ending, or deleting a campaign does not delete or hide the banner. Deleting a banner does not cancel a campaign.

When a previously valid `CAMPAIGN` target cannot be fetched or is no longer `ACTIVE`, `HomepageCmsService` omits `href` and campaign content and records an unavailable-target state for admin.

Notification detection has three sources so it does not depend on buyer traffic: an immediate campaign lifecycle event for explicit cancellation/deletion, a scheduled reconciliation for time-based expiry or missed events, and CMS public/admin read-time validation as a fallback. All sources normalize the reason (`ENDED`, `CANCELLED`, `MISSING`, or `FETCH_FAILED`) and submit the same `SYSTEM` in-app event to `NotificationService` with a deep link to `/admin/homepage`.

Use a stable reference key containing banner id, target campaign id, and normalized failure reason. The notification persistence layer combines that reference with notification type and recipient and relies on a unique database key/upsert or duplicate-conflict handling. Therefore repeated reads, scheduler passes, and concurrent workers produce at most one notice per admin for the same failure key. Event submission is isolated from homepage rendering with failure handling; a notification outage cannot fail the buyer response. This change intentionally does not reset the key after recovery, so the same association and reason will not notify again unless it becomes a different key through retargeting.

### 6. Admin surfaces stay split

`/admin/homepage` is the CMS editor (target picker, display window, priority). Its campaign picker lists active campaigns, and the server repeats that validation when creating or retargeting because picker data can become stale. `/admin/campaigns` loses any “create homepage banner” side effect and may link operators to Homepage when they want a card. Preview is non-persisting. Existing banners whose campaign later becomes unavailable remain editable for non-target fields and show an unavailable-target notice.

### 7. Browser verification is quick E2E only

Run only `pnpm test:e2e:homepage:quick` against already-running local API/web. It must not start Docker, migrate, seed, snapshot, mutate the developer database, invoke isolated full E2E, or fan out into full unit/API suites. The seeded journey verifies the independent campaign/banner read paths, active campaign target navigation, unavailable-target presentation, 3-second carousel advance, looping, manual controls, and pause behavior that can be observed without data mutation. This intentionally leaves destructive lifecycle transitions outside the delivery gate.

Alternative considered: isolated full E2E can mutate campaign state safely, but this change is explicitly scoped to the quick gate.

## Risks / Trade-offs

- **[Running campaigns disappear from homepage until operators create banners]** → Migration converts each existing 1:1 banner into a CMS banner targeting that campaign; document that new campaigns need a homepage card on purpose.
- **[Campaign detail content is lost when banners become optional]** → Expand campaign-owned content/media fields and copy existing banner-owned campaign detail before switching reads or writes; retain legacy fallback through the compatibility window.
- **[Seller invitations stop for campaigns without banners]** → Key contracts, scheduler events, and deep links by campaign id and remove the scheduler's banner-presence guard before independent campaign creation is enabled.
- **[Stale CAMPAIGN targets after cancel/end/delete]** → Keep the banner visible, drop campaign href/content, mark admin “target unavailable”, and send one deduplicated admin notice.
- **[Compatibility URLs at `/banner/:id`]** → Redirect only when the banner exists and still targets a campaign; otherwise sanitized 404.
- **[Homepage extra lookups per banner]** → Banner volume is small; batch-validate targets in one query set per type.
- **[Autoplay races with manual navigation or scrolling]** → Keep one controlled index/timer, restart after manual navigation, pause only while the banner frame is outside the viewport, and clean up the timer/observer whenever inputs change.

## Migration Plan

1. **Expand:** add nullable banner target/display columns and campaign-owned detail content/media. Make legacy `HomepageBanner.campaignId` nullable before any independent writes, while temporarily retaining its unique relation for old rows. Deploy code that can dual-read new fields with legacy banner fallback; write behavior remains coupled behind a disabled switch.
2. **Backfill:** for every legacy pair, copy banner campaign detail content/media into campaign-owned fields and set banner `targetType=CAMPAIGN`, `targetId=campaignId`, enabled/display/priority values that preserve the existing row. Record row counts and detect missing campaigns, malformed content, and duplicate order before continuing; do not delete legacy values.
3. **Switch campaign consumers:** move campaign create/update/publish/preview/detail to campaign-owned fields; change contracts, seller invitation scheduling, participation links, and notifications to `campaignId`; add the campaign-id public route. Verify a campaign with no banner can complete those flows.
4. **Switch CMS consumers:** enable `HomepageCmsService`, server-side active-campaign validation on create/retarget, typed target mapping, and independent banner writes. Stop fabricating campaigns from admin banner creation and stop campaign writes to banners. Keep the by-banner route and dual-read behavior only as compatibility paths.
5. **Contract:** after integrity checks show no legacy readers, remove required `bannerId` from public/seller contracts, remove campaign reads from banner content, retire the by-banner client usage, and then drop the legacy banner `campaignId` relation/columns when safe.
6. **Rollback:** before step 3 or 4 is enabled, application rollback is safe because legacy columns and behavior remain. After independent campaign or banner rows have been written, older binaries that require a 1:1 pair are not safe; use roll-forward with the retained dual-read columns. Database restore is an explicit operational recovery, not an automatic down migration.

## Open Questions

None. Target types, active-at-write campaign validation, independent schedules/content ownership, stable no-reset notification dedupe, controlled 3-second carousel behavior, quick-only verification, and a separate CMS service are fixed by the request.
