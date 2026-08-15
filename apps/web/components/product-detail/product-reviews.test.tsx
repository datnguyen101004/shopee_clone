import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProductDetailResponse } from '@shopee-clone/contracts';
import { ProductReviews } from './product-reviews';

const product = {
  id: '00000000-0000-4000-8000-000000000301', name: 'Phone', description: 'Detail',
  category: { slug: 'phones', name: 'Phones' }, ratingAverageBasisPoints: 0, ratingCount: 0, soldCount: 0,
  gallery: [], variants: [], purchasable: false, initialVariantId: null,
  shop: { id: '00000000-0000-4000-8000-000000000101', slug: 'store', name: 'Store', location: 'Hà Nội', activeProductCount: 1 },
  shippingPreview: { origin: 'Hà Nội', destinationLabel: 'Toàn quốc', feeMinor: null, deliveryTimeLabel: null, message: 'Xác nhận sau.' }, relatedProducts: [],
} satisfies ProductDetailResponse;

const page = (rating: number | null, nextCursor: string | null = null) => ({
  reviewVersion: 'review-v1', summary: { ratingAverageBasisPoints: 500, ratingCount: 1 },
  items: [{ id: '00000000-0000-4000-8000-000000000401', rating: 5, text: 'Tốt', authorName: 'Ngọc', verifiedPurchase: true, media: [], updatedAt: '2026-08-15T00:00:00.000Z' }],
  page: { limit: 10, nextCursor, rating },
});

afterEach(() => vi.unstubAllGlobals());

describe('ProductReviews', () => {
  it('shows an explicit zero state, filters by exact rating, and appends pages', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(page(null, 'next')), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<ProductReviews product={product} />);
    await expect(screen.findByText('Ngọc')).resolves.toBeVisible();
    await user.click(screen.getByRole('tab', { name: '5 sao' }));
    await waitFor(() => expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain('rating=5'));
    await user.click(screen.getByRole('button', { name: 'Xem thêm đánh giá' }));
    await waitFor(() => expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain('cursor=next'));
  });

  it('keeps a recoverable error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<ProductReviews product={product} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa thể tải đánh giá');
  });
});
