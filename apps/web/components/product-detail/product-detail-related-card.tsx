'use client';

import Link from 'next/link';
import { submitClickstreamEvent } from '../../lib/clickstream';
import { marketplaceMediaUrl } from '../../lib/marketplace-media-url';
import { useAuthSession } from '../auth-session-provider';

export function ProductDetailRelatedCard({
  product,
  position,
  requestId,
}: {
  product: {
    id: string;
    href: string;
    name: string;
    imageUrl: string | null;
    imageAlt: string;
    priceMinor: number;
  };
  position: number;
  requestId: string;
}) {
  const { sessionFetch } = useAuthSession();
  return (
    <Link
      href={product.href}
      className="product-detail-related__card"
      onClick={() =>
        submitClickstreamEvent(
          {
            eventType: 'product_clicked',
            surface: 'product_detail',
            productId: product.id,
            placement: 'related_products',
            position,
            requestId,
            properties: {},
          },
          1_500,
          sessionFetch,
        )
      }
    >
      <div className="product-detail-related__image-wrap">
        {product.imageUrl ? (
          <img src={marketplaceMediaUrl(product.imageUrl)} alt={product.imageAlt} />
        ) : (
          <span aria-hidden="true" className="product-detail-related__fallback">
            S
          </span>
        )}
      </div>
      <div className="product-detail-related__info">
        <span className="font-medium">{product.name}</span>
        <span className="product-detail-related__price font-semibold">
          ₫{new Intl.NumberFormat('vi-VN').format(product.priceMinor)}
        </span>
      </div>
    </Link>
  );
}
