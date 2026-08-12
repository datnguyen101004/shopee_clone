import { CatalogQueryValidationError, parseCatalogQuery } from './catalog-query';

describe('parseCatalogQuery', () => {
  it('applies keyword-sensitive defaults and normalizes whitespace', () => {
    expect(parseCatalogQuery({})).toMatchObject({ q: null, sort: 'newest', page: 1, pageSize: 12 });
    expect(parseCatalogQuery({ q: '  Ốp   lưng  ' })).toMatchObject({
      q: 'Ốp lưng',
      sort: 'relevance',
    });
    expect(parseCatalogQuery({ q: '   ' })).toMatchObject({ q: null, sort: 'newest' });
    expect(parseCatalogQuery({ category: '   ', location: '   ' })).toMatchObject({
      category: null,
      location: null,
    });
  });

  it('accepts every discovery criterion and ignores unsupported keys', () => {
    expect(
      parseCatalogQuery({
        q: 'phone',
        category: 'electronics',
        minPrice: '0',
        maxPrice: '2000000',
        rating: '4',
        location: '  TP.  Hồ Chí Minh ',
        availability: 'in-stock',
        promotion: 'discounted',
        sort: 'price-desc',
        page: '2',
        pageSize: '24',
        tracking: 'ignored',
      }),
    ).toEqual({
      q: 'phone',
      category: 'electronics',
      minPrice: 0,
      maxPrice: 2_000_000,
      rating: 4,
      location: 'TP. Hồ Chí Minh',
      availability: 'in-stock',
      promotion: 'discounted',
      sort: 'price-desc',
      page: 2,
      pageSize: 24,
    });
  });

  it('retains unknown but syntactically safe category and location values', () => {
    expect(parseCatalogQuery({ category: 'unknown-category', location: 'Đà Nẵng' })).toMatchObject({
      category: 'unknown-category',
      location: 'Đà Nẵng',
    });
  });

  it('rejects repeated, oversized, inverted, and unsupported values together', () => {
    expect(() =>
      parseCatalogQuery({
        q: 'x'.repeat(121),
        category: ['electronics', 'home-living'],
        minPrice: '200',
        maxPrice: '100',
        rating: '4.5',
        location: '<script>',
        availability: 'all',
        promotion: 'sale',
        sort: 'popular',
        page: '0',
        pageSize: '49',
      }),
    ).toThrow(CatalogQueryValidationError);
    try {
      parseCatalogQuery({ minPrice: '200', maxPrice: '100', rating: '9' });
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogQueryValidationError);
      expect(
        (error as CatalogQueryValidationError).invalidParameters.map((issue) => issue.name),
      ).toEqual(expect.arrayContaining(['minPrice', 'rating']));
    }
  });
});
