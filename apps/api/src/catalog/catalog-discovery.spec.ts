import {
  discoveryTokens,
  normalizeDiscoveryText,
  rankSearchSuggestions,
  relevanceScore,
} from './catalog-discovery';

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

  it('matches bounded typing mistakes while requiring every query token', () => {
    const jean = {
      name: 'Quần Jean Nam',
      description: 'Quần denim thời trang',
      shopName: 'Thời trang',
      categoryName: 'Thời trang nam',
    };
    expect(relevanceScore(jean, 'quần jea')).not.toBeNull();
    expect(relevanceScore(jean, 'quần xyz')).toBeNull();
  });

  it('ranks typo-tolerant suggestions deterministically and removes duplicates', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    expect(
      rankSearchSuggestions(
        [
          { name: 'Quần Jean Nam', soldCount: 2, createdAt },
          { name: 'Quần Jeans Nam', soldCount: 5, createdAt },
          { name: 'Áo Jean Nam', soldCount: 99, createdAt },
        ],
        'quần jea',
        3,
      ),
    ).toEqual(['Quần Jeans Nam', 'Quần Jean Nam']);
  });
});
