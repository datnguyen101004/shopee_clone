import { describe, expect, it } from 'vitest';

import { isProductDetailResponse, parseProductDetailResponse } from '../src';

const productId = '00000000-0000-4000-8000-000000000301';
const variantId = '00000000-0000-4000-8000-000000000401';
const mediaId = '00000000-0000-4000-8000-000000000501';
const response = {
  id: productId,
  name: 'Smartphone Pro',
  description: 'Product detail fixture',
  category: { slug: 'mobile-accessories', name: 'Mobile & Accessories' },
  ratingAverageBasisPoints: 490,
  ratingCount: 12,
  soldCount: 20,
  gallery: [
    {
      id: mediaId,
      url: '/media/products/phone.jpg',
      altText: 'Phone',
      sortOrder: 0,
      variantId: null,
      isPrimary: true,
    },
  ],
  variants: [
    {
      id: variantId,
      name: '128GB',
      sku: 'PHONE-128',
      priceMinor: 1_000,
      compareAtPriceMinor: 1_200,
      discountPercent: 16,
      availableQuantity: 2,
      availability: 'in-stock',
      preferredImageId: mediaId,
    },
  ],
  purchasable: true,
  initialVariantId: variantId,
  shop: {
    id: '00000000-0000-4000-8000-000000000101',
    slug: 'tech-store',
    name: 'Tech Store',
    location: 'Hồ Chí Minh',
    activeProductCount: 3,
  },
  shippingPreview: {
    origin: 'Hồ Chí Minh',
    destinationLabel: 'Toàn quốc',
    feeMinor: null,
    deliveryTimeLabel: null,
    message: 'Xác nhận sau.',
  },
  relatedProducts: [],
};

describe('product detail contract', () => {
  it('accepts populated, no-media, unavailable, and empty-related responses', () => {
    expect(parseProductDetailResponse(response)).toEqual(response);
    expect(
      isProductDetailResponse({
        ...response,
        gallery: [],
        variants: [{ ...response.variants[0], preferredImageId: null }],
      }),
    ).toBe(true);
    expect(
      isProductDetailResponse({
        ...response,
        variants: [{ ...response.variants[0], availableQuantity: 0, availability: 'unavailable' }],
        purchasable: false,
        initialVariantId: variantId,
      }),
    ).toBe(true);
    expect(
      isProductDetailResponse({
        ...response,
        gallery: [{ ...response.gallery[0], url: 'https://cdn.example.test/product.jpg' }],
      }),
    ).toBe(true);
  });

  it('rejects unsafe money, inconsistent availability, invalid media and broken related links', () => {
    expect(
      isProductDetailResponse({
        ...response,
        variants: [{ ...response.variants[0], priceMinor: 1.5 }],
      }),
    ).toBe(false);
    expect(
      isProductDetailResponse({
        ...response,
        variants: [{ ...response.variants[0], availableQuantity: 0 }],
      }),
    ).toBe(false);
    expect(
      isProductDetailResponse({
        ...response,
        gallery: [{ ...response.gallery[0], variantId: '00000000-0000-4000-8000-000000000402' }],
      }),
    ).toBe(false);
    expect(
      isProductDetailResponse({
        ...response,
        gallery: [{ ...response.gallery[0], url: 'http://insecure.example.test/product.jpg' }],
      }),
    ).toBe(false);
    expect(
      isProductDetailResponse({
        ...response,
        relatedProducts: [
          { ...response.variants[0], id: productId, href: `/products/${productId}` },
        ],
      }),
    ).toBe(false);
  });
});
