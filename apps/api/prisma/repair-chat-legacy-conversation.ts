import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { createPrismaClient } from './create-prisma-client';

loadRepositoryEnvironment();

export const TARGET_CONVERSATION_ID = '2f6dd7f3-7982-47af-b230-442b54ba5e57';

type PrismaTransaction = Parameters<
  Parameters<ReturnType<typeof createPrismaClient>['$transaction']>[0]
>[0];

type RepairTable = {
  name: string;
  keyColumn: 'id' | 'conversation_id';
};

export const REPAIR_TABLES: readonly RepairTable[] = [
  { name: 'chat_user_outbox', keyColumn: 'conversation_id' },
  { name: 'chat_user_messages', keyColumn: 'conversation_id' },
  { name: 'chat_user_memberships', keyColumn: 'conversation_id' },
  { name: 'chat_user_conversations', keyColumn: 'id' },
  { name: 'chat_outbox', keyColumn: 'conversation_id' },
  { name: 'chat_report_references', keyColumn: 'conversation_id' },
  { name: 'chat_blocks', keyColumn: 'conversation_id' },
  { name: 'chat_attachments', keyColumn: 'conversation_id' },
  { name: 'chat_messages', keyColumn: 'conversation_id' },
  { name: 'chat_memberships', keyColumn: 'conversation_id' },
  { name: 'chat_conversations', keyColumn: 'id' },
];

export type RepairReport = {
  targetConversationId: string;
  before: Record<string, number>;
  after: Record<string, number>;
};

function confirmationFromArgv(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--confirm');
  return index >= 0 ? argv[index + 1] : undefined;
}

export function assertExactConfirmation(value: string | undefined): void {
  if (value !== TARGET_CONVERSATION_ID) {
    throw new Error(
      `Refusing chat repair: --confirm must exactly match ${TARGET_CONVERSATION_ID}.`,
    );
  }
}

async function tableExists(tx: PrismaTransaction, table: RepairTable): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass(${`public.${table.name}`}) IS NOT NULL AS "exists"
  `;
  return rows[0]?.exists === true;
}

async function countRows(
  tx: PrismaTransaction,
  table: RepairTable,
  exists: boolean,
): Promise<number> {
  if (!exists) return 0;
  const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT count(*)::bigint AS count FROM "${table.name}" WHERE "${table.keyColumn}" = $1::uuid`,
    TARGET_CONVERSATION_ID,
  );
  return Number(rows[0]?.count ?? 0n);
}

async function deleteRows(
  tx: PrismaTransaction,
  table: RepairTable,
  exists: boolean,
): Promise<void> {
  if (!exists) return;
  await tx.$executeRawUnsafe(
    `DELETE FROM "${table.name}" WHERE "${table.keyColumn}" = $1::uuid`,
    TARGET_CONVERSATION_ID,
  );
}

export async function runChatRepair(
  prisma: ReturnType<typeof createPrismaClient>,
): Promise<RepairReport> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('t31-change-02 exact chat repair', 0))`;

    const availability = new Map<string, boolean>();
    for (const table of REPAIR_TABLES) {
      availability.set(table.name, await tableExists(tx, table));
    }

    const before: Record<string, number> = {};
    for (const table of REPAIR_TABLES) {
      before[table.name] = await countRows(tx, table, availability.get(table.name) === true);
    }

    for (const table of REPAIR_TABLES) {
      await deleteRows(tx, table, availability.get(table.name) === true);
    }

    const after: Record<string, number> = {};
    for (const table of REPAIR_TABLES) {
      after[table.name] = await countRows(tx, table, availability.get(table.name) === true);
      if (after[table.name] !== 0) {
        throw new Error(`Chat repair verification failed for ${table.name}.`);
      }
    }

    return { targetConversationId: TARGET_CONVERSATION_ID, before, after };
  });
}

async function main(): Promise<void> {
  assertExactConfirmation(confirmationFromArgv(process.argv.slice(2)));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const prisma = createPrismaClient(databaseUrl);
  try {
    const report = await runChatRepair(prisma);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('repair-chat-legacy-conversation.ts')) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
