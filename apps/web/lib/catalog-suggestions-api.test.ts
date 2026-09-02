import { describe, expect, it, vi } from 'vitest';

import { CatalogSuggestionsApiError, fetchCatalogSuggestions } from './catalog-suggestions-api';

describe('fetchCatalogSuggestions', () => {
  it('waits for a valid suggestion response and encodes the query', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ suggestions: [{ text: 'Quần Jean Nam' }] }), { status: 200 }),
      );

    await expect(fetchCatalogSuggestions('quần jea', fetcher)).resolves.toEqual([
      { text: 'Quần Jean Nam' },
    ]);
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      'http://127.0.0.1:3001/api/v1/catalog/products/suggestions?q=qu%E1%BA%A7n+jea&limit=6',
    );
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it('does not request suggestions for an empty query', async () => {
    const fetcher = vi.fn();
    await expect(fetchCatalogSuggestions('  ', fetcher)).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['status', vi.fn().mockResolvedValue(new Response('{}', { status: 503 }))],
    ['contract', vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))],
    ['transport', vi.fn().mockRejectedValue(new TypeError('offline'))],
  ])('classifies %s errors', async (kind, fetcher) => {
    await expect(fetchCatalogSuggestions('watch', fetcher)).rejects.toEqual(
      new CatalogSuggestionsApiError(kind as 'status' | 'contract' | 'transport'),
    );
  });
});
