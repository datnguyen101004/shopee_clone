import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('verified product review schema migration', () => {
  it('keeps one review per line and review-derived aggregate constraints', async () => {
    const root = join(__dirname, 'migrations', '20260815120000_verified_product_reviews', 'migration.sql');
    const migration = await readFile(root, 'utf8');
    expect(migration).toContain('CREATE TABLE "product_reviews"');
    expect(migration).toContain('"order_line_id" UUID NOT NULL');
    expect(migration).toContain('product_reviews_order_line_id_key');
    expect(migration).toContain('"rating" BETWEEN 1 AND 5');
    expect(migration).toContain('UPDATE "products" SET "rating_average_basis_points" = 0, "rating_count" = 0');
    expect(migration).toContain('CREATE TABLE "review_media"');
  });
});
