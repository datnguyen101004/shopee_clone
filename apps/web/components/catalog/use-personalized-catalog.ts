'use client';

import {
  isCatalogProductsResponse,
  parsePublicShopCatalogPage,
  type CatalogProductsResponse,
} from '@shopee-clone/contracts';
import { useEffect, useMemo, useState } from 'react';

import { useAuthSession } from '../auth-session-provider';
import type { CatalogRouteContext } from './catalog-utils';

export function usePersonalizedCatalog({
  response,
  context,
  personalizedPath,
}: {
  response: Pick<CatalogProductsResponse, 'items' | 'pagination'>;
  context?: CatalogRouteContext;
  personalizedPath?: string;
}) {
  const { state: authState, authenticatedFetch } = useAuthSession();
  const [personalizedResponse, setPersonalizedResponse] = useState<{
    path: string;
    response: Pick<CatalogProductsResponse, 'items' | 'pagination'>;
  } | null>(null);

  const catalogPath = useMemo(() => {
    if (personalizedPath) return personalizedPath;
    if (!context) return null;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q: context.q,
      category: context.category,
      minPrice: context.minPrice,
      maxPrice: context.maxPrice,
      rating: context.rating,
      location: context.location,
      availability: context.availability,
      promotion: context.promotion,
      sort: context.sort,
      page: response.pagination.page,
      pageSize: context.pageSize,
    })) {
      if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
    }
    return `/api/v1/catalog/products?${params.toString()}`;
  }, [context, personalizedPath, response.pagination.page]);

  useEffect(() => {
    // Reset personalized data on logout to avoid leaking private state
    if (authState.status !== 'authenticated') {
      setPersonalizedResponse(null);
      return;
    }
    if (!catalogPath) return;

    const controller = new AbortController();
    const endpoint = new URL(
      catalogPath,
      process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
    );

    void authenticatedFetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) return;
        const body: unknown = await result.json();
        const personalized = isCatalogProductsResponse(body)
          ? body
          : parsePublicShopCatalogPage(body);
        if (personalized) setPersonalizedResponse({ path: catalogPath, response: personalized });
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [authState.status, authenticatedFetch, catalogPath]);

  const activeResponse =
    personalizedResponse?.path === catalogPath ? personalizedResponse.response : response;

  return activeResponse;
}
