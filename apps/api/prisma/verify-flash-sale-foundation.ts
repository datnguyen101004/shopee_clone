import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from './create-prisma-client';

for (const path of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env'), resolve(__dirname, '../../.env')]) dotenv.config({ path });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const prisma = createPrismaClient(databaseUrl);

async function main(): Promise<void> {
  const rows = await prisma.flashSaleSku.findMany({ select: { allocatedQuantity: true, remainingQuantity: true, salePriceMinor: true, referencePriceMinor: true, campaignId: true } });
  for (const row of rows) {
    if (row.allocatedQuantity < 0 || row.remainingQuantity < 0 || row.remainingQuantity > row.allocatedQuantity) throw new Error(`Invalid Flash Sale quantity for campaign ${row.campaignId}`);
    if (row.salePriceMinor <= 0n || row.salePriceMinor >= row.referencePriceMinor) throw new Error(`Invalid Flash Sale price for campaign ${row.campaignId}`);
  }
  console.log(JSON.stringify({ flashSaleSkuCount: rows.length, featureFlag: process.env.FLASH_SALE_SKU_ENABLED ?? '(unset; test default enabled)', checked: true }));
}

main().finally(() => prisma.$disconnect());
