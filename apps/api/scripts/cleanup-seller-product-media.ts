import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';
import { SellerProductMediaStorage } from '../src/seller-products/seller-product-media.storage';
import { SellerProductsService } from '../src/seller-products/seller-products.service';

loadRepositoryEnvironment();

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const removed = await new SellerProductsService(prisma).cleanupExpiredMedia(new SellerProductMediaStorage());
    process.stdout.write(`${JSON.stringify({ removed })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
