## TS01 Verification

Status: implemented and verified on 2026-08-13.

### Dataset and persistence

- Six required `asserts/*.json` files validated with 1,377 aggregate records.
- Standalone import reported 3 generated prices and 952 generated ratings under `dataset-v1`.
- Additive migration applied twice; second deployment reported no pending migrations.
- `db:verify` recreated the isolated schema, deployed migrations twice, seeded/imported twice, and confirmed 6 dataset sources plus 1,377 products, variants, images, and inventory rows.
- PostgreSQL integration tests passed for import idempotency, raw provenance, pre-write validation, transaction rollback, and protection of unrelated user-owned data.

### API and web

- Catalog PostgreSQL integration covered all six source categories, accent-insensitive search, filters, sorting, pagination, facets, and excluded-state behavior.
- Product-detail PostgreSQL integration covered imported HTTPS media, authoritative inventory, related products, unavailable states, and access filters.
- Remote product images use a strict six-host HTTPS allowlist and local placeholder fallback.
- Public homepage, catalog, and product-detail contract shapes remain compatible; product-detail media validation now permits safe HTTPS source URLs.

### Quality gates

- Prisma schema validation passed.
- Format check, lint, and TypeScript checks passed.
- Workspace tests passed: infrastructure 6; contracts 20; UI 10; web 71; API 92 (database suites additionally run explicitly).
- Production NestJS and Next.js builds passed.
- Quick Playwright suites passed against the real imported local database: homepage 3/3 responsive checks, catalog 9/9, and product detail 9/9; mutation-only cases were intentionally skipped in quick mode.
- Temporary local services used for quick E2E were stopped after verification.
