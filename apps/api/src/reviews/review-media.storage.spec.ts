import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ReviewMediaStorage } from './review-media.storage';

describe('ReviewMediaStorage', () => {
  const previous = process.env.REVIEW_MEDIA_ROOT;
  let root = '';
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'review-media-')); process.env.REVIEW_MEDIA_ROOT = root; });
  afterEach(async () => { if (previous === undefined) delete process.env.REVIEW_MEDIA_ROOT; else process.env.REVIEW_MEDIA_ROOT = previous; await rm(root, { recursive: true, force: true }); });

  it('stores opaque image keys and refuses traversal reads/removals', async () => {
    const storage = new ReviewMediaStorage();
    const key = await storage.write('image/png', Buffer.from('safe-image'));
    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/);
    await expect(storage.read(key)).resolves.toEqual(Buffer.from('safe-image'));
    await expect(storage.read('../../.env')).resolves.toBeNull();
    await storage.remove('../../.env');
    await storage.remove(key);
    await expect(storage.read(key)).resolves.toBeNull();
  });
});
