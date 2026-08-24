import { describe, expect, it, vi } from 'vitest';

import { fetchHomepage, HomepageApiError } from './homepage-api';

const valid = { evaluatedAt: '2026-08-12T00:00:00.000Z', modules: [] };

describe('fetchHomepage', () => {
  it('uses a no-store server request and returns a typed response', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid), { status: 200 }));
    await expect(fetchHomepage(fetcher)).resolves.toEqual(valid);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/v1/homepage',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('uses the public API origin when the server-only origin is not configured', async () => {
    const originalHomepageBaseUrl = process.env.HOMEPAGE_API_BASE_URL;
    const originalPublicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.HOMEPAGE_API_BASE_URL;
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.videod.me';
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid), { status: 200 }));

    try {
      await expect(fetchHomepage(fetcher)).resolves.toEqual(valid);
      expect(fetcher).toHaveBeenCalledWith(
        'https://api.videod.me/api/v1/homepage',
        expect.objectContaining({ cache: 'no-store' }),
      );
    } finally {
      if (originalHomepageBaseUrl === undefined) delete process.env.HOMEPAGE_API_BASE_URL;
      else process.env.HOMEPAGE_API_BASE_URL = originalHomepageBaseUrl;
      if (originalPublicBaseUrl === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
      else process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicBaseUrl;
    }
  });

  it.each([
    ['status', vi.fn().mockResolvedValue(new Response('{}', { status: 503 }))],
    ['contract', vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))],
    ['transport', vi.fn().mockRejectedValue(new TypeError('offline'))],
  ])('classifies %s errors', async (kind, fetcher) => {
    await expect(fetchHomepage(fetcher)).rejects.toMatchObject({ kind });
  });

  it('aborts a timed-out request', async () => {
    const fetcher = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;
    await expect(fetchHomepage(fetcher, 1)).rejects.toEqual(new HomepageApiError('timeout'));
  });
});
