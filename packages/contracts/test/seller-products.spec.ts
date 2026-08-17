import { describe, expect, it } from 'vitest';
import {
  generateSellerProductCombinations,
  isSellerProductUpsertRequest,
  normalizeSellerProductMediaUrl,
  normalizeSellerProductSlug,
} from '../src';

const id = '00000000-0000-4000-8000-000000000101';
const request = {
  name: 'Sample product', description: 'A complete description', categoryId: id,
  attributes: [], media: [{ url: 'https://cdn.example.test/product.jpg', altText: null, sortOrder: 0 }],
  packageLengthMm: 100, packageWidthMm: 100, packageHeightMm: 100,
  optionGroups: [{ name: 'Color', values: ['Red', 'Blue'] }],
  variants: [
    { combination: ['Red'], priceMinor: 100000, compareAtPriceMinor: null, stock: 3, weightGrams: 500, maxPurchaseQuantity: null, active: true },
    { combination: ['Blue'], priceMinor: 100000, compareAtPriceMinor: 120000, stock: 4, weightGrams: 500, maxPurchaseQuantity: 2, active: true },
  ],
};

describe('seller product contracts', () => {
  it('normalizes seller slugs and accepts HTTPS media only', () => {
    expect(normalizeSellerProductSlug(' Sample-Product ')).toBe('sample-product');
    expect(normalizeSellerProductSlug('sample product')).toBeNull();
    expect(normalizeSellerProductMediaUrl('https://cdn.example.test/a.jpg')).toBe('https://cdn.example.test/a.jpg');
    expect(normalizeSellerProductMediaUrl('http://cdn.example.test/a.jpg')).toBeNull();
  });

  it('generates stable cartesian option combinations', () => {
    expect(generateSellerProductCombinations([{ name: 'Color', values: ['Red', 'Blue'] }, { name: 'Size', values: ['S', 'M'] }])).toEqual([['Red', 'S'], ['Red', 'M'], ['Blue', 'S'], ['Blue', 'M']]);
  });

  it('enforces exact complete product authoring input', () => {
    expect(isSellerProductUpsertRequest(request)).toBe(true);
    expect(isSellerProductUpsertRequest({ ...request, media: [{ ...request.media[0], url: 'javascript:alert(1)' }] })).toBe(false);
    expect(isSellerProductUpsertRequest({ ...request, variants: [request.variants[0], { ...request.variants[1], combination: ['Red'] }] })).toBe(false);
    expect(isSellerProductUpsertRequest({ ...request, extra: true })).toBe(false);
    expect(isSellerProductUpsertRequest({ ...request, media: [], packageLengthMm: null, packageWidthMm: null, packageHeightMm: null, optionGroups: [], variants: [{ ...request.variants[0], combination: [] }] })).toBe(true);
  });

  it('accepts opaque staged media references and first-group image mappings', () => {
    const assetId = '00000000-0000-4000-8000-000000000102';
    expect(isSellerProductUpsertRequest({ ...request, media: [{ assetId, altText: null, sortOrder: 0 }], optionValueMedia: [{ groupIndex: 0, value: 'Red', mediaRef: { assetId } }] })).toBe(true);
    expect(isSellerProductUpsertRequest({ ...request, media: [{ assetId, altText: null, sortOrder: 0 }], optionValueMedia: [{ groupIndex: 0, value: 'Red', mediaRef: { imageId: 'not-a-uuid', assetId } }] })).toBe(false);
  });

  it('treats undefined optional DTO properties as absent', () => {
    const assetId = '00000000-0000-4000-8000-000000000201';
    expect(isSellerProductUpsertRequest({
      ...request,
      media: [{ url: undefined, assetId, imageId: undefined, altText: null, sortOrder: 0 }],
    })).toBe(true);
  });
});
