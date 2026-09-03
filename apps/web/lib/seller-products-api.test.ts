import { describe, expect, it, vi } from 'vitest';

import { stageSellerProductMedia } from './seller-products-api';

describe('seller product direct media upload', () => {
  it('requests an intent, PUTs exact signed headers to S3, then completes the asset', async () => {
    const intent = {
      mediaId: '00000000-0000-4000-8000-000000000106',
      upload: {
        url: 'https://private-bucket.s3.example.test/object?X-Amz-Signature=secret',
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'x-amz-checksum-sha256': 'checksum' },
        expiresAt: '2026-08-24T10:05:00.000Z',
      },
    };
    const complete = {
      id: intent.mediaId,
      mimeType: 'image/png',
      byteSize: 2,
      width: 1,
      height: 1,
      previewUrl: `/api/v1/seller/products/media/${intent.mediaId}/preview`,
      expiresAt: '2026-08-25T10:00:00.000Z',
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      expect(String(input)).not.toContain('X-Amz-Signature');
      if (path.endsWith('/upload-intents')) return Response.json(intent, { status: 201 });
      expect(path.endsWith('/complete')).toBe(true);
      expect(init?.body).toBe('{}');
      return Response.json(complete, { status: 200 });
    });
    const s3Fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', s3Fetch);
    const file = new File([new Uint8Array([1, 2])], 'pixel.png', { type: 'image/png' });

    await expect(stageSellerProductMedia(fetcher, file)).resolves.toEqual(complete);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(s3Fetch).toHaveBeenCalledWith(intent.upload.url, expect.objectContaining({ method: 'PUT', body: file, headers: intent.upload.headers }));
  });
});
