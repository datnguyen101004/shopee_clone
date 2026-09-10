'use client';

import type { CatalogProductCard } from '@shopee-clone/contracts';
import { useEffect, useMemo, useState } from 'react';

import { ProductCard } from './catalog-product-card';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';
import {
  clickstreamImpressionKey,
  createClickstreamImpressionDeduper,
  createClickstreamCorrelationId,
  submitClickstreamEvent,
} from '../../lib/clickstream';
import { useAuthSession } from '../auth-session-provider';

export function CatalogProductGrid({
  products,
  query,
}: {
  products: CatalogProductCard[];
  query?: string;
}) {
  const { sessionFetch } = useAuthSession();
  const resultSetKey = `${query ?? ''}:${products.map(({ id }) => id).join(',')}`;
  const requestId = useMemo(() => createClickstreamCorrelationId(resultSetKey), [resultSetKey]);
  const [deduper] = useState(createClickstreamImpressionDeduper);
  useEffect(() => {
    for (const [position, product] of products.entries()) {
      const key = clickstreamImpressionKey({
        requestId,
        placement: 'search_results',
        productId: product.id,
        position,
      });
      if (deduper.seen(key))
        submitClickstreamEvent(
          {
            eventType: 'product_impression',
            surface: 'search',
            productId: product.id,
            placement: 'search_results',
            position,
            requestId,
            query,
            properties: {},
          },
          1_500,
          sessionFetch,
        );
    }
    return () => deduper.clear();
  }, [deduper, products, query, requestId, sessionFetch]);
  return (
    <FavoriteStateProvider productIds={products.map(({ id }) => id)}>
      <div className="catalog-grid" aria-label="Danh sách sản phẩm">
        {products.map((product, position) => (
          <ProductCard
            key={product.id}
            product={product}
            tracking={{ requestId, position, query }}
          />
        ))}
      </div>
    </FavoriteStateProvider>
  );
}
