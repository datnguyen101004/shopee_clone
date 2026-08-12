## Context

See `proposal.md` for motivation and `specs/canonical-product-dataset/spec.md` for behavior. The current Prisma seed constructs 13 products in TypeScript and pins those stable IDs into homepage data. The public homepage, catalog, search, product-detail, and authentication/RBAC foundations already read PostgreSQL and must remain contract-compatible.

The supplied dataset has six related but non-identical JSON shapes and 1,377 total records. Every record currently has a name and image; three phone records lack price and 952 records lack rating. Most records use `product_url` as identity, `noithat` uses `product_id`, and `bachhoa` also supplies `id`. Root metadata and record notes contain information not represented in the existing normalized schema.

## Goals / Non-Goals

**Goals:**

- Make normalization repeatable, explainable, offline, and safe to rerun.
- Retain enough raw provenance to audit or re-normalize without scraping source sites.
- Reuse existing marketplace API contracts and make all product-facing fixtures select imported records.
- Keep dataset-owned cleanup strictly separated from user-owned data.

**Non-Goals:**

- Scraping, refreshing, hot-link health checking, or downloading remote images.
- Creating sellable credentials for the six synthetic source-shop owners.
- Modeling multiple variants from text that does not explicitly provide variant structure.
- Redesigning catalog queries or introducing a public dataset-administration API.
- Claiming source-generated ratings, prices, stock, or sales counters are real when they are generated fallbacks.

## Decisions

### 1. Keep `asserts/*.json` unchanged behind an explicit manifest

A typed manifest maps each filename to a stable source key, category slug, display name, source-shop identity, root-count accessor, and record adapter. The directory name remains `asserts` because it is the path supplied and will be referenced by commands and tests. Import never calls source websites.

The manifest first parses all files, validates declared versus actual counts, and produces an in-memory normalized plan. Only a fully valid plan enters the database transaction.

**Alternative considered:** Infer categories and adapters from arbitrary filenames. Rejected because silent filename or schema drift could misclassify products and make imports non-reproducible.

### 2. Store normalized commerce rows plus immutable provenance

Add additive Prisma models equivalent to:

- `DatasetSource`: stable source key, filename, source URL, SHA-256 file checksum, record count, root metadata JSON, normalization-policy version, and last imported timestamp.
- `DatasetProductRecord`: source relation, unique stable record key per source, unique product relation, source index, original identifiers/URLs where available, raw record JSON, generated-fields JSON, and normalized timestamp.

The existing `Category`, `Shop`, `Product`, `ProductVariant`, `ProductImage`, and `Inventory` models remain the serving projection. Provenance is also the ownership boundary: cleanup can touch a product only through its `DatasetProductRecord` link.

Root metadata JSON excludes the large `records` array. The record payload is retained as supplied. Generated metadata stores field name, policy identifier, and source/fallback status, not just a Boolean.

**Alternative considered:** Put raw source fields directly on `Product`. Rejected because the six schemas differ, future source fields would cause repeated migrations, and importer ownership would remain ambiguous.

### 3. Use deterministic source keys and derived identifiers

Stable source-record key priority is `product_url`, then `product_id`, then `id`, then a SHA-256 digest of source key, source index, name, and image URL. The last fallback exists for supported blank identifiers; validation still rejects records that cannot be serialized or normalized safely.

Product IDs use a fixed namespace and SHA-derived UUID formatting. Slugs use normalized Vietnamese name text plus a short source-key digest. SKUs use a source code plus digest. This avoids collisions from duplicate product names while remaining stable across runs. File order supplies deterministic display ordering, not identity when a stronger source key exists.

**Alternative considered:** Database-generated UUIDs and numeric sequences. Rejected because reseeding a clean database would change cross-fixture IDs and homepage pins.

### 4. Normalize every record into one default sellable projection

Each source maps to one canonical category (`bach-hoa`, `dien-thoai`, `my-pham`, `noi-that`, `the-thao`, or `thoi-trang`) and one synthetic source-backed shop. Each shop has a non-interactive system seed owner with no documented plaintext credential; the import does not grant admin access or alter normal RBAC bootstrap behavior.

Each record produces one active product, one `Mặc định` variant, one primary image, and one inventory row. Notes become the base description and are also retained raw. Original-price text is mapped to compare-at price only when it parses as a valid value greater than current price. Recognized rating-count, sold-count, brand, type, discount, and stock tokens are parsed conservatively; unrecognized content stays in provenance.

The project continues to store VND as integer minor-unit values according to its existing money convention.

**Alternative considered:** Create variants by guessing colors or sizes from free-form notes. Rejected because it would fabricate product structure and make later inventory behavior unreliable.

### 5. Generate blank fields with a versioned deterministic policy

Policy `dataset-v1` uses the stable source key as its hash seed:

