import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';

loadRepositoryEnvironment();

/** Remove only expired, non-audit chat pressure/attention rows in bounded batches. */
export async function cleanupChatSafetyRows(
  prisma: PrismaService,
  options?: { retentionHours?: number; batchSize?: number; now?: Date },
): Promise<{ rateLimitDeleted: number; attentionDeleted: number }> {
  const retentionHours = options?.retentionHours ?? 48;
  const batchSize = Math.max(50, Math.min(options?.batchSize ?? 500, 5_000));
  const now = options?.now ?? new Date();
  const cutoff = new Date(now.getTime() - retentionHours * 60 * 60 * 1_000);
  let rateLimitDeleted = 0;
  let attentionDeleted = 0;

  while (true) {
    const rows = await prisma.chatRateLimitEvent.findMany({
      where: { attemptedAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { attemptedAt: 'asc' },
      take: batchSize,
    });
    if (!rows.length) break;
    const result = await prisma.chatRateLimitEvent.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    rateLimitDeleted += result.count;
    if (rows.length < batchSize) break;
  }

  while (true) {
    const rows = await prisma.chatAttentionLease.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: batchSize,
    });
    if (!rows.length) break;
    const result = await prisma.chatAttentionLease.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    attentionDeleted += result.count;
    if (rows.length < batchSize) break;
  }

  return { rateLimitDeleted, attentionDeleted };
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    process.stdout.write(`${JSON.stringify(await cleanupChatSafetyRows(prisma))}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
