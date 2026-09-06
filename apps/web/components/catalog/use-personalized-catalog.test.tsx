import type { CatalogProductsResponse } from '@shopee-clone/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePersonalizedCatalog } from './use-personalized-catalog';
import type { CatalogRouteContext } from './catalog-utils';
import { useAuthSession } from '../auth-session-provider';

vi.mock('../auth-session-provider', () => ({
  useAuthSession: vi.fn(),
}));

function mockContext(overrides: Partial<CatalogRouteContext> = {}): CatalogRouteContext {
  return {
    q: null,
    category: null,
    minPrice: null,
    maxPrice: null,
    rating: null,
    location: null,
    availability: null,
    promotion: null,
    sort: 'newest',
    pageSize: 12,
    ...overrides,
  };
}

const baseResponse: Pick<CatalogProductsResponse, 'items' | 'pagination'> = {
  items: [],
  pagination: { page: 1, pageSize: 12, totalItems: 0, totalPages: 1 },
};

describe('usePersonalizedCatalog', () => {
  const authenticatedFetch = vi.fn();

  beforeEach(() => {
    authenticatedFetch.mockReset();
  });

  function mockAuthSession(status: 'guest' | 'authenticated') {
    vi.mocked(useAuthSession).mockReturnValue({
      state:
        status === 'authenticated'
          ? {
              status: 'authenticated',
              user: {
                id: 'acc-1',
                email: 'user@example.com',
                displayName: 'Test User',
                roles: ['buyer'],
                isEmailVerified: true,
              },
            }
          : { status: 'guest', user: null },
      authenticatedFetch,
      sessionFetch: authenticatedFetch,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      restore: vi.fn(),
      completeGoogleSignIn: vi.fn(),
      synchronizeDisplayName: vi.fn(),
    } as unknown as ReturnType<typeof useAuthSession>);
  }

  it('returns base response when user is guest and does not fetch', () => {
    mockAuthSession('guest');

    const { result } = renderHook(() =>
      usePersonalizedCatalog({
        response: baseResponse,
        context: mockContext({ q: 'sách' }),
      }),
    );

    expect(result.current).toEqual(baseResponse);
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('fetches personalized response when authenticated and replaces display data', async () => {
    mockAuthSession('authenticated');

    const personalizedItems = [
      {
        id: 'prod-pers-1',
        name: 'Sản phẩm gợi ý cá nhân',
        href: '/products/prod-pers-1',
        imageUrl: null,
        imageAlt: 'Sản phẩm gợi ý',
        priceMinor: 200_000,
        ratingAverageBasisPoints: 500,
        ratingCount: 10,
        soldCount: 50,
        shop: { name: 'Shop 1', location: 'Hà Nội' },
        category: { slug: 'sach', name: 'Sách' },
      },
    ];

    authenticatedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        query: {
          q: 'sách',
          category: null,
          minPrice: null,
          maxPrice: null,
          rating: null,
          location: null,
          availability: null,
          promotion: null,
          sort: 'newest',
        },
        pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1 },
        facets: { categories: [], locations: [], priceRange: { min: null, max: null } },
        items: personalizedItems,
      }),
    });

    const { result } = renderHook(() =>
      usePersonalizedCatalog({
        response: baseResponse,
        context: mockContext({ q: 'sách' }),
      }),
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]!.name).toBe('Sản phẩm gợi ý cá nhân');
  });

  it('resets personalized response back to base response upon logout', async () => {
    mockAuthSession('authenticated');

    const personalizedItems = [
      {
        id: 'prod-pers-1',
        name: 'Sản phẩm gợi ý cá nhân',
        href: '/products/prod-pers-1',
        imageUrl: null,
        imageAlt: 'Sản phẩm gợi ý',
        priceMinor: 200_000,
        ratingAverageBasisPoints: 500,
        ratingCount: 10,
        soldCount: 50,
        shop: { name: 'Shop 1', location: 'Hà Nội' },
        category: { slug: 'sach', name: 'Sách' },
      },
    ];

    authenticatedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        query: {
          q: 'sách',
          category: null,
          minPrice: null,
          maxPrice: null,
          rating: null,
          location: null,
          availability: null,
          promotion: null,
          sort: 'newest',
        },
        pagination: { page: 1, pageSize: 12, totalItems: 1, totalPages: 1 },
        facets: { categories: [], locations: [], priceRange: { min: null, max: null } },
        items: personalizedItems,
      }),
    });

    const { result, rerender } = renderHook(() =>
      usePersonalizedCatalog({
        response: baseResponse,
        context: mockContext({ q: 'sách' }),
      }),
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));

    // User logs out -> session becomes guest
    mockAuthSession('guest');
    rerender();

    // State reset prevents leaking personalized data across sessions
    expect(result.current).toEqual(baseResponse);
  });
});
