import { describe, expect, it } from 'vitest';

import { marketplaceMediaUrl } from './marketplace-media-url';

describe('marketplaceMediaUrl', () => {
  it('resolves stable managed media references against the API origin', () => {
    expect(marketplaceMediaUrl('/api/v1/product-media/00000000-0000-4000-8000-000000000001')).toBe('http://localhost:3001/api/v1/product-media/00000000-0000-4000-8000-000000000001');
  });

  it('preserves external and local media URLs', () => {
    expect(marketplaceMediaUrl('https://cdn.example.test/image.png')).toBe('https://cdn.example.test/image.png');
    expect(marketplaceMediaUrl('/media/products/product-placeholder.svg')).toBe('/media/products/product-placeholder.svg');
  });
});
