import { describe, expect, it, vi } from 'vitest';

import { uploadAdminBannerMedia } from './admin-api';

describe('admin banner direct media upload', () => {
  it('requests an intent, PUTs the signed image, then completes the staged asset', async () => {
    const intent = {
      mediaId: '00000000-0000-4000-8000-000000000106',
      upload: {
        url: 'https://private-bucket.s3.example.test/object?X-Amz-Signature=secret',
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'x-amz-checksum-sha256': 'checksum' },
        expiresAt: '2026-09-08T10:05:00.000Z',
      },
    };
    const complete = {
      id: intent.mediaId,
      mimeType: 'image/png',
      byteSize: 2,
      width: 1200,
      height: 400,
      imageUrl: 'https://cdn.example.test/admin-banner-media/banner.png',
      expiresAt: '2026-09-09T10:00:00.000Z',
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
    const file = new File([new Uint8Array([1, 2])], 'banner.png', { type: 'image/png' });

    await expect(uploadAdminBannerMedia(fetcher, file)).resolves.toEqual(complete);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(s3Fetch).toHaveBeenCalledWith(
      intent.upload.url,
      expect.objectContaining({ method: 'PUT', body: file, headers: intent.upload.headers }),
    );
  });

  it('rejects unsupported files before creating an upload intent', async () => {
    const fetcher = vi.fn();
    const file = new File([new Uint8Array([1])], 'banner.gif', { type: 'image/gif' });

    await expect(uploadAdminBannerMedia(fetcher, file)).rejects.toMatchObject({
      kind: 'contract',
      status: 400,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
