## MODIFIED Requirements

### Requirement: Admins manage campaign banners

An admin SHALL be able to list, create, inspect, update, reorder, enable, disable, and delete homepage CMS banners independently of promotion campaigns. Banner fields MUST include title, image, alt text, priority, enabled flag, optional description/theme, optional display window, and exactly one typed target (`CAMPAIGN`, `PRODUCT`, `SHOP`, `CATEGORY`, `SEARCH`, or `URL`). A banner MUST NOT require a campaign. A campaign selected while creating or retargeting a banner MUST exist, be published, and have derived lifecycle `ACTIVE`; otherwise the write MUST fail without changing the banner. Public homepage links MUST be the server-resolved href for the typed target when that target is valid to open; administrators MUST NOT paste a free-form destination except when `targetType = URL` and the value is a same-origin relative path. Image URLs MUST be trusted marketplace media URLs or relative media paths. Public homepage campaign modules MUST include enabled banners whose display window contains evaluation time even if a previously valid `CAMPAIGN` target is no longer fetchable; in that case the card MUST omit campaign href and campaign content, and the admin list MUST show an unavailable-target state. An admin MUST still be able to edit non-target fields of that stale banner.

#### Scenario: Admin creates a banner

- **WHEN** an admin submits valid banner copy, a typed target, priority, and display window
- **THEN** the banner is persisted without creating a campaign and appears on the public homepage while it is enabled and in window

#### Scenario: External destination is rejected

- **WHEN** destination path is an absolute external URL
- **THEN** the command fails and no banner row is written

#### Scenario: Admin creates a banner without a campaign

- **WHEN** an admin saves a banner targeting a category or internal URL
- **THEN** the banner is stored with no campaign identifier and campaign lists are unchanged

#### Scenario: Admin points a banner at an active campaign

- **WHEN** an admin selects `targetType = CAMPAIGN` and an existing published campaign whose derived lifecycle is `ACTIVE`
- **THEN** the banner is stored with that optional reference and the campaign record is not modified

#### Scenario: Admin submits an unavailable campaign target

- **WHEN** an admin creates or retargets a banner to a campaign that is not `ACTIVE` or cannot be fetched
- **THEN** the command returns a target validation error and no banner field is changed

#### Scenario: Admin edits a banner after its campaign expires

- **WHEN** an admin changes only copy, media, display window, enabled state, or priority on a banner whose existing campaign target is now unavailable
- **THEN** those non-target changes are saved and the unavailable target remains visibly flagged

#### Scenario: Admin deletes a banner that targets a campaign

- **WHEN** an admin deletes a banner whose target is a campaign
- **THEN** the banner is removed from subsequent admin and homepage lists and the campaign remains unchanged
