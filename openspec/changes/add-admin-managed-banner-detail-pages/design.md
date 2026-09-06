## Context

See [proposal.md](proposal.md) for motivation. `build-marketplace-campaign-seller-participation` already owns the campaign aggregate, seller participation, and `GET /api/v1/campaigns/by-banner/:bannerId`. This design restates the display contract so this earlier change no longer specifies an independent banner CMS.

`HomepageBanner` is the campaign's public display row. `GET /api/v1/homepage` maps running campaign banners into the buyer homepage. Admin authoring lives on `/admin/campaigns`, not a dedicated homepage-banner editor with Markdown and CTA fields.

## Goals / Non-Goals

**Goals:**

- Keep one campaign to one banner, with a stable banner UUID as the public route key.
- Show every currently running campaign banner on the homepage and send each click to that campaign.
- Let admins upload buyer-facing copy as title and content, with optional card media.
- Keep publication of homepage cards aligned with the campaign `ACTIVE` window.

**Non-Goals:**

- A general-purpose CMS, Markdown source, optional CTA destinations, or `GET /api/v1/banners/:bannerId`.
- Guessable slugs or title-based URLs.
- Changing seller participation, campaign types, pricing, search, or notifications.

## Decisions

### 1. Keep the banner UUID as the campaign's public route key

The homepage mapper generates `href: /banner/{encoded banner id}`. The public resource is `GET /api/v1/campaigns/by-banner/:bannerId`. Invalid, missing, draft, and unannounced identifiers converge on the same sanitized 404.

A slug route was rejected because titles are mutable and the approved URL uses the opaque banner identifier.

### 2. Derive homepage banners from running campaigns

The campaign-banner homepage module is a derived list: every published, non-cancelled campaign whose lifecycle is `ACTIVE` contributes its one banner. Sort order may use the banner `sortOrder`. Announced, enrolling, scheduled, ended, and cancelled campaigns are omitted from the homepage even if `/banner/:bannerId` remains readable after announcement.

A separately curated banner CMS was rejected because it lets a homepage card exist without a campaign or point away from its campaign.

### 3. Store title and allow-listed content, not Markdown or CTA

Buyer-facing copy is a required title plus required allow-listed content blocks (heading, paragraph, list, same-origin link). Optional image/alt text support the homepage card. `destinationPath` always mirrors `/banner/:bannerId` and is not an admin-editable navigation target.

Markdown parsing, CTA label/destination pairs, and a second public banner endpoint were rejected because they recreate an independent CMS beside the campaign aggregate.

### 4. Author banners by creating campaigns

Admins create, preview, and edit title and content on the campaign admin API. Creating a campaign creates its banner atomically. Standalone homepage-banner create MUST NOT invent a campaign-less banner. Reorder may still change display order among running banners.

A dedicated `/admin/homepage/banners/:bannerId/edit` Markdown editor was rejected because campaign title and content already have an owner.

### 5. Share the campaign lifecycle predicate

Homepage listing uses campaign lifecycle `ACTIVE`. Direct detail uses the campaign public-read rule (readable from announcement through the exclusive end). Content must be nonblank after normalization. The public response includes `evaluatedAt`.

Module-only scheduling without a campaign window was rejected because the banner now represents the campaign.

## Risks / Trade-offs

- **[Homepage no longer teases upcoming campaigns]** → Accept this: the requested homepage list is running campaigns only. Upcoming campaigns remain reachable from `/banner/:bannerId` after announcement.
- **[Simple title-and-content may not express future layouts]** → Add typed content blocks deliberately instead of accepting arbitrary HTML or Markdown.
- **[Two OpenSpec changes overlap]** → This change restates display behavior only. Implementation remains on `build-marketplace-campaign-seller-participation`.

## Migration Plan

1. Keep the existing one-to-one campaign/banner relation.
2. Align homepage mapping to every `ACTIVE` campaign banner and `/banner/:bannerId` links.
3. Keep admin authoring on campaign create/update with title and content.
4. Do not deploy Markdown columns, CTA columns, or `GET /api/v1/banners/:bannerId`.

## Open Questions

None. One campaign has one banner, the homepage lists running campaign banners, a click opens that campaign, and admin copy is title plus content.
