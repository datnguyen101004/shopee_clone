import { gunzipSync } from 'node:zlib';

import { BuyerProfileSnapshotExporter } from './buyer-exporter';
import { MemorySnapshotObjectStore } from './snapshot-writer';
import type { TrainingSnapshotConfig } from './config';

const config: TrainingSnapshotConfig = {
  environment: 'development',
  region: 'ap-southeast-1',
  processedBucket: 'processed',
  prefix: 'snapshots',
  productPageSize: 10,
  profilePageSize: 10,
  maxRowsPerPart: 10,
  maxPartBytes: 1024,
  productProjectionVersion: 2,
  featureSchemaVersion: 1,
  pseudonymKeyId: 'key-2026',
  pseudonymSecret: 'secret-2026',
};

describe('buyer profile snapshot exporter', () => {
  it('exports materialized changed profiles without invoking the persisting service path', async () => {
    const repository = {
      listProfilesChangedPage: jest.fn().mockResolvedValueOnce([
        {
          userId: 'buyer-raw-id',
          profileVersion: 1,
          featureSchemaVersion: 1,
          generatedAt: new Date('2026-09-09T00:00:00.000Z'),
          eligibilityScore: 8,
          eligible: true,
          viewCount30d: 1,
          favoriteCount90d: 1,
          followedShopCount: 1,
          orderCount90d: 1,
          categoryAffinities: [{ id: 'category-1', weight: 5 }],
          shopAffinities: [{ id: 'shop-1', weight: 5 }],
          preferredPriceMinMinor: BigInt(1000),
          preferredPriceMaxMinor: BigInt(1000),
          preferredPriceMeanMinor: BigInt(1000),
          recentProductIds: ['product-1'],
        },
      ]).mockResolvedValueOnce([]),
      loadActivities: jest.fn().mockResolvedValue([
        {
          type: 'favorite',
          productId: 'product-1',
          categoryId: 'category-1',
          shopId: 'shop-1',
          priceMinor: 1000,
          occurredAt: new Date('2026-09-09T00:00:00.000Z'),
        },
        { type: 'follow', shopId: 'shop-1', occurredAt: new Date('2026-09-09T01:00:00.000Z') },
      ]),
    };
    const store = new MemorySnapshotObjectStore();
    const exporter = new BuyerProfileSnapshotExporter(repository as never, config);
    const manifest = await exporter.export({
      runId: 'run-1',
      sourceDate: '2026-09-10',
      since: new Date('2026-09-09T00:00:00.000Z'),
      cutoff: new Date('2026-09-10T00:00:00.000Z'),
      store,
    });
    expect(repository.listProfilesChangedPage).toHaveBeenCalledWith(
      new Date('2026-09-09T00:00:00.000Z'),
      new Date('2026-09-10T00:00:00.000Z'),
      null,
      10,
    );
    expect(repository.loadActivities).not.toHaveBeenCalled();
    expect(manifest.rowCount).toBe(1);
    const part = store.objects.get(manifest.parts[0]!.key)!;
    const serialized = gunzipSync(part.body).toString('utf8');
    expect(serialized).not.toContain('buyer-raw-id');
    expect(serialized).toContain('buyerPseudonym');
  });

  it('refreshes only changed users in four batched reads and skips semantic no-op upserts', async () => {
    const existing = {
      userId: 'buyer-raw-id', profileVersion: 1, featureSchemaVersion: 1,
      generatedAt: new Date('2026-09-09T00:00:00.000Z'), eligibilityScore: 3, eligible: false,
      viewCount30d: 0, favoriteCount90d: 1, followedShopCount: 0, orderCount90d: 0,
      categoryAffinities: [], shopAffinities: [], preferredPriceMinMinor: BigInt(1000),
      preferredPriceMaxMinor: BigInt(1000), preferredPriceMeanMinor: BigInt(1000),
      recentProductIds: ['product-1'], source: 'offline-activity-builder',
    };
    const repository = {
      listActivityUserIdsPage: jest.fn().mockResolvedValueOnce(['buyer-raw-id']).mockResolvedValueOnce([]),
      loadActivitiesForUsers: jest.fn().mockResolvedValue(new Map([['buyer-raw-id', [{ type: 'favorite', productId: 'product-1', categoryId: undefined, shopId: undefined, priceMinor: 1000, occurredAt: new Date('2026-09-09T00:00:00.000Z') }]]])),
      findProfilesByUserIds: jest.fn().mockResolvedValue([existing]),
      upsertProfile: jest.fn(),
      listProfilesChangedPage: jest.fn().mockResolvedValueOnce([existing]).mockResolvedValueOnce([]),
    };
    const exporter = new BuyerProfileSnapshotExporter(repository as never, config);
    await exporter.export({ runId: 'run-batch', sourceDate: '2026-09-10', since: new Date('2026-09-09T00:00:00.000Z'), cutoff: new Date('2026-09-10T00:00:00.000Z'), store: new MemorySnapshotObjectStore() });
    expect(repository.listActivityUserIdsPage).toHaveBeenCalledTimes(1);
    expect(repository.loadActivitiesForUsers).toHaveBeenCalledWith(['buyer-raw-id'], new Date('2026-09-10T00:00:00.000Z'));
    expect(repository.upsertProfile).not.toHaveBeenCalled();
  });

  it('fails closed when pseudonym configuration is missing', async () => {
    const exporter = new BuyerProfileSnapshotExporter(
      { listProfilesChangedPage: jest.fn() } as never,
      { ...config, pseudonymSecret: null },
    );
    await expect(
      exporter.export({
        runId: 'run-1',
        sourceDate: '2026-09-10',
        since: new Date('2026-09-09T00:00:00.000Z'),
        cutoff: new Date('2026-09-10T00:00:00.000Z'),
        store: new MemorySnapshotObjectStore(),
      }),
    ).rejects.toThrow(/pseudonym/i);
  });
});
