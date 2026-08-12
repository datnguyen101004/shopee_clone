# Canonical product dataset (TS01)

TS01 makes the six JSON files in `asserts/` the canonical development catalog. Import reads local files only: it does not scrape source websites, download images, or establish redistribution rights for the supplied content.

## Source mapping

| File | Source key | Category | Records |
| --- | --- | --- | ---: |
| `bachhoa.json` | `bachhoa` | `bach-hoa` | 51 |
| `dienthoai.json` | `dienthoai` | `thiet-bi-dien-tu` | 93 |
| `mypham.json` | `mypham` | `my-pham` | 300 |
| `noithat.json` | `noithat` | `noi-that` | 300 |
| `thethao.json` | `thethao` | `the-thao` | 294 |
| `thoitrang.json` | `thoitrang` | `thoi-trang` | 339 |

The expected total is 1,377 records. A missing file, malformed JSON, declared-count mismatch, unsupported field type, duplicate stable key, or invalid normalized value rejects the complete import before database writes.

## Commands

Apply migrations, seed prerequisite/homepage data, and import the canonical catalog:

```bash
npx --yes pnpm@10.34.5 db:migrate:deploy
npx --yes pnpm@10.34.5 db:seed
```

Import the dataset without running the rest of the seed:

```bash
npx --yes pnpm@10.34.5 db:import:dataset
```

Verify migrations, two seed/import runs, canonical counts, relationships, provenance, and database constraints against the isolated test database:

```bash
npx --yes pnpm@10.34.5 db:verify
```

The importer is transactional and idempotent. Repeating it with unchanged files does not create duplicate products, variants, images, inventory, shops, users, or provenance records. Cleanup is ownership-scoped through `DatasetProductRecord`; unrelated user-created data is not modified.

## Normalization policy

Policy `dataset-v1` derives product IDs, source IDs, slugs, SKUs, ordering timestamps, and fallback values from stable SHA-256 namespaces. It never uses Faker, `Math.random()`, source-site requests, or current time for public product ordering.

- Missing price: median positive source price in the same file/category. The supplied dataset has 3 generated phone prices.
- Missing rating: stable 4.00–5.00 value. The supplied dataset has 952 generated ratings.
- Missing name: category name, source ordinal, and digest.
- Missing description: Vietnamese category-aware sentence.
- Missing image: `/media/products/product-placeholder.svg`.
- Missing rating count, sold count, and inventory: separate stable bounded hashes after conservative note parsing.
- Original price: parsed from `Giá gốc` only when it is greater than the normalized current price.

Rating, price, stock, rating-count, and sold-count fallbacks are synthetic development data. They must not be described as factual source observations.

## Persistence and provenance

Normalized records use the existing `Category`, `Shop`, `Product`, `ProductVariant`, `ProductImage`, and `Inventory` tables. `DatasetSource` stores source/file metadata, SHA-256 checksum, record count, root metadata without the records array, policy version, and import time. `DatasetProductRecord` owns the product mapping and retains stable source identity, source index, URLs, raw notes, raw record JSON, and field-level fallback metadata.

Most sources use `product_url` for stable identity. `noithat.json` uses `product_id`; `id` and a deterministic record digest are later fallbacks. Source records removed in a future revision are reversibly archived only when they have dataset provenance.

## Updating the dataset

1. Replace only the intended JSON file in `asserts/`; keep its manifest filename and source category stable.
2. Confirm `record_count` equals the actual records array length. If an intentional revision changes the expected count, update the typed manifest and this table together.
3. Run the dataset unit tests and `db:verify`.
4. Run `db:import:dataset` and inspect the summary counts, generated-field totals, and checksum prefixes.
5. Run the homepage, catalog, and product quick E2E suites before using the revision in later tasks.

Remote image URLs remain source references. The web application permits only the six observed HTTPS image hosts and falls back to the local placeholder when a remote image cannot load.
