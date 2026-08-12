## Why

The marketplace currently relies on a small hard-coded demo catalog, while the newly supplied `asserts/*.json` files contain 1,377 representative products across six categories. TS01 establishes this repository-owned dataset as the canonical development catalog so later Shopee-clone features are built and tested against realistic, repeatable data.

## What Changes

- Add a validated, transactional, and idempotent import pipeline for all six JSON files in `asserts/`.
- Normalize source records into categories, source-backed shops, products, default variants, images, inventory, ratings, sales counters, and homepage selections while retaining source metadata and each raw record for traceability.
- Generate only missing values using documented deterministic rules; the same dataset must always produce the same database state. TS01 currently covers 3 missing prices and 952 missing ratings.
- Replace the 13 hard-coded demo products and their homepage pins as the canonical catalog seed, without deleting unrelated user-created data or changing authentication/RBAC seed behavior.
- Provide standalone and seed-integrated import commands, verification reports, automated tests, and maintenance documentation.
- Treat `asserts/bachhoa.json`, `dienthoai.json`, `mypham.json`, `noithat.json`, `thethao.json`, and `thoitrang.json` as the product-data source of truth for subsequent development.

## Capabilities

### New Capabilities

- `canonical-product-dataset`: Validates, normalizes, persists, verifies, and serves the repository dataset as the canonical marketplace catalog with deterministic completion of missing fields and preserved provenance.

### Modified Capabilities

None. The repository has no synchronized main specs yet; existing public catalog, product-detail, and homepage API contracts remain compatible.

## Impact

- Backend: Prisma schema and migration, dataset parser/import services, seed and verification scripts, catalog/homepage seed composition, and API integration tests under `apps/api`.
- Frontend: browser checks and image/data fallbacks where required to render the imported catalog; no public route or contract break is intended.
- Data: six tracked JSON sources, 1,377 normalized products, six source categories and shops, plus provenance/checksum records. Existing user-owned records are outside importer cleanup scope.
- Tooling/docs: pnpm import command, dataset update policy, generation rules, count/checksum verification, and quick E2E coverage.
