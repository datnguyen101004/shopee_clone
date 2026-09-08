import { describe, expect, it } from 'vitest';
import { canonicalInventoryAdjustmentRequest, canonicalInventoryUtcTimestamp, formatInventoryVersionEtag, isInventoryPage, parseInventoryAdjustmentRequest, parseInventoryPageQuery, parseInventoryVersionEtag } from '../src/inventory';

describe('inventory contracts', () => {
  it('parses strict version and adjustment input', () => {
    expect(parseInventoryVersionEtag('"inventory-4"')).toBe(4);
    expect(formatInventoryVersionEtag(4)).toBe('"inventory-4"');
    expect(parseInventoryAdjustmentRequest({ delta: 5, reason: 'RESTOCK', note: ' nhập thêm ' })).toEqual({ delta: 5, reason: 'RESTOCK', note: 'nhập thêm' });
    expect(parseInventoryAdjustmentRequest({ delta: 0, reason: 'RESTOCK', note: null })).toBeNull();
  });

  it('requires a nullable product image URL in inventory balances', () => {
    const balance = {
      variantId: '00000000-0000-4000-8000-000000000001',
      productId: '00000000-0000-4000-8000-000000000002',
      productName: 'Gương',
      productImageUrl: null,
      variantName: 'Mặc định',
      sku: 'SKU-1',
      lifecycle: 'active',
      quantityOnHand: 10,
      quantityReserved: 2,
      quantitySold: 3,
      availableQuantity: 8,
      lowStock: true,
      version: 1,
      updatedAt: '2026-08-18T00:00:00.000Z',
    };
    const page = { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 };
    expect(isInventoryPage({ items: [balance], ...page })).toBe(true);
    const withoutImage = { ...balance } as Record<string, unknown>;
    delete withoutImage.productImageUrl;
    expect(isInventoryPage({ items: [withoutImage], ...page })).toBe(false);
    expect(isInventoryPage({ items: [{ ...balance, productImageUrl: 42 }], ...page })).toBe(false);
  });

  it('accepts URL query strings and rejects invalid pages', () => {
    expect(parseInventoryPageQuery({ lowStock: 'true', page: '2' })).toEqual({ page: 2, productId: null, lowStock: true });
    expect(parseInventoryPageQuery({ page: '0' })).toBeNull();
  });

  it('keeps request digests and UTC timestamp inputs canonical', () => {
    expect(canonicalInventoryAdjustmentRequest({ delta: 5, reason: 'RESTOCK', note: ' nhập   thêm ' })).toBe('{"delta":5,"note":"nhập thêm","reason":"RESTOCK"}');
    expect(canonicalInventoryUtcTimestamp('2026-08-18T00:00:00.000Z')).toBe('2026-08-18T00:00:00.000Z');
    expect(canonicalInventoryUtcTimestamp('2026-08-18')).toBeNull();
  });
});
