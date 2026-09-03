## Why

The current storefront homepage is visually useful but its categories, campaigns, and products are hardcoded in the Next.js page, so it cannot reflect persisted marketplace data or campaign schedules. T07 establishes the first public read model shared by NestJS and the storefront now that persistence, the responsive design system, and the global buyer shell are available.

## What Changes

- Add a versioned public homepage API that returns an ordered, typed set of active marketplace modules.
- Persist admin-seeded homepage module configuration, display order, and UTC activation windows in PostgreSQL through Prisma migrations and deterministic seed data.
- Resolve category shortcuts and product-backed Flash Sale, top-selling, Mall-style, and daily recommendation modules from active catalogue records instead of page constants.
- Render campaign banners and every supported commerce module in the Next.js storefront with reusable, responsive section and product-card compositions.
- Add explicit loading, per-module empty, partial-data, and full-request failure states so one unavailable module does not make the homepage misleading or unusable.
- Give every returned category, campaign, and product a stable buyer destination; reserve an honest product-detail placeholder until T10 implements the full detail experience.
- Add shared framework-neutral contracts, API contract/integration tests, frontend rendering tests, accessibility checks, and refreshed visual baselines.

## Capabilities

### New Capabilities

- `marketplace-homepage`: Defines the scheduled homepage read model, supported module types, API behavior, graceful degradation, stable buyer links, and responsive storefront rendering.

### Modified Capabilities

None. The existing storefront shell and persistence foundations are consumed without changing their published requirements.

## Impact

- **Backend:** Adds a capability-oriented homepage module under `apps/api`, public `/api/v1/homepage` transport, Prisma schema/migration changes, query mapping, seed data, OpenAPI metadata, and tests.
- **Frontend:** Replaces hardcoded module data in `apps/web/app/(storefront)/page.tsx` with server-side API consumption and reusable homepage sections while preserving the T05/T06 visual shell.
- **Contracts:** Adds discriminated homepage response types and stable link/product-summary contracts under `packages/contracts` without importing NestJS, Next.js, or Prisma types.
- **Persistence:** Adds scheduled display configuration and product selections while reusing existing category, product, variant, image, inventory, and shop records.
- **Delivery:** Extends unit, integration, browser, accessibility, production-build, migration, and deterministic-seed verification. GitHub Actions stays available through manual dispatch, while automatic push and pull-request triggers are temporarily disabled and local gates are required before delivery. No authentication, personalization, real sales ranking, or concurrency-safe Flash Sale is introduced.
