'use client';

import type { ProductDetailVariant } from '@shopee-clone/contracts';
import type { FlashSaleSkuStatusItem } from '../../lib/flash-sale-types';
import { getVariantFlashSaleOffer } from './product-detail-flash-sale';

export interface ProductVariantSelectorProps {
  variants: ProductDetailVariant[];
  selectedVariantId: string | null;
  statusMap?: Record<string, FlashSaleSkuStatusItem>;
  onSelectVariant: (variantId: string) => void;
}

export function ProductVariantSelector({
  variants,
  selectedVariantId,
  statusMap = {},
  onSelectVariant,
}: ProductVariantSelectorProps) {
  return (
    <div className="product-detail-variants" role="group" aria-label="Biến thể sản phẩm">
      <span>Biến thể</span>
      <div>
        {variants.map((variant) => {
          const fsOffer = getVariantFlashSaleOffer(variant, statusMap);
          let label = variant.name;
          if (fsOffer.isFlashSale) {
            if (fsOffer.state === 'SOLD_OUT' || !fsOffer.canPurchase) {
              label += ' · Hết hàng';
            } else if (fsOffer.state === 'ACTIVE') {
              label += ' ⚡ Sale';
            }
          } else if (variant.availability === 'unavailable') {
            label += ' · Hết hàng';
          }

          return (
            <button
              key={variant.id}
              type="button"
              className={variant.id === selectedVariantId ? 'is-selected' : undefined}
              aria-pressed={variant.id === selectedVariantId}
              onClick={() => onSelectVariant(variant.id)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
