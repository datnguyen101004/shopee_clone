import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { isSingleShopSellerInvariantValid } from '../src/seller-identity/seller-identity-invariant';
import { createPrismaClient } from './create-prisma-client';

loadRepositoryEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

async function main(): Promise<void> {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const [duplicateOwners, sellersWithoutApprovedShop, approvedOwnersWithoutSeller] = await Promise.all([
      prisma.$queryRaw<Array<{ ownerId: string; shopIds: string[]; shopCount: number }>>`
        SELECT owner_id AS "ownerId", array_agg(id::text ORDER BY id)::text[] AS "shopIds", count(*)::int AS "shopCount"
        FROM shops
        GROUP BY owner_id
        HAVING count(*) > 1
        ORDER BY owner_id`,
      prisma.$queryRaw<Array<{ userId: string; shopCount: number }>>`
        SELECT ura.user_id AS "userId", count(s.id)::int AS "shopCount"
        FROM user_role_assignments ura
        LEFT JOIN shops s
          ON s.owner_id = ura.user_id
         AND s.deleted_at IS NULL
         AND s.onboarding_status = 'approved'
        WHERE ura.role = 'seller'
        GROUP BY ura.user_id
        HAVING count(s.id) <> 1
        ORDER BY ura.user_id`,
      prisma.$queryRaw<Array<{ ownerId: string; shopId: string }>>`
        SELECT s.owner_id AS "ownerId", s.id AS "shopId"
        FROM shops s
        LEFT JOIN user_role_assignments ura
          ON ura.user_id = s.owner_id
         AND ura.role = 'seller'
        WHERE s.deleted_at IS NULL
          AND s.onboarding_status = 'approved'
          AND ura.user_id IS NULL
        ORDER BY s.owner_id`,
    ]);

    const report = {
      duplicateOwners,
      sellersWithoutApprovedShop,
      approvedOwnersWithoutSeller,
      valid: isSingleShopSellerInvariantValid({
        duplicateOwners,
        sellersWithoutApprovedShop,
        approvedOwnersWithoutSeller,
      }),
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
