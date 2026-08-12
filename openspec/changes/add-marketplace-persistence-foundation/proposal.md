## Why

The backend currently has no durable marketplace data model, so catalog and seller features cannot be implemented safely. T03 establishes a reproducible PostgreSQL and Prisma foundation now, before business APIs begin depending on persistence behavior.

## What Changes

- Configure Prisma ORM and PostgreSQL access inside `apps/api`, including generated client lifecycle and root database commands.
- Add the initial relational model for users, shops, hierarchical categories, products, product variants, product images, and variant inventory.
- Enforce identifiers, timestamps, money representation, soft-delete fields, foreign keys, uniqueness, indexes, and inventory check constraints.
- Commit an initial SQL migration that can create a fresh schema exclusively from migration history.
- Add an idempotent deterministic development seed with stable identifiers and repeatable demo marketplace records.
- Add migration-from-empty and seed verification coverage against an explicitly configured isolated PostgreSQL test database.
- Document schema generation, migration, seeding, verification, and destructive reset commands.
- Keep Docker Compose, environment templates, CI automation, and production deployment out of this change; those remain T04 scope.

## Capabilities

### New Capabilities

- `marketplace-persistence`: Defines reproducible PostgreSQL schema creation, marketplace entity integrity, deterministic seed behavior, and database verification workflows.

### Modified Capabilities

None.

## Impact

- Affects `apps/api` dependencies, scripts, generated-source handling, application modules, and test configuration.
- Adds Prisma schema/configuration, committed SQL migrations, seed code, and persistence verification tests under backend ownership.
- Adds root database convenience commands and contributor database documentation.
- Introduces pinned Prisma ORM 7, Prisma Client, PostgreSQL driver adapter, `pg`, `tsx`, and environment-loading dependencies compatible with Node.js 22.12.
- Requires a caller-provided PostgreSQL connection for development and an isolated test connection for destructive migration verification; local PostgreSQL container orchestration is deferred to T04.
