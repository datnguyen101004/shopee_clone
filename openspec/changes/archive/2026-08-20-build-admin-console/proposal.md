## Why

T12 and T22 already give admins role grant/revoke, bounded role audit, and shop onboarding approval, but `/admin` is still a placeholder: operators cannot search users or shops, suspend or restore them with a recorded reason, or edit category hierarchy, homepage banners, and selected marketplace display settings. T27 turns that stub into a controlled admin console now that seller catalog (T23), fulfillment (T25), and promotions (T26) exist and need operator oversight.

## What Changes

- Replace the T12 `/admin` placeholder with an admin-gated console: dashboard counts, navigation, and searchable cursor-paginated lists for users, shops, categories, homepage banners, and selected homepage/platform display settings.
- Add admin-only activate, suspend, and restore commands for users and shops that require a confirmation surface and a bounded reason; keep existing shop onboarding approval and reuse current `UserStatus` / `ShopStatus` values.
- Add admin category CRUD that preserves hierarchy and referential integrity (no orphan children, no hard-delete of categories still referenced by products or homepage shortcuts) and exposes homepage display ordering.
- Add admin homepage-banner and homepage-module configuration (enable, sort, schedule windows, banner copy/image/destination) so the public `/api/v1/homepage` read model is operator-authored rather than seed-only.
- Persist a mandatory privileged-action audit trail for every admin mutation: actor, target type/id, action, reason, before/after summary, and timestamp. Keep existing role-audit events; do not replace them.
- Enforce admin authorization on every new endpoint, trusted-origin mutations, Problem Details errors, private no-store caching, and safe projections that omit credentials, password hashes, tokens, and session secrets.
- Add contracts, migrations, services, focused UI, authorization/audit/integrity tests, and documentation.

Out of scope: account impersonation, multi-admin approval workflows, product/shop content moderation queues and user reporting (T28), returns/refunds (T29), live chat, payments, carrier adapters, and bulk CSV import/export.

## Capabilities

### New Capabilities

- `admin-console`: Admin-gated dashboard, navigation, searchable paginated entity lists, confirmation UX, and operational empty/error states.
- `admin-entity-administration`: Admin user and shop search plus activate/suspend/restore (and existing onboarding approval) with reasons, last-admin protection, and session invalidation on user suspend.
- `admin-catalog-configuration`: Admin category hierarchy, homepage display order, campaign banners, and selected homepage-module platform settings.
- `admin-privileged-audit`: Append-only privileged-action audit for admin mutations, with bounded newest-first listing distinct from role-audit events.

### Modified Capabilities

None. The repository has no synchronized main admin-console capability. This change composes existing role-based access control, shop onboarding approval, homepage read model, and catalog category records without claiming to modify a missing baseline specification.

## Impact

- **Database:** Add an append-only privileged-audit table and indexes for admin list/filter queries; reuse `User`, `Shop`, `Category`, `HomepageModule`, and `HomepageBanner`. No impersonation sessions.
- **Backend:** Add `/api/v1/admin/dashboard` and admin list/mutation routes under `/api/v1/admin/*`; keep existing `/api/v1/admin/users/:userId/roles*` and `/api/v1/admin/shops/:shopId/approval`. All new routes require current `admin` role.
- **Contracts:** Add exact admin dashboard, list/query, entity summaries, mutation commands, audit page, and Problem Details types in `@shopee-clone/contracts` without Nest/Next/Prisma types.
- **Frontend:** Expand `/admin` into a Seller-Center-like admin shell with users, shops, categories, banners/settings, and audit screens; keep header `Quản trị` visibility for admin role only.
- **Quality:** Authorization matrix (guest/buyer/seller/admin), confirmation+reason, category integrity, status-transition, last-admin, audit completeness, pagination/filter, and admin UI tests.
- **Tracking:** Implements GitHub issue #28 (T27). Dependencies T12, T22, and T23 are complete. Impersonation and multi-admin approval remain out of scope.
