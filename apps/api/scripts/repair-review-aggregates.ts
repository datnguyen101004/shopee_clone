import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReviewsService } from '../src/reviews/reviews.service';

loadRepositoryEnvironment();
async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try { await new ReviewsService(prisma).repairAggregates(); process.stdout.write('{"repaired":true}\n'); }
  finally { await prisma.$disconnect(); }
}
void main();
