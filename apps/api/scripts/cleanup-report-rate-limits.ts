import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';

loadRepositoryEnvironment();

export async function cleanupExpiredReportRateLimits(
  prisma: PrismaService,
  options?: { retentionHours?: number; batchSize?: number; now?: Date },
): Promise<{ deletedCount: number }> {
  const retentionHours = options?.retentionHours ?? 48;
  const now = options?.now ?? new Date();
  const cutoff = new Date(now.getTime() - retentionHours * 60 * 60 * 1000);

  const result = await prisma.reportRateLimitEvent.deleteMany({
    where: {
      attemptedAt: {
        lt: cutoff,
      },
    },
  });

  return { deletedCount: result.count };
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const { deletedCount } = await cleanupExpiredReportRateLimits(prisma);
    process.stdout.write(`${JSON.stringify({ deletedCount })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
