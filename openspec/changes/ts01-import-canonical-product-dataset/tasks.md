## 1. Dataset Contract and Baseline

- [x] 1.1 Register the six `asserts/*.json` files in an explicit typed dataset manifest with stable source, category, shop, and count metadata.
- [x] 1.2 Add shared source/root/record validation types and repository-root-safe dataset path resolution that performs no network requests.
- [x] 1.3 Add fixture-contract tests proving every JSON file parses, declared counts match actual counts, and the aggregate remains 1,377 records.
- [x] 1.4 Add SHA-256 checksums and a versioned `dataset-v1` normalization-policy identifier to the validated import plan.

## 2. Persistence and Ownership Boundary

- [x] 2.1 Extend the Prisma schema with dataset source and product provenance models, relationships, generated-field metadata, and importer-ownership constraints.
- [x] 2.2 Add unique indexes for stable source keys, per-source record keys, and one-to-one imported product provenance without weakening existing product constraints.
- [x] 2.3 Generate an additive Prisma migration and verify it applies cleanly twice through the project's migration workflow.
- [x] 2.4 Add repository helpers that query canonical counts through provenance links instead of assuming all database products belong to the dataset.

## 3. Parsing and Deterministic Normalization

- [x] 3.1 Implement strict adapters for `bachhoa`, `dienthoai`, `mypham`, `noithat`, `thethao`, and `thoitrang`, including root metadata extraction without duplicating the records array.
- [x] 3.2 Implement stable record-key priority, deterministic UUID, Vietnamese slug, SKU, and ordering derivation with duplicate-name collision coverage.
- [x] 3.3 Implement price normalization and deterministic category-median fallback, preserving compare-at price only when a parsed original price is valid and greater.
- [x] 3.4 Implement rating normalization with source-rating preservation and deterministic 4.00–5.00 fallback using isolated hash namespaces.
- [x] 3.5 Parse supported description/notes metadata such as rating count, sold count, brand, type, discount, and stock while retaining the original payload.
- [x] 3.6 Implement deterministic fallbacks for blank name, description, image, rating count, sold count, and inventory, recording field-level generation provenance.
- [x] 3.7 Produce one validated marketplace projection per record: source category, source shop, active product, default variant, primary image, and inventory.
- [x] 3.8 Reject the entire normalized plan on unsupported types, unsafe identity, invalid money/rating/inventory bounds, duplicate keys, slugs, or SKUs.

## 4. Transactional Import Pipeline

- [x] 4.1 Implement the read-validate-normalize phase so all file and record errors occur before database mutation.
- [x] 4.2 Upsert the six source records, canonical categories, non-interactive source-shop owners, and source-backed shops inside one bounded PostgreSQL transaction.
- [x] 4.3 Upsert all products, default variants, images, inventory, and provenance in batches while preserving stable relationships on rerun.
- [x] 4.4 Reactivate returning dataset records and soft-delete only provenance-linked products removed from a later source revision.
- [x] 4.5 Add atomic rollback behavior and an import summary containing per-source counts, checksums, and generated-field totals without printing raw records.
- [x] 4.6 Expose the shared importer through API-workspace and root `db:import:dataset` commands using the pinned package-manager workflow.

## 5. Seed and Marketplace Adoption

- [x] 5.1 Replace the 13 hard-coded demo product seed as the canonical catalog source while preserving authentication, RBAC, and unrelated user seed prerequisites.
- [x] 5.2 Rebuild homepage category references and product pins from deterministic rankings of imported products, removing dependencies on retired demo IDs.
- [x] 5.3 Update database verification to assert six sources, 1,377 active imported products and related projections, 3 generated prices, and 952 generated ratings.
- [x] 5.4 Verify existing homepage, catalog, search/filter/sort, and product-detail APIs serve imported records without public contract changes.
- [x] 5.5 Verify remote image failures render the local product placeholder and add only the minimal frontend fallback change if current handling is insufficient.

## 6. Automated Verification

- [x] 6.1 Add unit tests for all adapters, note parsers, deterministic hashes, category-median price behavior, rating bounds, and generated-field provenance.
- [x] 6.2 Add integration tests for aggregate/per-source counts, relationship integrity, unique IDs/slugs/SKUs, normalized value bounds, and raw provenance retention.
- [x] 6.3 Add idempotency tests that import unchanged files twice and assert no duplicate rows or normalized-value drift.
- [x] 6.4 Add failure tests for malformed JSON, count mismatch, invalid records, transactional rollback, and protection of unrelated user-created data.
- [x] 6.5 Add API integration coverage using representative products from all six categories plus search, filter, sort, pagination, and detail lookup.
- [x] 6.6 Run migration and seed/import twice against Docker PostgreSQL, then run database verification against the resulting canonical state.
- [x] 6.7 Run the established quick homepage, catalog, and product-detail Playwright suites against the imported catalog rather than the full slow E2E suite.

## 7. Documentation and Final Quality Gate

- [x] 7.1 Document file ownership, source-to-category mapping, deterministic generation rules, provenance fields, commands, and the process for updating dataset revisions.
- [x] 7.2 Document that generated commerce metrics are synthetic development values and that TS01 neither scrapes sources nor validates redistribution rights.
- [x] 7.3 Run formatting, lint, type-check, backend/frontend unit and integration tests, Prisma validation, and production builds with the pinned pnpm version.
- [x] 7.4 Run the real standalone import against the local migrated database, inspect its summary, and confirm all TS01 spec scenarios and canonical counts pass.
