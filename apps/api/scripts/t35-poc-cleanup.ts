import { createPrismaClient } from '../prisma/create-prisma-client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const emailPrefix = process.env.T35_POC_EMAIL_PREFIX;
if (!emailPrefix) throw new Error('T35_POC_EMAIL_PREFIX is required');
const prisma = createPrismaClient(databaseUrl);

async function main(): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { startsWith: emailPrefix } }, select: { id: true } });
  const ids = users.map((user) => user.id);
  if (ids.length) {
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.cart.deleteMany({ where: { userId: { in: ids } } });
    await prisma.shippingAddress.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: ids } } });
    // Role audit events are append-only by design. Retain them and soft-delete
    // the generated users instead of bypassing the database invariant.
    await prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { status: 'SUSPENDED', deletedAt: new Date(), passwordHash: null },
    });
  }
  console.log(JSON.stringify({ emailPrefix, removedUsers: ids.length }));
}

void main().finally(async () => {
  await prisma.$disconnect();
});
