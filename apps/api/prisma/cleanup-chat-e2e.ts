import { createPrismaClient } from './create-prisma-client';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const buyerId = '00000000-0000-4000-8000-000000009001';
const sellerId = process.env.CHAT_E2E_SELLER_ID;
const temporarySellerId = '00000000-0000-4000-8000-000000009024';
const temporaryShopId = '00000000-0000-4000-8000-000000009025';
const fillerUserIds = Array.from(
  { length: 25 },
  (_, index) => `00000000-0000-4000-8000-${(0x9100 + index).toString(16).padStart(12, '0')}`,
);
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required.');
if (!sellerId || !/^[0-9a-f-]{36}$/i.test(sellerId))
  throw new Error('CHAT_E2E_SELLER_ID is required for scoped cleanup.');
const [low, high] = buyerId < sellerId ? [buyerId, sellerId] : [sellerId, buyerId];
const prisma = createPrismaClient(databaseUrl);
async function main(): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.chatOutbox.deleteMany({
        where: {
          conversation: {
            OR: [
              { participantLowUserId: low, participantHighUserId: high },
              { participantLowUserId: buyerId, participantHighUserId: temporarySellerId },
              { participantLowUserId: temporarySellerId, participantHighUserId: buyerId },
            ],
          },
        },
      });
      await tx.chatConversation.deleteMany({
        where: {
          OR: [
            { participantLowUserId: low, participantHighUserId: high },
            { participantLowUserId: buyerId, participantHighUserId: temporarySellerId },
            { participantLowUserId: temporarySellerId, participantHighUserId: buyerId },
            { participantLowUserId: buyerId, participantHighUserId: { in: fillerUserIds } },
            { participantLowUserId: { in: fillerUserIds }, participantHighUserId: buyerId },
          ],
        },
      });
      await tx.authSession.deleteMany({ where: { userId: buyerId } });
      await tx.shippingAddress.deleteMany({ where: { userId: buyerId } });
      await tx.userRoleAssignment.deleteMany({ where: { userId: buyerId } });
      await tx.user.deleteMany({ where: { id: buyerId } });
      await tx.user.deleteMany({ where: { id: { in: fillerUserIds } } });
      await tx.shop.deleteMany({ where: { id: temporaryShopId } });
      await tx.userRoleAssignment.deleteMany({ where: { userId: temporarySellerId } });
      await tx.user.deleteMany({ where: { id: temporarySellerId } });
    });
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
