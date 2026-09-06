## 1. Display contract alignment

- [ ] 1.1 Confirm shared contracts treat a banner as the display identity of exactly one campaign, with buyer copy limited to title and content plus optional card media.
- [ ] 1.2 Confirm there is no public `GET /api/v1/banners/:bannerId` and no Markdown/CTA persistence fields.

## 2. Homepage running-campaign banners

- [ ] 2.1 Derive the homepage campaign-banner module from every currently `ACTIVE` campaign banner.
- [ ] 2.2 Link each homepage banner to `/banner/:bannerId` and omit draft, announced, enrollment-open, scheduled, ended, cancelled, unpublished, and malformed records.
- [ ] 2.3 Cover multiple running campaigns, not-yet-running campaigns, and ended campaigns in homepage mapping tests.

## 3. Public campaign page

- [ ] 3.1 Keep `GET /api/v1/campaigns/by-banner/:bannerId` as the public detail resource with title, content, lifecycle, and no independent CTA destination.
- [ ] 3.2 Keep `/banner/[bannerId]` rendering title and content, with loading, not-found, and retryable service-failure states.

## 4. Admin title-and-content authoring

- [ ] 4.1 Keep campaign create/update as the only way to create a banner; reject campaign-less homepage banner creates.
- [ ] 4.2 Keep admin preview non-persisting and validate nonblank title and content without destination/CTA fields.
- [ ] 4.3 Keep privileged audit summaries free of full content bodies and signed URLs.

## 5. Verification

- [ ] 5.1 Add or update a focused Playwright journey from a running homepage banner to `/banner/:bannerId`.
- [ ] 5.2 Do not implement the superseded Markdown parser, CTA columns, or admin homepage-banner editor from the previous version of this change.
