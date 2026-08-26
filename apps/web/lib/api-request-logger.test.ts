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

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenNthCalledWith(
      1,
      '[api-debug] request',
      '{"method":"GET","url":"https://api.example.test/api/v1/homepage?code=%5Bredacted%5D"}',
    );
    expect(info).toHaveBeenNthCalledWith(
      2,
      '[api-debug] response',
      expect.stringContaining('"status":204'),
    );
  });

  it('does not log non-API requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    globalThis.fetch = fetcher as typeof fetch;

    installApiRequestLogger();
    await fetch('https://videod.me/_next/static/chunk.js');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });

  it('redacts CloudFront and S3 signature parameters', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 307 }));
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    globalThis.fetch = fetcher as typeof fetch;

    installApiRequestLogger();
    await fetch(
      'https://api.example.test/api/v1/product-media/asset?Expires=123&Signature=abc&Key-Pair-Id=key&X-Amz-Signature=s3',
    );

    expect(info).toHaveBeenNthCalledWith(
      1,
      '[api-debug] request',
      expect.stringContaining('Expires=%5Bredacted%5D'),
    );
    expect(info.mock.calls[0]?.[2]).toBeUndefined();
    expect(String(info.mock.calls[0]?.[1])).not.toContain('abc');
    expect(String(info.mock.calls[0]?.[1])).not.toContain('s3');
  });

  it('logs direct S3 upload metadata without exposing the presigned signature', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    globalThis.fetch = fetcher as typeof fetch;

    installApiRequestLogger();
    await fetch(
      'https://amzn-s3-shopee-clone.s3.ap-southeast-1.amazonaws.com/seller-product-media/asset.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=secret&X-Amz-Expires=300',
      { method: 'PUT' },
    );

    expect(info).toHaveBeenNthCalledWith(
      1,
      '[api-debug] request',
      expect.stringContaining('X-Amz-Signature=%5Bredacted%5D'),
    );
    expect(String(info.mock.calls[0]?.[1])).not.toContain('secret');
  });

  it('does not report expected request aborts as transport errors', async () => {
    const abortError = new DOMException('signal is aborted without reason', 'AbortError');
    const fetcher = vi.fn().mockRejectedValue(abortError);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    globalThis.fetch = fetcher as typeof fetch;

    installApiRequestLogger();
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetch('https://api.example.test/api/v1/account/orders?limit=20', {
        signal: controller.signal,
      }),
    ).rejects.toBe(abortError);
    expect(error).not.toHaveBeenCalled();
  });
});
