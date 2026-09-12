import { gunzipSync } from 'node:zlib';

import { MemorySnapshotObjectStore, writeSnapshot } from './snapshot-writer';

describe('training snapshot writer', () => {
  it('writes gzip parts before the manifest and is deterministic on retry', async () => {
    const store = new MemorySnapshotObjectStore();
    const options = {
      store,
      dataset: 'products' as const,
      rootPrefix: 'snapshots',
      runId: 'run-1',
      sourceDate: '2026-09-10',
      snapshotAt: '2026-09-10T00:00:00.000Z',
      cutoff: '2026-09-10T00:00:00.000Z',
      schemaVersion: 1,
      featureSchemaVersion: 1,
      maxRowsPerPart: 1,
      maxPartBytes: 1024,
      rows: [{ productId: 'p-1' }, { productId: 'p-2' }],
      rowMapper: (row: { productId: string }) => row,
    };
    const first = await writeSnapshot(options);
    const second = await writeSnapshot(options);
    expect(second).toEqual(first);
    expect([...store.objects.keys()].at(-1)).toContain('/manifest.json');
    const part = store.objects.get(first.parts[0]!.key)!;
    expect(JSON.parse(gunzipSync(part.body).toString('utf8'))).toEqual({ productId: 'p-1' });
  });

  it('rejects forbidden raw identity fields before publication', async () => {
    await expect(
      writeSnapshot({
        store: new MemorySnapshotObjectStore(),
        dataset: 'products' as const,
        rootPrefix: 'snapshots',
        runId: 'run-privacy',
        sourceDate: '2026-09-10',
        snapshotAt: '2026-09-10T00:00:00.000Z',
        cutoff: '2026-09-10T00:00:00.000Z',
        schemaVersion: 1,
        featureSchemaVersion: 1,
        maxRowsPerPart: 10,
        maxPartBytes: 1024,
        rows: [{ userId: 'raw-user' }],
        rowMapper: (row: { userId: string }) => row,
      }),
    ).rejects.toThrow(/forbidden field/i);
  });
});
