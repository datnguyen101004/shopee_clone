## Purpose

Defines the observable contract for turning the repository-owned JSON dataset into a complete, repeatable, traceable marketplace catalog used by subsequent development.

## ADDED Requirements

### Requirement: Repository dataset is the canonical development catalog

The system SHALL recognize the six version-controlled JSON files under `asserts/` as the canonical product source for local seeding, automated verification, and subsequent marketplace feature development.

#### Scenario: Complete supplied dataset is discovered

- **WHEN** the dataset manifest is loaded against the supplied files
- **THEN** it identifies `bachhoa.json` with 51 records, `dienthoai.json` with 93, `mypham.json` with 300, `noithat.json` with 300, `thethao.json` with 294, and `thoitrang.json` with 339
- **AND** the expected aggregate is 1,377 records across six source categories

#### Scenario: Required dataset file is absent

- **WHEN** any manifest file is missing or cannot be parsed as JSON
- **THEN** the import fails before any catalog data is written
- **AND** the failure identifies the file without logging the entire source payload

### Requirement: Source data is validated before persistence

The importer MUST validate root metadata, declared record counts, record collection shape, supported scalar types, and the normalized constraints needed by the marketplace before opening the database write transaction.

#### Scenario: Declared and actual counts disagree

- **WHEN** a file's declared record count differs from the number of records it contains
- **THEN** validation rejects the complete import with a count-mismatch error
- **AND** the previous database state remains unchanged

#### Scenario: A supported field is blank

- **WHEN** a source record has a blank optional or normalizable field
- **THEN** the importer completes that field through the documented deterministic generation policy
- **AND** records the generated field name and policy version in provenance metadata

#### Scenario: A record cannot be normalized safely

- **WHEN** a record has an unsupported type or cannot produce a stable identity after fallback normalization
- **THEN** validation rejects the complete import before database mutation

### Requirement: Normalization is deterministic and complete

For identical file bytes and importer policy version, the system SHALL produce identical identifiers and normalized business values without network access, current-time randomness, or unseeded random values.

#### Scenario: Current missing prices are completed

- **WHEN** the supplied dataset is normalized
- **THEN** the three missing `dienthoai` prices receive a positive deterministic category-derived price
- **AND** all 1,377 persisted default variants have a positive integer VND price

#### Scenario: Current missing ratings are completed

- **WHEN** the supplied dataset is normalized
- **THEN** all 952 missing ratings receive a deterministic value from 4.00 through 5.00 stars
- **AND** existing valid source ratings are preserved
- **AND** all 1,377 products have a valid marketplace rating

#### Scenario: Same input is normalized again

- **WHEN** the same six files and policy version are processed more than once
- **THEN** product IDs, slugs, SKUs, generated fields, ordering values, and normalized relationships are identical on every run

### Requirement: Every source record has a usable marketplace projection

Each accepted source record SHALL create or update one source category, one source-backed shop relationship, one active product, one default variant, one primary product image, and one inventory record suitable for the existing public catalog and product-detail contracts.

#### Scenario: Source record contains common commerce metadata

- **WHEN** a record includes original price, discount, rating count, sold count, brand, type, or stock information in structured fields or notes
- **THEN** the importer maps supported values into the corresponding normalized fields
- **AND** preserves unconsumed information in the source record payload

#### Scenario: Presentation fields are absent

- **WHEN** a record lacks a name, description, image, rating count, sold count, or inventory value
- **THEN** the importer supplies a deterministic, category-aware fallback that satisfies existing API contracts
- **AND** marks each fallback as generated rather than source-provided

### Requirement: Original source information remains traceable

The system MUST preserve dataset-level metadata and record-level provenance alongside normalized products so that every imported value can be traced to its source file and record.

#### Scenario: Imported product is audited

- **WHEN** an operator inspects an importer-owned product
- **THEN** the database links it to the source file, content checksum, stable source record key, source index, root metadata, raw record payload, and generated-field metadata

#### Scenario: Source-specific identifiers differ

- **WHEN** a record supplies `product_url`, `product_id`, or `id`
- **THEN** the importer derives its stable source record key using the documented priority for that source shape
- **AND** retains the original identifier or URL in provenance

### Requirement: Import is atomic, idempotent, and ownership-scoped

The system SHALL converge importer-owned catalog records to the current dataset in one database transaction and MUST NOT delete or overwrite unrelated user-created products, shops, categories, users, or authentication/RBAC data.

#### Scenario: Unchanged dataset is imported twice

- **WHEN** a successful import is immediately repeated with unchanged files
- **THEN** the second run creates no duplicate products, variants, images, inventory rows, sources, shops, or provenance records
- **AND** reports the same canonical counts and checksums

#### Scenario: Import fails during database persistence

- **WHEN** any database write in the import fails
- **THEN** all writes from that import attempt are rolled back
- **AND** the previously usable catalog remains intact

#### Scenario: A record is removed from a later dataset revision

- **WHEN** a previously imported source key no longer exists in its source file
- **THEN** only the matching importer-owned product is made unavailable through the project's reversible archive or soft-delete mechanism
- **AND** unrelated records remain unchanged

### Requirement: Marketplace surfaces use the canonical dataset

After a successful seed or standalone import, existing homepage, catalog, search/filter/sort, and product-detail flows SHALL resolve products from the canonical dataset without requiring a public API contract change.

#### Scenario: Catalog is queried after import

- **WHEN** a buyer requests the public catalog
- **THEN** results are drawn from the six imported categories
- **AND** existing pagination, search, filtering, sorting, money, rating, and image response shapes remain valid

#### Scenario: Homepage is seeded after import

- **WHEN** homepage data is composed
- **THEN** category links and product pins reference deterministic imported records rather than the retired hard-coded demo product IDs

#### Scenario: Product image cannot be loaded by the browser

- **WHEN** an imported remote image URL is unavailable
- **THEN** the marketplace renders its local product-image fallback without preventing the product card or detail content from loading

### Requirement: Operators can import and verify the dataset

The workspace SHALL expose a documented standalone import command, integrate the same pipeline into database seeding, and provide verification that distinguishes canonical counts from unrelated database records.

#### Scenario: Standalone import succeeds

- **WHEN** an operator runs the documented dataset import command against a migrated PostgreSQL database
- **THEN** the command exits successfully and reports source/category counts, imported record count, generated-field counts, and checksum prefixes
- **AND** does not print full raw records or require access to the source websites

#### Scenario: Canonical database state is verified

- **WHEN** database verification runs after import
- **THEN** it confirms six dataset sources, 1,377 active importer-owned products, 1,377 default variants, 1,377 primary images, 1,377 inventory rows, no duplicate stable keys/slugs/SKUs, three generated prices, and 952 generated ratings
