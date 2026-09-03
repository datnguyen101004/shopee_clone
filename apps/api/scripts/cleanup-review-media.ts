import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReviewMediaStorage } from '../src/reviews/review-media.storage';
import { ReviewsService } from '../src/reviews/reviews.service';

loadRepositoryEnvironment();

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const removed = await new ReviewsService(prisma).cleanupExpired(new ReviewMediaStorage());
    process.stdout.write(`${JSON.stringify({ removed })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
