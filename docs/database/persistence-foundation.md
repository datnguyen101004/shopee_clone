# Marketplace Persistence Foundation

Status: Implemented by T03 / issue #4.

## Ownership

The NestJS API is the sole PostgreSQL persistence boundary. Prisma schema, migration history, generated client configuration, seed data, and verification tools live under `apps/api`. Frontend and framework-neutral packages do not import Prisma types or access PostgreSQL.

## Entity model

| Entity | Purpose | Key integrity rules |
| --- | --- | --- |
| User | Marketplace identity placeholder | Unique normalized email; optional soft delete |
| Shop | Seller storefront | One shop per owner; globally unique slug |
| Category | Hierarchical catalog taxonomy | Unique slug; optional restrictive parent relation |
| Product | Shop catalog listing | Unique slug within a shop; required shop and category |
| ProductVariant | Sellable SKU and price | Globally unique SKU; non-negative bigint minor-unit prices |
| ProductImage | Ordered product media | Unique position within a product; cascades with hard product deletion |
| Inventory | Variant stock state | Exactly one row per variant; non-negative quantities; reserved does not exceed on hand |

Long-lived records use UUID primary keys, `TIMESTAMPTZ(3)` creation/update timestamps, and nullable `deleted_at` fields where historical references must survive retirement. Foreign keys restrict hard deletion of long-lived parents. Product images and inventory are aggregate-owned children and cascade only on an explicit hard deletion.

## Migration policy

The ordered directory `apps/api/prisma/migrations` is the schema source of truth. Prisma expresses tables, relations, uniqueness, and indexes. Named PostgreSQL check constraints are committed in migration SQL because they are not fully represented by Prisma schema syntax.

Development creates a migration with:

```bash
pnpm db:migrate -- --name <migration-name>
```

Staging, production, and migration verification apply history non-interactively with:

```bash
pnpm db:migrate:deploy
```

Never edit or remove a migration after another environment has applied it. Correct shared schemas with a new forward migration or restore from a database backup when rollback is required.

## Seed contract

`pnpm db:seed` explicitly invokes the Prisma 7 seed command. The seed uses stable UUID constants, emails, slugs, and SKUs and performs dependency-ordered transactional upserts. It updates its owned demo fields, does not generate random values, and does not delete unrelated local data.

## Verification contract

`pnpm db:verify` is an explicit destructive integration gate, separate from ordinary tests. It validates the test URL before opening a destructive connection, rebuilds only the selected `_test` database's `public` schema, deploys migrations twice, seeds twice, and checks:

- deterministic entity counts and identifiers;
- category hierarchy and shop-product-variant-image-inventory relations;
- UUID and UTC timestamp lifecycle conventions;
- unique and foreign-key rejection;
- non-negative price and inventory checks;
- reserved inventory not exceeding on-hand inventory.

Error output redacts PostgreSQL credentials. T04 provides the standard PostgreSQL Compose service, root `.env.example`, and CI invocation for this contract.

## Compose integration

The root `compose.yaml` owns a loopback-only PostgreSQL service, a persistent development volume, and first-initialization creation of the distinct `_test` database. Copy `.env.example` to the ignored `.env`, start the service with `pnpm infra:up`, and use `pnpm infra:down` for normal data-preserving shutdown.

`pnpm infra:reset` is deliberately separate and destructive: it deletes the Compose-owned local database volume. `pnpm infra:smoke` instead creates an isolated project with runtime-only credentials and ephemeral storage, exercises migrations, seed idempotency, database constraints, and live API connectivity, then removes its exact resources.

The safety boundary remains unchanged: application migrations and seed target `DATABASE_URL`; destructive persistence verification accepts only a distinct `TEST_DATABASE_URL` whose database name ends in `_test`.
