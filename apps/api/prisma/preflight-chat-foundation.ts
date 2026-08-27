import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { createPrismaClient } from './create-prisma-client';

loadRepositoryEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

type Issue = Record<string, unknown>;

async function main(): Promise<void> {
  const prisma = createPrismaClient(databaseUrl);
  try {
    const [{ exists }] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.chat_conversations') IS NOT NULL AS "exists"
    `;
    if (!exists) {
      console.log(JSON.stringify({ legacyTablesPresent: false, valid: true }, null, 2));
      return;
    }

    const [missingOwners, selfPairs, duplicatePairs, invalidMemberships, duplicateClientIds, invalidSequences] =
      await Promise.all([
        prisma.$queryRaw<Issue[]>`
          SELECT c.id::text AS "conversationId", c.shop_id::text AS "shopId"
          FROM chat_conversations c
          LEFT JOIN shops s ON s.id = c.shop_id
          WHERE s.id IS NULL
          ORDER BY c.id
        `,
        prisma.$queryRaw<Issue[]>`
          SELECT c.id::text AS "conversationId", c.buyer_id::text AS "userId"
          FROM chat_conversations c
          JOIN shops s ON s.id = c.shop_id
          WHERE c.buyer_id = s.owner_id
          ORDER BY c.id
        `,
        prisma.$queryRaw<Issue[]>`
          SELECT c.buyer_id::text AS "buyerId", s.owner_id::text AS "ownerId", count(*)::int AS "conversationCount"
          FROM chat_conversations c
          JOIN shops s ON s.id = c.shop_id
          GROUP BY c.buyer_id, s.owner_id
          HAVING count(*) > 1
          ORDER BY c.buyer_id, s.owner_id
        `,
        prisma.$queryRaw<Issue[]>`
          SELECT m.conversation_id::text AS "conversationId", count(*)::int AS "membershipCount", count(DISTINCT m.user_id)::int AS "distinctUserCount"
          FROM chat_memberships m
          GROUP BY m.conversation_id
          HAVING count(*) <> 2 OR count(DISTINCT m.user_id) <> 2
          ORDER BY m.conversation_id
        `,
        prisma.$queryRaw<Issue[]>`
          SELECT m.conversation_id::text AS "conversationId", m.sender_user_id::text AS "senderUserId", m.client_message_id::text AS "clientMessageId", count(*)::int AS "duplicateCount"
          FROM chat_messages m
          GROUP BY m.conversation_id, m.sender_user_id, m.client_message_id
          HAVING count(*) > 1
          ORDER BY m.conversation_id, m.client_message_id
        `,
        prisma.$queryRaw<Issue[]>`
          SELECT c.id::text AS "conversationId", c.next_sequence AS "nextSequence", c.last_message_sequence AS "lastMessageSequence"
          FROM chat_conversations c
          LEFT JOIN chat_memberships m ON m.conversation_id = c.id
          WHERE c.next_sequence < 1
             OR c.last_message_sequence < 0
             OR c.last_message_sequence >= c.next_sequence
             OR m.last_read_sequence < 0
             OR m.last_read_sequence > c.last_message_sequence
          ORDER BY c.id
        `,
      ]);

    const report = {
      legacyTablesPresent: true,
      missingOwners,
      selfPairs,
      duplicatePairs,
      invalidMemberships,
      duplicateClientIds,
      invalidSequences,
      valid:
        missingOwners.length === 0 &&
        selfPairs.length === 0 &&
        duplicatePairs.length === 0 &&
        invalidMemberships.length === 0 &&
        duplicateClientIds.length === 0 &&
        invalidSequences.length === 0,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
