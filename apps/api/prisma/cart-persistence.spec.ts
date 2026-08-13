import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('persistent cart migration', () => {
  const migration = readFileSync(
    path.join(
      process.cwd(),
      'prisma/migrations/20260814040000_persistent_multi_shop_cart/migration.sql',
    ),
    'utf8',
  );

  it('keeps the already-applied ownership migration internally consistent', () => {
    expect(migration).toContain('carts_owner_xor_check');
    expect(migration).toContain('"user_id" IS NOT NULL AND "guest_credential_digest" IS NULL');
    expect(migration).toContain('"user_id" IS NULL AND "guest_credential_digest" IS NOT NULL');
    expect(migration).toContain('carts_merge_lifecycle_check');
  });

  it('enforces one cart per authenticated user and one line per variant', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "carts_user_id_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "cart_lines_cart_id_variant_id_key"');
  });

  it('bounds quantities and purchase limits and preserves catalog references', () => {
    expect(migration).toContain('"quantity" BETWEEN 1 AND 99');
    expect(migration).toContain('"max_purchase_quantity" BETWEEN 1 AND 99');
    expect(migration).toContain('REFERENCES "carts"("id") ON DELETE CASCADE');
    expect(migration).toContain('REFERENCES "product_variants"("id") ON DELETE RESTRICT');
  });
});
