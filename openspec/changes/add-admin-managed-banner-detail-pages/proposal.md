> **Superseded for implementation.** Banner presentation is owned by `separate-homepage-cms-and-promotion-campaigns` (optional campaign target, independent CMS lifecycle). Do not apply this change as a 1:1 campaign-banner or Markdown CMS.

## Why

Buyers currently meet campaign banners as independent homepage cards with generic destinations. The intended rule is simpler: one campaign has exactly one banner, that banner is how the campaign appears on the homepage, and activating it opens that campaign. Administrators should upload buyer-facing copy as a title and content, not maintain a separate banner CMS.

## What Changes

- Treat each homepage campaign banner as the display identity of exactly one platform campaign. A banner MUST NOT exist without its campaign.
- Make the homepage campaign-banner module list every currently running (`ACTIVE`) campaign banner. Activating a banner navigates to `/banner/:bannerId` for that campaign.
- Keep admin-authored buyer copy to a required title and required content. Optional image/alt text may appear on the homepage card. Admins MUST NOT set an independent destination or call-to-action.
- Use the existing public campaign-by-banner API and `/banner/:bannerId` page as the buyer detail. Do not add `GET /api/v1/banners/:bannerId`.
- Leave campaign type, schedule, seller enrollment, and pricing to `build-marketplace-campaign-seller-participation`. This change only restates the display contract: one banner per campaign, homepage shows running campaigns, click opens the campaign, admin copy is title plus content.

## Capabilities

### New Capabilities

- `buyer-banner-detail`: Covers the public campaign page identified by banner ID, homepage listing of running campaign banners, canonical `/banner/:bannerId` routing, title-and-content rendering, and loading/unavailable/not-found states.

### Modified Capabilities

- `admin-catalog-configuration`: Replaces standalone banner CMS, destination editing, and CTA fields with campaign-owned banner administration whose buyer copy is title and content.

## Impact

- **Persistence:** Keep the required one-to-one `HomepageBanner.campaignId` relation. Do not add Markdown or CTA columns.
- **API and contracts:** Public detail remains `GET /api/v1/campaigns/by-banner/:bannerId`. Homepage campaign-banner items use `/banner/:bannerId`. Admin authoring stays on `/api/v1/admin/campaigns`.
- **Frontend:** Homepage carousel shows every running campaign banner. `/banner/:bannerId` shows title and content. Admin campaign editor authors title and content rather than a separate homepage-banner CMS.
- **Security:** Admin authentication and role checks remain mandatory for writes; content stays allow-listed blocks with escaped rendering.
- **Ownership:** Implementation is owned by `build-marketplace-campaign-seller-participation`. This change exists so the earlier independent-banner Markdown/CTA plan is not applied.
