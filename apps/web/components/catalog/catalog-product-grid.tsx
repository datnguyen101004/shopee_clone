'use client';

import type { CatalogProductCard } from '@shopee-clone/contracts';

import { ProductCard } from './catalog-product-card';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';

export function CatalogProductGrid({ products }: { products: CatalogProductCard[] }) {
  return (
    <FavoriteStateProvider productIds={products.map(({ id }) => id)}>
      <div className="catalog-grid" aria-label="Danh sách sản phẩm">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </FavoriteStateProvider>
  );
}
