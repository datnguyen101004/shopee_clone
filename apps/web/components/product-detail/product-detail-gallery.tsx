'use client';

import type { ProductDetailResponse } from '@shopee-clone/contracts';

import { activeProductImage } from './product-detail-interactions';
import { marketplaceMediaUrl } from '../../lib/marketplace-media-url';

export interface ProductGalleryProps {
  product: ProductDetailResponse;
  activeImageId: string | null;
  onSelectImage: (imageId: string) => void;
}

export function ProductGallery({ product, activeImageId, onSelectImage }: ProductGalleryProps) {
  const image = activeProductImage(product, activeImageId);

  return (
    <div className="product-detail-gallery">
      <div className="product-detail-gallery__main" aria-live="polite">
        {image ? (
          <img
            src={marketplaceMediaUrl(image.url)}
            alt={image.altText}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = '/media/products/product-placeholder.svg';
            }}
          />
        ) : (
          <span
            role="img"
            aria-label={`Chưa có ảnh cho ${product.name}`}
            className="product-detail-gallery__fallback"
          >
            S
          </span>
        )}
      </div>
      {product.gallery.length > 1 ? (
        <div className="product-detail-gallery__thumbnails" aria-label="Ảnh sản phẩm">
          {product.gallery.map((thumbnail) => (
            <button
              key={thumbnail.id}
              type="button"
              className={thumbnail.id === image?.id ? 'is-current' : undefined}
              aria-pressed={thumbnail.id === image?.id}
              aria-label={`Xem ${thumbnail.altText}`}
              onClick={() => onSelectImage(thumbnail.id)}
            >
              <img
                src={marketplaceMediaUrl(thumbnail.url)}
                alt=""
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = '/media/products/product-placeholder.svg';
                }}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
