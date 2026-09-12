import { gunzipSync } from 'node:zlib';

import { ProductSnapshotExporter } from './product-exporter';
import type { TrainingSnapshotConfig } from './config';
import { MemorySnapshotObjectStore } from './snapshot-writer';

const config: TrainingSnapshotConfig = {
  environment: 'development',
  region: 'ap-southeast-1',
  processedBucket: 'processed',
  prefix: 'snapshots',
  productPageSize: 1,
  profilePageSize: 1,
  maxRowsPerPart: 10,
  maxPartBytes: 1024,
  productProjectionVersion: 2,
  featureSchemaVersion: 1,
  pseudonymKeyId: 'key-2026',
  pseudonymSecret: 'secret-2026',
};

function document(productId: string) {
  return {
    projection_version: 2,
    buyer_profile_feature_schema_version: 1,
    product_id: productId,
    name: 'Phone',
    description: 'A phone',
    name_normalized: 'phone',
    category_id: 'category-1',
    category_name: 'Phones',
    category_name_normalized: 'phones',
    shop_id: 'shop-1',
    shop_name: 'Shop',
    shop_name_normalized: 'shop',
    attributes: ['color:blue'],
    effective_price_minor: 1200,
    compare_at_price_minor: null,
    discount_basis_points: 0,
    promotion_active: false,
    rating_average_basis_points: 400,
    rating_count: 50,
    sold_count: 10,
    inventory_available: 3,
    product_created_at: '2026-08-01T00:00:00.000Z',
    product_updated_at: '2026-09-01T00:00:00.000Z',
  };
}

describe('product snapshot exporter', () => {
  it('paginates and maps canonical search projection fields read-only', async () => {
    const repository = {
      findSellableProductsPage: jest.fn()
        .mockResolvedValueOnce([{ id: 'p1' }])
        .mockResolvedValueOnce([{ id: 'p2' }])
        .mockResolvedValueOnce([]),
    };
    const builder = {
      buildMany: jest.fn().mockImplementation(async (products: readonly { id: string }[]) =>
        products.map((product) => ({ kind: 'index', document: document(product.id) }))),
    };
    const store = new MemorySnapshotObjectStore();
    const exporter = new ProductSnapshotExporter(repository as never, builder as never, config);
    const manifest = await exporter.export({
      runId: 'run-products',
      sourceDate: '2026-09-10',
      cutoff: new Date('2026-09-10T00:00:00.000Z'),
      store,
    });
    expect(repository.findSellableProductsPage.mock.calls.map((call) => call[0])).toEqual([null, 'p1', 'p2']);
    expect(manifest.rowCount).toBe(2);
    const part = store.objects.get(manifest.parts[0]!.key)!;
    const rows = gunzipSync(part.body).toString('utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(rows[0]).toMatchObject({
      productId: 'p1',
      categoryId: 'category-1',
      shopId: 'shop-1',
      effectivePriceMinor: 1200,
      searchableText: expect.stringContaining('phone'),
    });
  });
});
