## Purpose

Provides the reproducible relational data foundation and integrity guarantees required by marketplace catalog, seller, and inventory capabilities.

## ADDED Requirements

### Requirement: Migration-owned schema creation

The system SHALL store every PostgreSQL schema change in ordered, committed migrations, and applying those migrations to an empty supported PostgreSQL database SHALL create the complete current schema without manual SQL preparation.

#### Scenario: Create schema from an empty database

- **WHEN** the migration deployment command is run against an empty isolated PostgreSQL database
- **THEN** all migrations complete successfully and every marketplace table, relation, index, enum, and constraint exists

#### Scenario: Reapply current migration history

- **WHEN** the migration deployment command is run against a database that already contains the current migration history
- **THEN** it completes without changing application data or creating duplicate schema objects

### Requirement: Initial marketplace entity model

The schema SHALL represent users, one-owner shops, hierarchical categories, products, product variants, product images, and one inventory record per variant with explicit required relationships.

#### Scenario: Persist a complete sellable product

- **WHEN** a product is stored for an existing shop and category with variants, images, and inventory
- **THEN** the database preserves the complete relation graph and each variant resolves to exactly one inventory record

#### Scenario: Reject an orphaned marketplace record

- **WHEN** a record references a user, shop, category, product, or variant identifier that does not exist
- **THEN** PostgreSQL rejects the write through referential-integrity constraints

#### Scenario: Persist a category hierarchy

- **WHEN** a category references an existing parent category
- **THEN** the database preserves the parent-child hierarchy while still allowing root categories without a parent

### Requirement: Marketplace data integrity

The schema MUST enforce unique user emails, shop slugs and owners, category slugs, product slugs within a shop, variant SKUs, image ordering within a product, and the one-to-one variant inventory relationship. Monetary values MUST use integer minor units, and persisted prices and inventory quantities MUST remain non-negative with reserved inventory no greater than on-hand inventory.

#### Scenario: Reject a duplicate business key

- **WHEN** a write attempts to reuse an email, shop slug, category slug, shop-local product slug, variant SKU, product image position, or variant inventory record
- **THEN** PostgreSQL rejects the write with a uniqueness violation

#### Scenario: Reject invalid inventory

- **WHEN** a write supplies a negative on-hand or reserved quantity, or reserves more units than are on hand
- **THEN** PostgreSQL rejects the write with a check-constraint violation

#### Scenario: Reject invalid price

- **WHEN** a variant write supplies a negative price or negative comparison price in minor units
- **THEN** PostgreSQL rejects the write with a check-constraint violation

### Requirement: Record lifecycle conventions

Long-lived marketplace records SHALL use opaque UUID identifiers, UTC-aware creation and update timestamps, and nullable deletion timestamps where historical references must survive logical deletion. Unique business keys SHALL remain reserved after soft deletion unless a later capability explicitly defines reuse behavior.

#### Scenario: Create a long-lived record

- **WHEN** a user, shop, category, product, or variant is created
- **THEN** it receives a UUID plus UTC-aware creation and update timestamps and begins with no deletion timestamp

#### Scenario: Soft-delete a catalog record

- **WHEN** a long-lived marketplace record is retired without physical removal
- **THEN** its deletion timestamp can be recorded while its identifier and relationships remain intact

### Requirement: Deterministic development seed

The system SHALL provide an explicit seed command that creates a documented demo dataset using stable identifiers and business keys. Running the seed repeatedly against the same migrated database MUST converge on the same records and relationships without duplicates.

#### Scenario: Seed a freshly migrated database

- **WHEN** the seed command runs after migrations on an empty database
- **THEN** it creates repeatable demo users, shops, category hierarchy, products, variants, images, and inventory suitable for local feature development

#### Scenario: Rerun deterministic seed

- **WHEN** the seed command runs twice without an intervening database reset
- **THEN** the second run succeeds and verification observes the same stable identifiers, business keys, record counts, and relations

### Requirement: Isolated persistence verification

The repository SHALL provide a guarded verification command that rebuilds only an explicitly designated test database from committed migrations, runs the deterministic seed more than once, and validates representative relations and constraints. The command MUST refuse to perform destructive work when the test database target is missing, equals the development target, or does not match the documented test-database naming rule.

#### Scenario: Verify migrations and seed safely

- **WHEN** the verification command receives a distinct isolated PostgreSQL test database whose name ends with `_test`
- **THEN** it rebuilds the schema, applies migrations, runs the seed twice, and reports successful entity, relation, count, and constraint checks

#### Scenario: Reject an unsafe verification target

- **WHEN** the verification command receives no test URL, the same URL as the development database, or a database name without the `_test` suffix
- **THEN** it exits before dropping or modifying any schema and reports the failed safety condition without exposing credentials

### Requirement: Documented database workflows

Contributors SHALL have documented root commands for client generation, development migration creation, deployment migration application, deterministic seeding, isolated verification, and destructive local reset, including which connection variable each command requires.

#### Scenario: Follow a documented database workflow

- **WHEN** a contributor reads the repository setup documentation
- **THEN** they can identify the correct command and safety requirements for each schema, migration, seed, verification, and reset operation
