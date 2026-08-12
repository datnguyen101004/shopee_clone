## 1. Prisma Toolchain and Backend Integration

- [x] 1.1 Add the exact Prisma 7.9.1, PostgreSQL adapter/driver, TypeScript runner, environment loader, and type dependencies to `apps/api`, then regenerate the pnpm lockfile with pnpm 10.34.5.
- [x] 1.2 Add `prisma.config.ts`, API/root database scripts, generated-client ignore rules, and build/generation wiring while keeping ordinary root tests database-independent.
- [x] 1.3 Implement a global NestJS Prisma module and lifecycle-managed service that constructs the CommonJS generated client with `PrismaPg`, connects on initialization, and disconnects on shutdown.

## 2. Marketplace Schema

- [x] 2.1 Define UUID-based User and Shop models with statuses, one-shop-per-owner integrity, unique business keys, UTC-aware timestamps, soft-delete fields, snake_case mappings, and lookup indexes.
- [x] 2.2 Define hierarchical Category plus Product, ProductVariant, ProductImage, and Inventory models with required relations, statuses, bigint minor-unit prices, quantities, timestamps, and soft-delete fields where designed.
- [x] 2.3 Add all composite uniqueness rules, foreign-key deletion policies, physical mappings, and indexes required by the marketplace-persistence specification.
- [x] 2.4 Format and validate the Prisma schema, generate the CommonJS client into `src/generated/prisma`, and prove its types compile in the NestJS application without committing generated output.

## 3. Migration History and Database Constraints

- [x] 3.1 Create and commit the initial PostgreSQL migration for every model, enum, relation, index, and uniqueness rule using only safe placeholder connection configuration.
- [x] 3.2 Add stable named SQL check constraints for non-negative prices and quantities plus reserved inventory not exceeding on-hand inventory.
- [x] 3.3 Review the migration SQL against the Prisma schema and verify a second migration deployment against the current schema is a no-op.

## 4. Deterministic Seed Data

- [x] 4.1 Define documented fixed UUIDs and business keys for at least two users and shops, a multi-level category tree, multiple products, variants, images, and distinct inventory states.
- [x] 4.2 Implement dependency-ordered transactional upserts that update mutable demo fields and converge on the same complete relation graph without deleting unrelated development data.
- [x] 4.3 Configure explicit `prisma db seed` execution and verify two consecutive seed runs preserve stable identifiers, business keys, counts, and relationships.

## 5. Guarded Persistence Verification

- [x] 5.1 Implement and unit-test a URL safety guard that requires `TEST_DATABASE_URL`, rejects the development URL, requires an `_test` database suffix, and redacts credentials in errors before any destructive action.
- [x] 5.2 Implement the explicit `db:verify` workflow to recreate only the selected test database's `public` schema, deploy committed migrations, and run the deterministic seed twice.
- [x] 5.3 Add verification assertions for expected entity counts, stable keys, category/product/variant/inventory relationships, UUID and timestamp conventions, uniqueness violations, foreign-key violations, price checks, and inventory checks.
- [x] 5.4 Run migration-from-empty and seed verification against an isolated PostgreSQL test database, capture the redacted result, and confirm the unsafe-target cases perform no schema mutation.

## 6. Documentation and Repository Validation

- [x] 6.1 Document root client-generation, development migration, deployment migration, seed, guarded verification, and destructive reset commands with their required connection variables and safety warnings.
- [x] 6.2 Document the entity/lifecycle conventions, deterministic demo dataset, generated-source policy, and the boundary that defers Compose, environment templates, and CI to T04.
- [x] 6.3 Run frozen install, Prisma format/validate/generate, repository format check, lint, typecheck, database-independent unit tests, production build, and strict OpenSpec validation; fix every failure.
- [x] 6.4 Record verification evidence for issue #4, commit and push the completed change directly to `development`, close the issue as completed, and confirm no issue branch remains.
