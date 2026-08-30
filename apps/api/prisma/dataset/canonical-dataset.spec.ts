import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { canonicalDatasetManifest, CANONICAL_DATASET_RECORD_COUNT } from './manifest';
import { loadCanonicalDataset } from './loader';
import {
  categoryMedianPrice,
  createCanonicalDatasetPlan,
  parseOriginalPrice,
  parseRatingCount,
  parseSoldCount,
} from './normalizer';
import type { LoadedDatasetSource, RawDatasetRecord } from './types';

describe('canonical product dataset', () => {
  it('loads all six fixtures with declared counts, checksums, and root metadata', async () => {
    const loaded = await loadCanonicalDataset();

    expect(loaded.map(({ manifest, records }) => [manifest.fileName, records.length])).toEqual(
      canonicalDatasetManifest.map(({ fileName, expectedCount }) => [fileName, expectedCount]),
    );
    expect(loaded.reduce((total, source) => total + source.records.length, 0)).toBe(
      CANONICAL_DATASET_RECORD_COUNT,
    );
    expect(loaded.every(({ checksum }) => /^[0-9a-f]{64}$/.test(checksum))).toBe(true);
    expect(loaded.every(({ rootMetadata }) => !('records' in rootMetadata))).toBe(true);
    expect(canonicalDatasetManifest.find(({ key }) => key === 'dienthoai')?.category).toMatchObject(
      {
        slug: 'thiet-bi-dien-tu',
        name: 'Thiết bị điện tử',
      },
    );
    expect(
      canonicalDatasetManifest.every(
        ({ shop }) =>
          /^\d{2}$/.test(shop.pickupProvince) &&
          shop.pickupDistrict.startsWith(`${shop.pickupProvince}-`),
      ),
    ).toBe(true);
  });

  it('normalizes every source deterministically with expected missing-field counts', async () => {
    const loaded = await loadCanonicalDataset();
    const first = createCanonicalDatasetPlan(loaded);
    const second = createCanonicalDatasetPlan(loaded);
    const snapshot = (plan: typeof first) =>
      plan.sources.flatMap((source) =>
        source.products.map((product) => ({
          id: product.id,
          slug: product.slug,
          sku: product.variant.sku,
          price: product.variant.priceMinor.toString(),
          weightGrams: product.variant.weightGrams,
          rating: product.ratingAverageBasisPoints,
          fields: product.generatedFields,
          createdAt: product.createdAt.toISOString(),
        })),
      );

    expect(first.totalRecords).toBe(1_377);
    expect(first.generatedPriceCount).toBe(3);
    expect(first.generatedRatingCount).toBe(952);
    expect(snapshot(second)).toEqual(snapshot(first));

    const products = first.sources.flatMap((source) => source.products);
    expect(products.every(({ variant }) => variant.priceMinor > 0n)).toBe(true);
    expect(
      products.every(({ variant }) => variant.weightGrams >= 250 && variant.weightGrams <= 5_000),
    ).toBe(true);
    expect(new Set(products.map(({ variant }) => variant.weightGrams)).size).toBeGreaterThan(10);
    expect(
      products.every(
        ({ ratingAverageBasisPoints }) =>
          ratingAverageBasisPoints >= 100 && ratingAverageBasisPoints <= 500,
      ),
    ).toBe(true);
    expect(new Set(products.map(({ id }) => id)).size).toBe(products.length);
    expect(new Set(products.map(({ variant }) => variant.sku)).size).toBe(products.length);
  });

  it('uses the correct source identity shape for each adapter and avoids duplicate-name collisions', async () => {
    const plan = createCanonicalDatasetPlan(await loadCanonicalDataset());
    const byKey = Object.fromEntries(plan.sources.map((source) => [source.key, source]));

    expect(byKey.bachhoa?.products[0]?.sourceIdentity).toMatch(/^product_url:/);
    expect(byKey.noithat?.products[0]?.sourceIdentity).toMatch(/^product_id:/);
    expect(byKey.dienthoai?.products[0]?.sourceIdentity).toMatch(/^product_url:/);
    expect(byKey.mypham?.products[0]?.sourceIdentity).toMatch(/^product_url:/);
    expect(byKey.thethao?.products[0]?.sourceIdentity).toMatch(/^product_url:/);
    expect(byKey.thoitrang?.products[0]?.sourceIdentity).toMatch(/^product_url:/);

    for (const source of plan.sources) {
      expect(new Set(source.products.map(({ slug }) => slug)).size).toBe(source.products.length);
    }
  });

  it('parses supported commerce metadata conservatively', () => {
    const notes =
      'Thương hiệu: Demo; Giá gốc: 1.250.000₫; Giảm 20%; 1.234 lượt đánh giá; Đã bán 2.345';
    expect(parseOriginalPrice(notes)).toBe(1_250_000);
    expect(parseRatingCount(notes)).toBe(1_234);
    expect(parseSoldCount(notes)).toBe(2_345);
    expect(parseOriginalPrice('Giá hiển thị: Liên hệ')).toBeNull();
  });

  it('calculates deterministic category medians for odd and even populations', () => {
    expect(categoryMedianPrice([{ price: 300 }, { price: 100 }, { price: 200 }])).toBe(200);
    expect(
      categoryMedianPrice([{ price: 400 }, { price: 100 }, { price: 200 }, { price: 300 }]),
    ).toBe(250);
  });

  it('generates supported blank presentation fields and records provenance', () => {
    const source = fixtureSource([
      {
        product_url: 'https://example.test/products/known',
        name: 'Known',
        price: 100,
        rating: 5,
        notes: '1 đánh giá; Đã bán 2',
        image_url: 'https://example.test/known.jpg',
      },
      { product_id: 'blank-fields', price: null, rating: null },
    ]);
    const plan = createCanonicalDatasetPlan([source]);
    const generated = plan.sources[0]?.products[1];

    expect(generated).toBeDefined();
    if (!generated) throw new Error('Expected generated fixture product.');
    expect(generated.name).toContain(source.manifest.category.name);
    expect(generated.description).toContain(generated.name);
    expect(generated.image.url).toBe('/media/products/product-placeholder.svg');
    expect(generated.variant.priceMinor).toBe(100n);
    expect(generated.variant.weightGrams).toBeGreaterThanOrEqual(250);
    expect(generated.generatedFields.map(({ field }) => field)).toEqual(
      expect.arrayContaining([
        'name',
        'description',
        'priceMinor',
        'rating',
        'ratingCount',
        'soldCount',
        'image',
        'inventory',
        'weightGrams',
      ]),
    );
  });

  it('rejects missing files, malformed JSON, count drift, invalid record types, and duplicate keys', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'shopee-dataset-'));
    const manifest = [
      { ...canonicalDatasetManifest[0], fileName: 'fixture.json', expectedCount: 1 },
    ];
    try {
      await expect(loadCanonicalDataset({ directory, manifest })).rejects.toThrow(
        'Required dataset file fixture.json could not be read',
      );
      await writeFile(path.join(directory, 'fixture.json'), '{invalid', 'utf8');
      await expect(loadCanonicalDataset({ directory, manifest })).rejects.toThrow(
        'fixture.json is not valid JSON',
      );
      await writeFile(
        path.join(directory, 'fixture.json'),
        JSON.stringify({ source: 'https://example.test', record_count: 2, records: [{}] }),
        'utf8',
      );
      await expect(loadCanonicalDataset({ directory, manifest })).rejects.toThrow(
        'declares 2 records but contains 1',
      );
      await writeFile(
        path.join(directory, 'fixture.json'),
        JSON.stringify({
          source: 'https://example.test',
          record_count: 1,
          records: [{ price: 'free' }],
        }),
        'utf8',
      );
      await expect(loadCanonicalDataset({ directory, manifest })).rejects.toThrow(
        'price must be a finite number or null',
      );

      const duplicate = fixtureSource([
        validRecord('https://example.test/products/same'),
        validRecord('https://example.test/products/same'),
      ]);
      expect(() => createCanonicalDatasetPlan([duplicate])).toThrow('Duplicate stable key');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a dataset shop without a canonical pickup district', () => {
    const source = fixtureSource([validRecord('https://example.test/products/pickup')]);
    source.manifest.shop.pickupDistrict = '';

    expect(() => createCanonicalDatasetPlan([source])).toThrow(
      'Invalid dataset shop pickup location for bachhoa',
    );
  });
});

function validRecord(productUrl: string): RawDatasetRecord {
  return {
    product_url: productUrl,
    name: 'Valid product',
    price: 100,
    rating: 4.5,
    notes: 'Còn hàng',
    image_url: 'https://example.test/product.jpg',
  };
}

function fixtureSource(records: RawDatasetRecord[]): LoadedDatasetSource {
  return {
    manifest: { ...canonicalDatasetManifest[0], expectedCount: records.length },
    checksum: 'a'.repeat(64),
    sourceUrl: 'https://example.test',
    rootMetadata: { source: 'https://example.test', record_count: records.length },
    records,
  };
}
