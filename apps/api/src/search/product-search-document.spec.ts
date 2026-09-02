import {
  normalizeProductSearchText,
  productSearchIndexSettings,
  productSearchMapping,
} from './product-search-document';

describe('product search document definition', () => {
  it('normalizes Vietnamese diacritics and đ consistently', () => {
    expect(normalizeProductSearchText('ĐIỆN thoại & phụ kiện')).toBe('dien thoai phu kien');
  });

  it('defines strict, searchable Vietnamese text and numeric commerce fields', () => {
    const mapping = productSearchMapping();
    expect(mapping.dynamic).toBe('strict');
    expect(mapping.properties.name).toMatchObject({
      type: 'text',
      analyzer: 'vietnamese_index',
      search_analyzer: 'vietnamese_search',
      fields: { exact: { type: 'keyword' }, normalized: { type: 'keyword' } },
    });
    expect(mapping.properties.effective_price_minor).toEqual({ type: 'long' });
    expect(mapping.properties.rating_average_basis_points).toEqual({ type: 'integer' });
    expect(mapping.properties.displayable).toEqual({ type: 'boolean' });
  });

  it('pins the explicit đ mapping in both index and search analyzers', () => {
    const settings = productSearchIndexSettings();
    expect(settings.analysis.char_filter.vietnamese_d.mappings).toEqual(['đ => d', 'Đ => D']);
    expect(settings.analysis.analyzer.vietnamese_index.char_filter).toContain('vietnamese_d');
    expect(settings.analysis.analyzer.vietnamese_search.char_filter).toContain('vietnamese_d');
  });
});
