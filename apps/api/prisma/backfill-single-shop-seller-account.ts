import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { MarketplaceRole, RoleAuditAction, RoleAuditSource } from '../src/generated/prisma/enums';
import { createPrismaClient } from './create-prisma-client';

loadRepositoryEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

async function main(): Promise<void> {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const owners = await tx.shop.findMany({
        where: { deletedAt: null, onboardingStatus: 'APPROVED' },
        select: { id: true, ownerId: true },
        orderBy: { id: 'asc' },
      });
      let backfilled = 0;
      for (const shop of owners) {
        const existing = await tx.userRoleAssignment.findUnique({
          where: { userId_role: { userId: shop.ownerId, role: MarketplaceRole.SELLER } },
          select: { userId: true },
        });
        if (existing) continue;
        await tx.userRoleAssignment.create({
          data: {
            userId: shop.ownerId,
            role: MarketplaceRole.SELLER,
            source: RoleAuditSource.MIGRATION,
          },
        });
        await tx.roleAuditEvent.create({
          data: {
            targetUserId: shop.ownerId,
            role: MarketplaceRole.SELLER,
            action: RoleAuditAction.GRANT,
            source: RoleAuditSource.MIGRATION,
            reason: 'Backfill seller role for approved single-owner shop',
          },
        });
        backfilled += 1;
      }
      return { inspected: owners.length, backfilled };
    });
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
