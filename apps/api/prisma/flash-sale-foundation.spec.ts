import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

const root = resolve(__dirname, '..', '..', '..');

describe('Flash Sale SKU foundation', () => {
  it('keeps durable quantity, price and claim constraints in migrations', async () => {
    const skuMigration = await readFile(resolve(root, 'apps/api/prisma/migrations/20260907100000_flash_sale_sku_foundation/migration.sql'), 'utf8');
    const claimMigration = await readFile(resolve(root, 'apps/api/prisma/migrations/20260907130000_flash_sale_claim_sku_link/migration.sql'), 'utf8');
    expect(skuMigration).toContain('flash_sale_skus_campaign_variant_key');
    expect(skuMigration).toContain('flash_sale_skus_quantity_check');
    expect(skuMigration).toContain('flash_sale_skus_price_check');
    expect(skuMigration).toContain('flash_sale_buyer_claims_campaign_buyer_product_key');
    expect(claimMigration).toContain('flash_sale_sku_id');
  });

  it('has an explicit active SKU seed and a disabled-by-default local rollout flag', async () => {
    const seed = await readFile(resolve(root, 'apps/api/prisma/seed.ts'), 'utf8');
    const env = await readFile(resolve(root, '.env.example'), 'utf8');
    const pricing = await readFile(resolve(root, 'apps/api/src/pricing/scheduled-discount.service.ts'), 'utf8');
    expect(seed).toContain('transaction.flashSaleSku.upsert');
    expect(env).toContain('FLASH_SALE_SKU_ENABLED=false');
    expect(pricing).toContain("process.env.FLASH_SALE_SKU_ENABLED === 'false'");
  });
});
