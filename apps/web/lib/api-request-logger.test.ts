import { afterEach, describe, expect, it, vi } from 'vitest';

import { installApiRequestLogger } from './api-request-logger';

const installationFlag = '__shopeeCloneApiFetchLoggerInstalled';
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as Record<string, unknown>)[installationFlag];
  vi.restoreAllMocks();
});

describe('installApiRequestLogger', () => {
  it('logs API request metadata and redacts sensitive query parameters', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    globalThis.fetch = fetcher as typeof fetch;

    installApiRequestLogger();
    await fetch('https://api.example.test/api/v1/homepage?code=private-value');

    expect(fetcher).toHaveBeenCalledOnce();
    expect(info).toHaveBeenNthCalledWith(1, '[api-debug] request', {
      method: 'GET',
      url: 'https://api.example.test/api/v1/homepage?code=%5Bredacted%5D',
    });
    expect(info).toHaveBeenNthCalledWith(
      2,
      '[api-debug] response',
      expect.objectContaining({ method: 'GET', status: 204 }),
    );
  });

  it('does not log non-API requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    globalThis.fetch = fetcher as typeof fetch;

    installApiRequestLogger();
    await fetch('https://videod.me/_next/static/chunk.js');

    expect(fetcher).toHaveBeenCalledOnce();
    expect(info).not.toHaveBeenCalled();
  });
});
