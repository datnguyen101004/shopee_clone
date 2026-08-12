## 1. Shared Contract and Runtime Configuration

- [x] 1.1 Define framework-neutral homepage response, discriminated module, banner, category shortcut, and product summary types in `packages/contracts`.
- [x] 1.2 Add conservative runtime guards and contract fixtures/tests for valid, malformed, and forward-compatible homepage responses.
- [x] 1.3 Add and document the server-only `HOMEPAGE_API_BASE_URL` configuration with safe local, test, and production expectations.
- [x] 1.4 Restrict `.github/workflows/ci.yml` to `workflow_dispatch` only and document that automatic CI is temporarily disabled.

## 2. Homepage Persistence and Seed Data

- [x] 2.1 Add the homepage module enum, normalized module/banner/category/product relations, indexes, uniqueness rules, and UTC activation fields to the Prisma schema.
- [x] 2.2 Generate and review one additive migration that creates the homepage configuration tables without modifying existing catalogue data.
- [x] 2.3 Add deterministic IDs and Vietnamese seed content for campaign, category, Flash Sale, top-selling, Mall-style, daily recommendation, future, expired, and disabled module cases.
- [x] 2.4 Add routable local demo media and update seed references so banner and primary product images never depend on the placeholder `.local` image host.
- [x] 2.5 Extend database verification for homepage counts, schedule boundaries, order uniqueness, relation integrity, safe destinations, compatible child types, and idempotent reseeding.
- [x] 2.6 Recreate the isolated test database from empty, deploy the migration twice, seed twice, and confirm the expected homepage and existing marketplace records remain stable.

## 3. NestJS Homepage Capability

- [x] 3.1 Add a capability-oriented homepage module, controller, service, repository boundary, clock abstraction, and registration in `AppModule`.
- [x] 3.2 Query active modules with one captured clock value and deterministic `(sortOrder, id)` ordering for modules and child records.
- [x] 3.3 Map campaign and category records to typed payloads while rejecting inactive categories and empty, external, or disallowed buyer destinations.
- [x] 3.4 Map product-backed modules from active products/shops, choose the lowest-priced in-stock active variant deterministically, validate compare-at price, and supply primary-media or explicit fallback data.
- [x] 3.5 Omit invalid items and independently empty modules while preserving valid siblings and a successful zero-module response.
- [x] 3.6 Expose documented public `GET /api/v1/homepage` transport and a focused sanitized `application/problem+json` 503 failure response.
- [x] 3.7 Add service/repository tests for activation boundaries, stable order, module-type invariants, product eligibility, offer selection, safe links, partial modules, and the all-empty case.
- [x] 3.8 Add Supertest and isolated-PostgreSQL coverage for the successful contract, anonymous access, seeded response, and sanitized data-source failure.

## 4. Next.js Data Boundary and Route States

- [x] 4.1 Implement a server-only homepage API adapter with timeout, `cache: 'no-store'`, non-success handling, runtime validation, and typed error classification.
- [x] 4.2 Convert the storefront homepage to dynamic server rendering and add a route loading composition with labelled non-interactive skeletons.
- [x] 4.3 Add a typed module registry that preserves API order, renders every known module type, and ignores unknown future types without crashing.
- [x] 4.4 Implement API-driven campaign banner and benefits presentation using safe internal actions and meaningful media alternatives.
- [x] 4.5 Implement API-driven category shortcuts that retain Shopee-like responsive layout and route to catalogue category queries.
- [x] 4.6 Implement reusable product sections/cards for mock Flash Sale, curated top-selling, Mall-style, and daily recommendations with integer-minor-unit pricing and honest seeded labels.
- [x] 4.7 Replace all homepage commerce constants with populated, empty, and failed response compositions; never restore hardcoded product or campaign fallback data.
- [x] 4.8 Add the storefront `/products/[productId]` T10 handoff placeholder and verify every product card reaches a non-404 buyer page.

## 5. Frontend Component and Accessibility Tests

- [x] 5.1 Add adapter tests for timeout, transport error, non-success status, invalid contract, empty response, and successful typed response behavior.
- [x] 5.2 Add Testing Library coverage for module order and each campaign, category, Flash Sale, top-selling, Mall-style, and daily recommendation renderer.
- [x] 5.3 Add tests for loading, empty, failure/retry, unknown-module, missing-media, partial-module, and shared-shell preservation states.
- [x] 5.4 Add link, accessible-name, heading hierarchy, keyboard focus-order, and 44 px primary-action assertions, including the product placeholder route.
- [x] 5.5 Run automated axe analysis against populated, empty, and failed homepage compositions and fix every serious or critical violation.

## 6. Full-Stack Browser and CI Verification

- [x] 6.1 Extend local E2E setup to start isolated PostgreSQL, deploy/seed it, and run the built NestJS and Next.js applications through pinned pnpm commands with scoped cleanup.
- [x] 6.2 Keep the manually dispatched GitHub Actions workflow aligned with the same real API-driven homepage path without weakening the separate persistence smoke job.
- [x] 6.3 Add Playwright coverage for seeded module order/content, category navigation, product-card navigation, global shell continuity, and zero broken primary links.
- [x] 6.4 Add Playwright keyboard, touch-target, sticky-header, zero-overflow, and axe assertions at 360×800, 768×1024, and 1440×900.
- [x] 6.5 Regenerate homepage screenshot baselines at all reference widths and manually review campaign hierarchy, module density, Vietnamese copy, image fallbacks, empty/failure presentation, and Shopee fidelity.

## 7. Documentation, Gates, and Delivery

- [x] 7.1 Document the homepage aggregate contract, normalized seed ownership, activation-window semantics, local API/database prerequisites, and T08–T10/T36 boundaries.
- [x] 7.2 Run frozen install, Prisma format/validate/generate, migration/seed verification, format, lint, typecheck, all tests, production builds, full-stack Playwright, and strict OpenSpec validation; fix every failure.
- [ ] 7.3 Record local verification evidence for issue #8, commit and push T07 directly to `development` without a pull request, confirm no automatic GitHub Actions run was created while CI is manual-only, close the issue as completed, and confirm no issue branch remains.
