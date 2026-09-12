import type * as ClickstreamModule from '../../lib/clickstream';
import type { CatalogProductCard } from '@shopee-clone/contracts';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { submitClickstreamEvent } from '../../lib/clickstream';
import { useAuthSession } from '../auth-session-provider';
import { CatalogProductGrid } from './catalog-product-grid';

const tracking = vi.hoisted(() => ({
  submitClickstreamEvent: vi.fn(),
  sessionFetch: vi.fn(),
}));

vi.mock('../../lib/clickstream', async (importOriginal) => {
  const original = await importOriginal<typeof ClickstreamModule>();
  return { ...original, submitClickstreamEvent: tracking.submitClickstreamEvent };
});
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const product: CatalogProductCard = {
  id: 'product-1',
  name: 'Tai nghe không dây',
  href: '/products/product-1',
  imageUrl: null,
  imageAlt: 'Tai nghe không dây',
  priceMinor: 399_000,
  ratingAverageBasisPoints: 490,
  ratingCount: 128,
  soldCount: 941,
  shop: { name: 'Tech Zone', location: 'TP. Hồ Chí Minh' },
  category: { slug: 'mobile-accessories', name: 'Điện thoại & Phụ kiện' },
};

describe('CatalogProductGrid impression tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'guest', user: null },
      sessionFetch: tracking.sessionFetch,
      authenticatedFetch: tracking.sessionFetch,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      restore: vi.fn(),
      completeGoogleSignIn: vi.fn(),
      synchronizeDisplayName: vi.fn(),
    } as unknown as ReturnType<typeof useAuthSession>);
  });

  it('does not re-emit the same rendered result impression after a products rerender', () => {
    const { rerender } = render(<CatalogProductGrid products={[product]} query="tai nghe" />);

    expect(submitClickstreamEvent).toHaveBeenCalledTimes(1);

    rerender(
      <CatalogProductGrid products={[{ ...product }]} query="tai nghe" />,
    );

    expect(submitClickstreamEvent).toHaveBeenCalledTimes(1);
  });
});
