## Context

See `proposal.md` for motivation. The NestJS API is currently a CommonJS application with no persistence dependencies, schema, database lifecycle service, or environment validation. PostgreSQL and Prisma are already architecture decisions, while Docker Compose and CI are explicitly owned by T04. T03 therefore needs to make persistence code and migration history complete without introducing the local infrastructure orchestration that will consume it next.

Prisma ORM 7.9.1 supports the project's Node.js 22.12 baseline. Prisma 7 uses a generated client at an explicit output path and requires a PostgreSQL driver adapter for runtime connections. The generated client supports CommonJS output, allowing the existing NestJS module format to remain unchanged.

## Goals / Non-Goals

**Goals:**

- Establish one backend-owned schema and migration history that can build a database from empty state.
- Represent the minimum relational catalog needed by later identity, seller, catalog, search, cart, and order work.
- Make seed output stable, idempotent, and useful for development and tests.
- Enforce invariants at PostgreSQL boundaries when Prisma's schema language alone is insufficient.
- Provide a safe, explicit database verification path without making ordinary unit tests depend on a running database.

**Non-Goals:**

- Docker Compose, committed environment templates, CI jobs, production credentials, or managed database provisioning; T04 owns these.
- Authentication credentials, addresses, cart, order, voucher, payment, shipment, review, analytics, or search-index tables.
- Public CRUD APIs or frontend catalog screens.
- Automatic soft-delete middleware or implicit filtering; later business modules must make deletion visibility explicit.

## Decisions

### 1. Pin Prisma 7.9.1 with the PostgreSQL driver adapter

`apps/api` will pin `prisma`, `@prisma/client`, and `@prisma/adapter-pg` at 7.9.1, with `pg` 8.23.0, `tsx` 4.23.12, and `dotenv` 17.4.2. Prisma CLI and runtime versions remain aligned. Runtime construction uses `PrismaPg` with `DATABASE_URL` and one shared NestJS `PrismaService` that connects during module initialization and disconnects during shutdown.

The client generator will use `provider = "prisma-client"`, output to `src/generated/prisma`, and explicitly set `moduleFormat = "cjs"` to match NestJS. Generated code is ignored and recreated by install/build generation commands; migrations remain committed.

Alternatives considered:

- Prisma 6 would reduce adoption changes but starts new work on a superseded major version.
- Converting the whole API to ESM is unnecessary because the generated client and adapter expose CommonJS-compatible paths.
- Direct `pg` queries would lose generated types and conflict with the approved ORM decision.

### 2. Keep all persistence assets inside `apps/api`

The schema, migrations, seed, Prisma config, generated client, connection service, and database verification code belong to `apps/api`. Root scripts delegate to that package so contributors have discoverable commands without moving database ownership into a shared package.

Planned API scripts:

- `db:generate`: generate the client.
- `db:migrate`: create/apply a named development migration.
- `db:migrate:deploy`: apply committed migrations non-interactively.
- `db:seed`: run the explicit seed configured in `prisma.config.ts`.
- `db:reset`: destructive development reset, clearly documented.
- `db:verify`: guarded migration-from-empty and seed verification against `TEST_DATABASE_URL`.

`build`, `typecheck`, `test`, and `dev` depend on a generated client through explicit package scripts or Turbo task dependency, not through committed generated source.

Alternative considered: a new database workspace package would make the schema appear reusable, but the architecture intentionally makes the API the sole persistence boundary.

### 3. Use one relational catalog aggregate with stable physical naming

The first migration creates these models with UUID primary keys and snake_case PostgreSQL names:

- `User`: normalized demo email, display name, status, lifecycle timestamps, and optional `deleted_at`.
- `Shop`: unique owner, globally unique slug, name, status, lifecycle timestamps, and optional `deleted_at`.
- `Category`: globally unique slug, optional self-referencing parent, display order, active flag, lifecycle timestamps, and optional `deleted_at`.
- `Product`: shop and category references, shop-local unique slug, name, description, status, lifecycle timestamps, and optional `deleted_at`.
- `ProductVariant`: product reference, globally unique SKU, name, `price_minor`, optional `compare_at_price_minor`, status, lifecycle timestamps, and optional `deleted_at`.
- `ProductImage`: product reference, URL, optional alt text, display order, and timestamps; `(product_id, sort_order)` is unique.
- `Inventory`: variant identifier as a one-to-one key, on-hand and reserved quantities, and update timestamp.

Product price is variant-owned so products with multiple options do not duplicate an authoritative price. Money uses PostgreSQL `bigint` minor units; quantities use integer values. API serialization for `bigint` is deferred until a public catalog endpoint is introduced.

