import { discoveryTokens, normalizeDiscoveryText, relevanceScore } from './catalog-discovery';

describe('catalog discovery scoring', () => {
  it('normalizes Vietnamese diacritics, đ, punctuation, and whitespace', () => {
    expect(normalizeDiscoveryText('  Ốp-lưng ĐIỆN thoại! ')).toBe('op lung dien thoai');
    expect(discoveryTokens('ốp ốp lưng')).toEqual(['op', 'lung']);
  });

  it('matches unaccented queries and favors product-name matches', () => {
    const base = {
      name: 'Ốp lưng chống sốc',
      description: 'Phụ kiện điện thoại',
      shopName: 'Shopee Tech Store',
      categoryName: 'Điện thoại & Phụ kiện',
    };
    expect(relevanceScore(base, 'op lung')).toBeGreaterThan(
      relevanceScore({ ...base, name: 'Sản phẩm khác', description: 'Ốp lưng' }, 'op lung') ?? 0,
    );
    expect(relevanceScore(base, 'khong ton tai')).toBeNull();
  });
});
