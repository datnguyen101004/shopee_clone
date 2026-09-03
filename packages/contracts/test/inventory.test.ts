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
    expect(isInventoryPage({ items: [balance], nextCursor: null })).toBe(true);
    const withoutImage = { ...balance } as Record<string, unknown>;
    delete withoutImage.productImageUrl;
    expect(isInventoryPage({ items: [withoutImage], nextCursor: null })).toBe(false);
    expect(isInventoryPage({ items: [{ ...balance, productImageUrl: 42 }], nextCursor: null })).toBe(false);
  });

  it('accepts URL query strings and rejects unsafe page sizes', () => {
    expect(parseInventoryPageQuery({ lowStock: 'true', limit: '20' })).toEqual({ cursor: null, limit: 20, productId: null, lowStock: true });
    expect(parseInventoryPageQuery({ limit: '51' })).toBeNull();
  });

  it('keeps request digests and UTC timestamp inputs canonical', () => {
    expect(canonicalInventoryAdjustmentRequest({ delta: 5, reason: 'RESTOCK', note: ' nhập   thêm ' })).toBe('{"delta":5,"note":"nhập thêm","reason":"RESTOCK"}');
    expect(canonicalInventoryUtcTimestamp('2026-08-18T00:00:00.000Z')).toBe('2026-08-18T00:00:00.000Z');
    expect(canonicalInventoryUtcTimestamp('2026-08-18')).toBeNull();
  });
});