- Missing price: median of positive prices in the same source category; for an even population, use the integer-rounded average of the two middle values. This currently affects exactly three `dienthoai` records.
- Missing rating: `4.00 + (hash modulo 101) / 100`, yielding 4.00–5.00 stars. This currently affects exactly 952 records. Valid provided ratings are preserved.
- Missing name: category display name plus a one-based source ordinal and short digest.
- Missing description: a Vietnamese sentence combining normalized name and category.
- Missing image: the repository's local product placeholder path.
- Missing rating count: a stable positive bounded value derived from a separate hash namespace after attempting note parsing.
- Missing sold count: a stable non-negative bounded value derived from a separate hash namespace after attempting note parsing.
- Missing inventory: stable on-hand quantity derived from a separate hash namespace, with reserved quantity initially zero.

Generated-field provenance distinguishes these values from supplied or parsed values. Hash namespaces prevent changing one generated field from accidentally changing all others. Timestamps used for ordering are fixed or derived from dataset ordering; operational `importedAt` timestamps are not used in public ordering.

**Alternative considered:** Faker or `Math.random()`. Rejected because tests and clean database rebuilds would drift.

### 6. Implement a plan-then-transaction, ownership-scoped upsert

The import pipeline has four stages:

1. Read bytes, calculate checksums, parse, validate, and normalize every source into a write plan.
2. Start one PostgreSQL transaction and upsert sources, categories, system owners, shops, products, variants, images, inventory, and provenance in bounded batches.
3. For each source, soft-delete or archive only provenance-linked products whose stable keys disappeared; reactivate importer-owned records that return.
4. Rebuild dataset-backed homepage category links and product pins, commit, then print a summary report.

Unique database constraints enforce source key, `(sourceId, stableRecordKey)`, product link, slug, and SKU invariants. Seeding calls this importer after the existing authentication/RBAC prerequisite data is available. A standalone root command such as `pnpm db:import:dataset` invokes the same application code; it is not a second importer.

**Alternative considered:** Delete all products and insert from scratch. Rejected because it could destroy seller-created data, invalidate foreign keys, and violate idempotency.

### 7. Make homepage selection data-derived and stable

Keep non-product homepage presentation data that remains useful, but replace old hard-coded product IDs and category references. Category links use the six canonical slugs. Product pins are selected by deterministic rank: normalized rating descending, sold count descending, then stable product ID ascending, with a fixed per-module limit. This makes repeated imports stable while ensuring every pinned product exists.

The catalog and product-detail APIs need no separate fixture layer because they already read normalized database rows. Existing frontend image fallback behavior is verified and strengthened only if imported remote URLs expose a gap.

### 8. Verify canonical ownership rather than total database size

Verification queries through provenance links so unrelated products do not make canonical checks fail. Assertions cover per-file and aggregate counts, checksums, generated-value counts, uniqueness, rating/price/inventory bounds, valid relationships, and homepage references. Parser tests exercise all six adapters; integration tests import twice, simulate malformed input and write rollback, and query the existing public APIs. Browser verification uses the established quick homepage, catalog, and product-detail suites rather than the full slow E2E suite.

## Risks / Trade-offs

- [Remote image hosts can throttle or remove files] → Preserve URLs, do not block import on network checks, and render a local browser fallback.
- [Raw payload increases database size] → Store one JSON payload per 1,377 records; this is acceptable for the development dataset and prevents information loss.
- [Synthetic metrics look realistic but are not factual] → Mark every generated field in provenance and document the policy; never describe generated metrics as source observations.
- [A single transaction may exceed default interactive transaction limits] → Validate outside the transaction, use bounded bulk operations, configure an explicit reasonable timeout, and test against Docker PostgreSQL.
- [In-memory catalog filtering may become slower with 1,377 rows] → Add response-time coverage for representative queries; query optimization is a follow-up unless acceptance limits fail.
- [Source schema drift can silently corrupt mapping] → Strict adapters, exact count checks, checksums, fixture-contract tests, and atomic rejection prevent partial adoption.
- [Source content may have licensing or hot-link constraints] → Keep provenance and repository ownership visible; TS01 does not assert redistribution rights or fetch additional content.

## Migration Plan

1. Add provenance tables and uniqueness constraints with an additive Prisma migration; deploy it before running import.
2. Add adapters, deterministic normalization, import orchestration, commands, and tests.
3. Convert seed/homepage composition to call the canonical importer and update database verification away from exact total-row assumptions.
4. Run migration twice and import twice against local Docker PostgreSQL, then execute backend and quick browser verification.
5. Document dataset maintenance and make imported records the default for later tasks.

Rollback disables the new import command and restores the prior seed composition while leaving additive provenance tables intact. If an imported dataset must be withdrawn, use an ownership-scoped cleanup that soft-deletes only provenance-linked products; do not drop user data. Dropping the new tables is a separate explicit migration after confirming no later feature depends on them.
