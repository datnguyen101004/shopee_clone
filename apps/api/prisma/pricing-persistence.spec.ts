import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('authoritative pricing weight migration', () => {
  const migration = readFileSync(
    path.join(
      process.cwd(),
      'prisma/migrations/20260814050000_authoritative_pricing_weight/migration.sql',
    ),
    'utf8',
  );

  it('backfills existing variants before enforcing a positive bounded weight', () => {
    expect(migration).toContain('SET "weight_grams" = 500');
    expect(migration).toContain('ALTER COLUMN "weight_grams" SET NOT NULL');
    expect(migration).toContain('product_variants_weight_grams_check');
    expect(migration).toContain('"weight_grams" BETWEEN 1 AND 1000000');
  });
});
