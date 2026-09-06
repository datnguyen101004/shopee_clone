## Purpose

Let marketplace operators merchandize the homepage with banners and sections that are independent of promotion campaigns, while still allowing a banner to optionally send buyers to an active campaign or another typed destination.

## ADDED Requirements

### Requirement: Homepage CMS and promotion campaigns are separate domains

Homepage presentation and promotion economics SHALL be separate domains with independent lifecycles and persistence ownership. Creating, publishing, updating, or cancelling a campaign MUST NOT create, update, delete, or reorder a homepage banner. Creating, updating, reordering, or deleting a banner MUST NOT create or mutate a campaign, voucher, scheduled discount, or flash-sale rule. Campaign detail content and media MUST be owned by the campaign domain and MUST remain readable when no banner targets the campaign. Banner writes MUST be served by the homepage CMS capability, not by the campaign/promotion capability.

#### Scenario: Admin publishes a campaign

- **WHEN** an admin publishes a complete campaign
- **THEN** no homepage banner is created and the public homepage campaign-banner module is unchanged unless an existing banner already targets that campaign

#### Scenario: Admin creates a banner without a campaign

- **WHEN** an admin saves a valid banner whose target is a product, shop, category, search, or internal URL
- **THEN** the banner is persisted without a campaign identifier

#### Scenario: Campaign operates without a banner

- **WHEN** an admin creates and publishes a valid campaign that has no homepage banner
- **THEN** campaign detail, seller invitation, and seller participation use the campaign identifier and remain available without a banner identifier

### Requirement: Banners use optional typed click targets

A homepage banner SHALL declare exactly one `targetType` of `CAMPAIGN`, `PRODUCT`, `SHOP`, `CATEGORY`, `SEARCH`, or `URL`, plus a `targetId` or target value required by that type. A `CAMPAIGN` target MUST store `targetId` equal to the campaign identifier. Image URLs MUST be trusted marketplace media URLs or relative media paths. `URL` targets MUST be same-origin relative paths. Scriptable, external absolute, and credential-bearing destinations MUST be rejected.

#### Scenario: Banner targets an active campaign

- **WHEN** an admin creates a banner or changes its target with `targetType = CAMPAIGN` and `targetId` of an existing published campaign whose derived lifecycle is `ACTIVE`
- **THEN** the banner is stored with that optional campaign reference and no other target

#### Scenario: Invalid campaign target is rejected

- **WHEN** an admin creates or retargets a banner to a missing, unpublished, draft, announced, enrolling, scheduled, ended, cancelled, or fetch-failed campaign
- **THEN** the command fails with a target validation error and no banner field is changed

#### Scenario: Non-target edit survives a later campaign failure

- **WHEN** an admin edits only presentation or scheduling fields of a banner whose previously valid campaign target has since become unavailable
- **THEN** the non-target fields are saved, the target remains marked unavailable, and the campaign is not mutated

#### Scenario: Banner targets a product

- **WHEN** an admin saves a banner with `targetType = PRODUCT` and a public product identifier
- **THEN** a later eligible homepage read uses that product's public href

#### Scenario: External URL target is rejected

- **WHEN** an admin submits `targetType = URL` with an absolute external or scriptable destination
- **THEN** the command fails and no banner field is changed

### Requirement: Banner display schedule is independent of campaign schedule

Each banner SHALL have its own enabled flag, optional UTC display window, and priority. Public homepage inclusion SHALL use the banner's display rules, not the campaign announcement/enrollment/start/end timestamps. A campaign being active MUST NOT by itself place a banner on the homepage.

#### Scenario: Banner is in its display window without a campaign

- **WHEN** an enabled banner targeting a shop is inside its display window at evaluation time
- **THEN** the public homepage includes that banner in priority order

#### Scenario: Active campaign has no banner

- **WHEN** a campaign is active and no banner targets it
- **THEN** the homepage campaign-banner module does not invent a card for that campaign

#### Scenario: Banner window ended while campaign is still active

- **WHEN** a banner targeting an active campaign has passed its exclusive display end time
- **THEN** the banner is omitted from the public homepage and the campaign remains active for pricing

### Requirement: Campaign click-through is validated at read time

When a banner's target is `CAMPAIGN`, the public homepage MUST direct buyers to that campaign only if the campaign exists and its derived lifecycle is `ACTIVE`. Missing, draft, announced, enrolling, scheduled, ended, cancelled, unpublished, and fetch-failed campaigns MUST NOT receive that click-through and MUST NOT contribute campaign content on the banner. The banner itself MUST still appear when it is enabled and inside its own display window; public href for that card MUST be omitted rather than pointing at a failed campaign. Admin reads MUST mark the target unavailable.

