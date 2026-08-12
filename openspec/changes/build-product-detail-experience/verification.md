# T10 Verification Evidence

Verified locally on 2026-08-12 for `build-product-detail-experience`.

## Database and contracts

- `npx --yes pnpm@10.34.5 install --frozen-lockfile` completed with the pinned pnpm 10.34.5.
- `pnpm db:format` and `pnpm db:validate` passed.
- `pnpm db:verify` recreated the guarded test schema, deployed migrations twice, seeded twice, and verified counts, product image/variant integrity, inventory facts, and cross-product association rejection.
- Contract, NestJS service/controller, PostgreSQL, adapter, and interaction tests pass in the repository test suite.

## Browser verification

- `pnpm test:e2e:homepage:quick` passed against already-running local services (3 responsive buyer journeys; mutation-only cases intentionally skipped).
- `pnpm test:e2e:catalog:quick` passed (9 buyer/accessibility journeys; 3 isolated mutation-only cases intentionally skipped).
- `pnpm test:e2e:product:quick` passed all 9 product-detail journeys at 360×800, 768×1024, and 1440×900 without starting Docker, migrating, seeding, building, or mutating data.
- `pnpm test:e2e:product` passed its isolated PostgreSQL + production browser gate, including 9 product journeys, the guarded PostgreSQL suite, accessibility checks, and screenshot baseline verification. Its temporary Compose project was removed successfully.
- Screenshot baselines were manually reviewed for mobile, tablet, and desktop in `e2e/snapshots/product-detail-*.png`.

## Repository gates

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed. ESLint reports only the existing Next.js advisory warnings for three local dynamic `<img>` elements; there are no lint errors.
- `openspec validate "build-product-detail-experience" --strict --type change` passed.

## Local delivery state

- Development database migration and seed were applied.
- API and web development services are running at ports 3001 and 3000 respectively; the detail route can be viewed at `/products/00000000-0000-4000-8000-000000000301`.
