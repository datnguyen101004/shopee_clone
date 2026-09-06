## Why

Homepage banners and promotion campaigns are currently fused: creating a campaign also creates a banner, and a banner must own a campaign. That coupling forces every homepage card to be a campaign and every campaign to appear as merchandising. Operators need two independent tools: a CMS for what the homepage shows, and a promotion domain for discounts, vouchers, flash sales, eligible products, and campaign rules.

## What Changes

- Split Homepage/CMS and Promotion/Campaign into two loosely coupled domains with separate modules, APIs, and lifecycles.
- Homepage/CMS owns presentation: hero banners, carousel, homepage sections, image, display schedule, and priority.
- When at least two eligible banners are present, the buyer homepage carousel automatically advances every 3 seconds and loops from the last banner to the first. Buyers can navigate manually with previous/next icon controls, position indicators inside the banner frame, and touch swipe; manual navigation restarts the interval, hover/focus do not pause it, and autoplay pauses only while the banner frame is outside the viewport.
- Promotion/Campaign owns campaign detail content and media plus discount logic: campaign, scheduled discount, voucher, flash sale, eligible products, start/end time, and promotion rules. Campaign detail MUST NOT be stored on or require a homepage banner.
- A banner MAY optionally reference a campaign with `targetType = CAMPAIGN` and `targetId = campaignId`. Supported banner targets are `CAMPAIGN`, `PRODUCT`, `SHOP`, `CATEGORY`, `SEARCH`, and `URL`.
- Creating a campaign MUST NOT create a banner, and campaign publish, detail, seller invitation, and participation flows MUST work when the campaign has no banner. A banner MUST NOT require a campaign.
- Creating a banner with a `CAMPAIGN` target, or changing an existing banner to a new campaign target, MUST fail unless that campaign exists, is published, and has derived lifecycle `ACTIVE` at server evaluation time. Editing non-target fields of a previously valid banner remains allowed after its campaign becomes unavailable.
- If a linked campaign later ends, is cancelled, is deleted, or cannot be fetched, the banner MUST still render under its own display rules, its campaign destination and campaign content MUST be omitted, and administrators MUST receive one deduplicated notification for that banner/campaign/failure reason. The buyer MUST NOT be sent to the failed campaign. Resetting notification deduplication after recovery is outside this change.
- Banner management MUST live in a dedicated Homepage/CMS module and service. It MUST NOT live in `MarketplaceCampaignsService` or any promotion service.
- **BREAKING** for the current 1:1 campaign-banner aggregate, campaign contracts that require `bannerId`, and `/banner/:bannerId` as the campaign identity. Campaign public reads and seller-facing campaign notifications use `campaignId`. Existing banners migrate to optional `CAMPAIGN` targets, while campaign detail content currently stored on banners is copied to campaign-owned persistence before either side is allowed to exist independently.
- Supersedes the one-campaign/one-banner display coupling in `build-marketplace-campaign-seller-participation` and `add-admin-managed-banner-detail-pages`.

## Capabilities

### New Capabilities

- `homepage-cms`: Covers homepage banner/section presentation, controlled 3-second carousel playback and manual navigation, typed click targets, independent display schedule and priority, public homepage mapping, campaign-target failure handling with admin notification, and the CMS/promotion module boundary.

### Modified Capabilities

- `admin-catalog-configuration`: Replaces required campaign-owned homepage banners and destination-path-only cards with CMS banner administration, optional typed targets, and independent display windows.

## Impact

- **Persistence:** Expand the schema first with nullable banner target/display columns and campaign-owned detail content/media; backfill both directions of existing 1:1 data; then switch writes and finally retire the required unique banner-campaign relation. New banners and campaigns MUST NOT use the legacy relation.
- **API and contracts:** Add/move banner CRUD under a homepage CMS admin API. Public homepage resolves banner `href` from the typed target after validation. Campaign detail, campaign summaries, seller invitations, and participation links are keyed by campaign id and do not require `bannerId`.
- **Modules:** New `HomepageCms` service/module (or a dedicated service inside `HomepageModule`). `MarketplaceCampaignsModule` stops writing banners.
- **Frontend:** `/admin/homepage` authors banners; `/admin/campaigns` no longer creates homepage cards. Homepage carousel lists CMS banners in display window, not every active campaign, auto-advances every 3 seconds, and supports accessible manual navigation. A banner whose campaign target failed still appears without a campaign link.
- **Notifications:** Campaign lifecycle transitions, a scheduled stale-target reconciliation, and CMS read-time fallback emit the same idempotent event. A stable database-backed dedupe key prevents repeated homepage/admin reads or concurrent workers from creating duplicate admin notices. Recovery/reset-aware re-notification is not included.
- **Security:** Same-origin/allowlisted URL targets, trusted media, admin role on writes, no executable markup.
- **UI/UX:** `/admin/homepage` only offers active campaigns as new campaign targets and surfaces a server validation error if a submitted target is no longer active. Existing stale targets remain editable for non-target banner fields and are marked unavailable.
- **Verification:** Run **quick tests only**, using `pnpm test:e2e:homepage:quick` against already-running local API/web. The command MUST NOT start Docker, migrate, seed, build, take snapshots, mutate the developer database, or invoke isolated/full test suites.
