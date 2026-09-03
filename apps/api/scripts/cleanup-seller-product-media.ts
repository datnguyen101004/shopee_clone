import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';
import { SellerProductMediaStorage } from '../src/seller-products/seller-product-media.storage';
import { SellerProductsService } from '../src/seller-products/seller-products.service';

loadRepositoryEnvironment();

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const service = new SellerProductsService(prisma);
    const storage = new SellerProductMediaStorage();
    const removedStaged = await service.cleanupExpiredMedia(storage);
    const removedPending = await service.cleanupExpiredPendingMedia(storage);
    process.stdout.write(`${JSON.stringify({ removed: removedStaged + removedPending, removedStaged, removedPending })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