#### Scenario: Banner points at a running campaign

- **WHEN** an enabled banner in its display window targets a published campaign inside `[startsAt, endsAt)`
- **THEN** the public homepage includes the banner and its href is the campaign's public route

#### Scenario: Banner points at an ended campaign

- **WHEN** an enabled banner in its display window targets a campaign whose exclusive end time has passed
- **THEN** the public homepage still includes the banner without a campaign href or campaign content and does not send the buyer to the campaign

#### Scenario: Targeted campaign is deleted or unknown

- **WHEN** a stored banner targets a campaign identifier that no longer exists or whose fetch fails
- **THEN** the public homepage still includes the banner without a campaign href and admin listing marks the target unavailable

### Requirement: Admins are notified when a banner campaign target fails

When a homepage banner targets a campaign that later ends, is cancelled, is deleted, or otherwise cannot be fetched, the system SHALL send a deduplicated in-app notification to administrators. Repeating the same banner, campaign, and normalized failure reason MUST NOT create another notice. The notification MUST identify the banner and MUST NOT expose unpublished campaign body copy. Buyer-facing homepage rendering MUST NOT depend on notification creation succeeding. Resetting the dedupe state after a target recovers is outside this capability.

#### Scenario: Linked campaign ends

- **WHEN** a campaign targeted by an enabled banner leaves the `ACTIVE` lifecycle
- **THEN** administrators receive one notice that the banner's campaign destination is unavailable and the banner remains on the homepage without campaign click-through

#### Scenario: Linked campaign fetch fails repeatedly

- **WHEN** public or admin mapping again cannot fetch the same campaign for the same banner
- **THEN** no additional notification is created for that same failure

#### Scenario: Admin retargets the banner

- **WHEN** an admin changes the banner to a valid active campaign or another target type after a failure notice
- **THEN** the previous notice remains historical and a different banner/campaign/failure key can create one new notice

### Requirement: Public homepage maps CMS banners, not campaign inventory

The public homepage campaign-banner module SHALL list eligible CMS banners in priority order. Eligible means enabled and inside the banner display window; a failed campaign target MUST NOT disqualify the banner from that list. When the target is valid, the module MUST use the server-resolved href. When a `CAMPAIGN` target is unavailable, the card MUST render without href and without campaign content. The module MUST hide itself only when no banner passes CMS display rules. Homepage mapping MUST NOT query campaigns for the purpose of auto-generating banner cards.

#### Scenario: Multiple eligible banners

- **WHEN** three enabled banners are inside their display windows
- **THEN** the public homepage returns those banners ordered by priority, including any whose campaign target is currently unavailable

#### Scenario: No eligible banners

- **WHEN** every banner is disabled or outside its display window
- **THEN** the public homepage omits the campaign-banner module

### Requirement: Homepage carousel advances automatically and supports manual navigation

When at least two eligible banners are rendered, the homepage carousel SHALL automatically advance to the next banner every 3 seconds and SHALL loop from the final banner to the first. The carousel MUST render previous and next icon controls and selectable position indicators inside the banner frame, and MUST support touch swipe. A manual navigation action MUST select the requested banner and restart a full 3-second interval. Automatic advancement MUST continue while the pointer hovers over the carousel or keyboard focus is within it, and MUST pause only when the banner frame has no visible intersection with the viewport; when it becomes visible again, advancement MUST resume with a new full interval. With zero or one eligible banner, automatic advancement and redundant navigation controls MUST be disabled.

#### Scenario: Carousel advances after three seconds

- **WHEN** at least two eligible banners are visible and the carousel is not paused
- **THEN** the next banner becomes active after 3 seconds and the sequence loops after the final banner

#### Scenario: Buyer navigates with controls

- **WHEN** a buyer uses a previous/next icon, selects a position indicator, or swipes to another banner
- **THEN** that banner becomes active immediately and automatic advancement restarts with a full 3-second interval

#### Scenario: Autoplay continues during interaction

- **WHEN** the carousel is hovered or contains keyboard focus while its banner frame remains visible
- **THEN** automatic advancement continues at the 3-second interval

#### Scenario: Autoplay pauses when the banner leaves the viewport

- **WHEN** the buyer scrolls until no part of the banner frame intersects the viewport
- **THEN** automatic advancement pauses, and when the frame becomes visible again it resumes with a new full 3-second interval

#### Scenario: Only one banner is eligible

- **WHEN** the homepage renders exactly one eligible banner
- **THEN** that banner remains static and redundant previous, next, and position controls are not shown