Foreign keys use restrictive deletion for long-lived parent records. Aggregate-only image and inventory children may use cascading hard deletion, while normal application behavior soft-deletes long-lived records. Unique values stay reserved after soft deletion to avoid identity and URL ambiguity.

Alternatives considered:

- A many-to-many product/category model is unnecessary for Shopee-style leaf-category assignment at this phase.
- Variant-specific images add a cross-product consistency invariant; product-level images cover the initial model without that ambiguity.
- Floating-point or decimal prices conflict with the accepted integer-minor-unit convention.

### 4. Add database-native checks in the migration SQL

Prisma expresses primary keys, foreign keys, uniqueness, and indexes. The committed SQL migration additionally names check constraints for:

- non-negative variant prices and comparison prices;
- non-negative on-hand and reserved inventory;
- reserved inventory not exceeding on-hand inventory.

These constraints remain migration-owned and are verified through intentionally invalid writes. Schema formatting or future migration generation must not remove hand-authored constraints from existing migrations.

Alternative considered: application-only validation is easier to write but allows scripts, future workers, and concurrent paths to corrupt shared invariants.

### 5. Make seeding idempotent through stable keys and transactions

The seed uses fixed UUID constants plus lower-case emails, slugs, and SKUs. It upserts records in dependency order within a transaction and explicitly sets mutable demo fields so reruns converge rather than merely skipping existing rows. The dataset will contain at least two users and shops, a multi-level category tree, multiple products, variants, images, and distinct inventory states.

The seed is invoked only through `prisma db seed`; Prisma 7 does not implicitly seed during migration commands. No random values, current timestamps used as business identifiers, network downloads, or locale-dependent generators are permitted.

Alternative considered: delete-and-reinsert is simple but breaks references and is unsafe once developers add local records.

### 6. Separate ordinary tests from destructive database verification

Normal root `test` remains database-independent. `db:verify` is an explicit integration gate that:

1. Parses `TEST_DATABASE_URL`, redacts it in errors, requires a database name ending `_test`, and rejects equality with `DATABASE_URL`.
2. Connects only to that database, drops and recreates its `public` schema, and never drops the database itself.
3. Maps the isolated URL to `DATABASE_URL` for child Prisma CLI processes.
4. Runs `prisma migrate deploy`, `prisma db seed` twice, then verifies stable keys, expected counts, representative relations, and check/unique constraint failures.
5. Disconnects cleanly and returns a non-zero status on any failure.

This meets the migration-from-empty requirement before T04 supplies a standard local PostgreSQL container and CI job.

Alternatives considered:

- Running destructive migration verification in every Jest run would make the existing root quality gate unusable without infrastructure.
- Testcontainers would quietly introduce Docker orchestration in the issue immediately before the issue dedicated to Docker.
- SQLite cannot validate PostgreSQL migration SQL, native types, or constraints.

### 7. Document operations with explicit safety boundaries

The README will describe required connection variables and distinguish non-destructive generation/deployment from destructive reset/verification. Documentation may show safe placeholder URLs but will not add a committed environment template, credentials, or Compose service before T04.

## Risks / Trade-offs

- [Prisma 7 generated TypeScript increases build inputs] → Ignore generated output in Git, regenerate deterministically, and validate clean-install build behavior.
- [CommonJS interoperability could regress in dependency updates] → Pin exact versions and add runtime connection/seed verification before upgrades.
- [Hand-authored SQL checks are not fully represented in Prisma schema] → Name and test each constraint and preserve committed migrations as the source of truth.
- [Soft-deleted keys cannot be reused] → Document reservation as intentional; add partial unique indexes only through a future requirement that defines reuse semantics.
- [Explicit `db:verify` can destroy test data] → Enforce URL inequality and `_test` suffix before any schema operation, redact credentials, and limit destruction to the selected database's `public` schema.
- [No standard local PostgreSQL service in T03] → Keep setup contract explicit and let T04 provide Compose plus CI without changing the schema design.

## Migration Plan

1. Add pinned dependencies, scripts, Prisma configuration, generator settings, and generated-output ignore rules.
2. Add the schema and generate the first client to validate types.
3. Generate and review the initial migration, then add named PostgreSQL check constraints.
4. Apply the committed migration to an empty isolated test database.
5. Add the Prisma lifecycle module, deterministic seed, and guarded verification command.
6. Run the seed twice and all persistence verification checks, followed by existing format, lint, typecheck, test, and build gates.
7. Document commands and record verification evidence for issue #4.

No production database exists yet. Before merge or direct publication, rollback is removing the new migration and persistence code. After any shared database applies the migration, rollback uses a new forward migration or restores a database backup; committed migration history must not be rewritten.
