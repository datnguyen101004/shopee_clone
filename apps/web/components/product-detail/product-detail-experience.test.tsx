import type { ProductDetailResponse } from '@shopee-clone/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ProductDetailExperience } from './product-detail-experience';
import {
  initialProductDetailSelection,
  productLoginHandoff,
  quantityError,
  selectProductVariant,
} from './product-detail-interactions';

const product: ProductDetailResponse = {
  id: '00000000-0000-4000-8000-000000000301',
  name: 'Phone',
  description: 'Detail',
  category: { slug: 'phones', name: 'Phones' },
  ratingAverageBasisPoints: 490,
  ratingCount: 12,
  soldCount: 20,
  gallery: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      url: '/phone.jpg',
      altText: 'Phone',
      sortOrder: 0,
      variantId: null,
      isPrimary: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      url: '/phone-black.jpg',
      altText: 'Black phone',
      sortOrder: 1,
      variantId: '00000000-0000-4000-8000-000000000401',
      isPrimary: false,
    },
  ],
  variants: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      name: 'Black',
      sku: 'PHONE-BLK',
      priceMinor: 1000,
      availableQuantity: 2,
      availability: 'in-stock',
      preferredImageId: '00000000-0000-4000-8000-000000000502',
    },
    {
      id: '00000000-0000-4000-8000-000000000402',
      name: 'Silver',
      sku: 'PHONE-SLV',
      priceMinor: 1100,
      availableQuantity: 0,
      availability: 'unavailable',
      preferredImageId: '00000000-0000-4000-8000-000000000501',
    },
  ],
  purchasable: true,
  initialVariantId: '00000000-0000-4000-8000-000000000401',
  shop: {
    id: '00000000-0000-4000-8000-000000000101',
    slug: 'store',
    name: 'Store',
    location: 'Hà Nội',
    activeProductCount: 2,
  },
  shippingPreview: {
    origin: 'Hà Nội',
    destinationLabel: 'Toàn quốc',
    feeMinor: null,
    deliveryTimeLabel: null,
    message: 'Xác nhận sau.',
  },
  relatedProducts: [],
};

describe('product detail interactions', () => {
  it('initializes deterministically, switches media, resets invalid quantity, and serializes only trusted handoffs', () => {
    const initial = initialProductDetailSelection(product);
    expect(initial).toEqual({
      variantId: product.variants[0]!.id,
      activeImageId: product.gallery[1]!.id,
      quantity: '1',
    });
    expect(
      selectProductVariant(product, { ...initial, quantity: '2' }, product.variants[1]!.id)
        .quantity,
    ).toBe('1');
    expect(quantityError('3', product.variants[0]!)).toContain('tối đa');
    expect(productLoginHandoff(product, product.variants[0]!.id, '2', 'buy-now')).toBe(
      `/login?intent=buy-now&returnTo=%2Fproducts%2F${product.id}&productId=${product.id}&variantId=${product.variants[0]!.id}&quantity=2`,
    );
  });
  it('labels unavailable selections and disables purchase while retaining gallery controls', async () => {
    const user = userEvent.setup();
    render(<ProductDetailExperience product={product} />);
    expect(screen.getByRole('link', { name: /Thêm vào giỏ hàng/ })).toHaveAttribute(
      'href',
      expect.stringContaining('intent=add-to-cart'),
    );
    await user.click(screen.getByRole('button', { name: /Silver/ }));
    expect(screen.getByText('SKU')).toBeVisible();
    expect(
      screen
        .getAllByRole('button', { name: /Thêm vào giỏ hàng|Mua ngay/ })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Xem Phone' }));
    expect(screen.getByRole('img', { name: 'Phone' })).toBeVisible();
  });
});
