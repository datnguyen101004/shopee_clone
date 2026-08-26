import type { PrismaClient } from '../src/generated/prisma/client';
import { ShopOnboardingStatus, ShopStatus, UserStatus } from '../src/generated/prisma/enums';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { createPrismaClient } from '../prisma/create-prisma-client';

const databaseTest = process.env.RUN_ROLE_DATABASE_TESTS === '1' ? describe : describe.skip;

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('single shop ownership migration invariants with PostgreSQL', () => {
  let prisma: PrismaClient;
  const suffix = Date.now().toString(36);
  const uuidTail = (offset: number) =>
    (BigInt(Date.now()) + BigInt(offset)).toString(16).padStart(12, '0').slice(-12);
  const userId = `00000000-0000-4000-8000-${uuidTail(1)}`;

  beforeAll(async () => {
    prisma = createPrismaClient(process.env.DATABASE_URL!);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { ownerId: { in: [userId, concurrentUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, concurrentUserId] } } });
    await prisma.$disconnect();
  });

  const concurrentUserId = `00000000-0000-4000-8000-${uuidTail(4)}`;

  it('installs one non-partial unique index for the lifetime ownership slot', async () => {
    const indexes = await prisma.$queryRaw<
      Array<{ indexName: string; isUnique: boolean; predicate: string | null; columns: string[] }>
    >`
      SELECT
        index_class.relname AS "indexName",
        index.indisunique AS "isUnique",
        pg_get_expr(index.indpred, index.indrelid) AS predicate,
        array_agg(attribute.attname ORDER BY key.ordinality)::text[] AS columns
      FROM pg_index index
      JOIN pg_class table_class ON table_class.oid = index.indrelid
      JOIN pg_class index_class ON index_class.oid = index.indexrelid
      JOIN LATERAL unnest(index.indkey) WITH ORDINALITY AS key(attribute_number, ordinality) ON true
      JOIN pg_attribute attribute
        ON attribute.attrelid = table_class.oid
       AND attribute.attnum = key.attribute_number
      WHERE table_class.relname = 'shops'
        AND index_class.relname = 'shops_owner_id_key'
      GROUP BY index_class.relname, index.indisunique, index.indpred, index.indrelid`;

    expect(indexes).toEqual([
      {
        indexName: 'shops_owner_id_key',
        isUnique: true,
        predicate: null,
        columns: ['owner_id'],
      },
    ]);
  });

  it('rejects a replacement shop even after the original row is soft-deleted', async () => {
    await prisma.user.create({
      data: {
        id: userId,
        email: `single-shop-${suffix}@example.test`,
        displayName: 'Single Shop',
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.shop.create({
      data: {
        id: `00000000-0000-4000-8000-${uuidTail(2)}`,
        ownerId: userId,
        slug: `single-shop-${suffix}`,
        name: 'Original shop',
        status: ShopStatus.INACTIVE,
        onboardingStatus: ShopOnboardingStatus.PENDING_APPROVAL,
        deletedAt: new Date(),
      },
    });
    await expect(
      prisma.shop.create({
        data: {
          id: `00000000-0000-4000-8000-${uuidTail(3)}`,
          ownerId: userId,
          slug: `single-shop-${suffix}-replacement`,
          name: 'Replacement shop',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows only one of concurrent conflicting owner inserts', async () => {
    await prisma.user.create({
      data: {
        id: concurrentUserId,
        email: `single-shop-concurrent-${suffix}@example.test`,
        displayName: 'Concurrent Shop',
        status: UserStatus.ACTIVE,
      },
    });
    const outcomes = await Promise.allSettled(
      [1, 2].map((index) =>
        prisma.shop.create({
          data: {
            id: `00000000-0000-4000-8000-${uuidTail(10 + index)}`,
            ownerId: concurrentUserId,
            slug: `single-shop-concurrent-${suffix}-${index}`,
            name: `Concurrent shop ${index}`,
          },
        }),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
  });
});
