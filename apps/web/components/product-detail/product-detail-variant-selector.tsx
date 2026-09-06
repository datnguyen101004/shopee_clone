'use client';

import type { ProductDetailVariant } from '@shopee-clone/contracts';

export interface ProductVariantSelectorProps {
  variants: ProductDetailVariant[];
  selectedVariantId: string | null;
  onSelectVariant: (variantId: string) => void;
}

export function ProductVariantSelector({
  variants,
  selectedVariantId,
  onSelectVariant,
}: ProductVariantSelectorProps) {
  return (
    <div className="product-detail-variants" role="group" aria-label="Biến thể sản phẩm">
      <span>Biến thể</span>
      <div>
        {variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            className={variant.id === selectedVariantId ? 'is-selected' : undefined}
            aria-pressed={variant.id === selectedVariantId}
            onClick={() => onSelectVariant(variant.id)}
          >
            {variant.name}
            {variant.availability === 'unavailable' ? ' · Hết hàng' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
