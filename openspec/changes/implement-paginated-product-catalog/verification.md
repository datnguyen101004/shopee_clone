## T08 verification evidence

Date: 2026-08-12

- `pnpm install --frozen-lockfile`: passed with pinned pnpm 10.34.5.
- `pnpm ci:validate`: passed; GitHub Actions remains manual-only.
- Prisma format/validate/generate: passed.
- `pnpm db:verify`: recreated the isolated test schema, deployed migrations twice, seeded twice, and verified 13 products, 15 variants, 13 local images, category coverage, ordering prerequisites, and all catalogue constraints.
- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`: passed across the workspace.
- `pnpm test`: passed infrastructure, contracts, UI, web, and API suites; the guarded real-PostgreSQL suite remained reserved for the isolated runner.
- `pnpm build`: passed NestJS and dynamic Next.js `/search` production builds.
- `pnpm test:e2e:homepage:quick`: 3 responsive homepage journeys passed and 3 database-mutating cases were intentionally skipped.
- `pnpm test:e2e:catalog:quick`: 6 responsive catalogue journeys passed and 3 database-mutating cases were intentionally skipped.
- `pnpm test:e2e:catalog`: passed a real isolated PostgreSQL Supertest suite plus 7 Playwright journeys; 2 duplicate viewport state-mutation cases were intentionally skipped. The runner removed its exact temporary Compose project.
- Axe reported no serious or critical violations for populated, empty, and failure catalogue states after the rating contrast fix.
- `catalog-mobile.png`, `catalog-tablet.png`, and `catalog-desktop.png` were manually reviewed for Shopee-like density, Vietnamese context, card consistency, pagination, and overflow.
- Delivery commit `46661aa` was pushed directly to `development` without a pull request. No Actions run was created for its SHA, issue `#9` was closed, and the repository has no T08 issue branch.
