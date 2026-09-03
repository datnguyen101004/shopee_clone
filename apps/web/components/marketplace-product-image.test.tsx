import { fireEvent, render, screen } from '@testing-library/react';

import { MarketplaceProductImage } from './marketplace-product-image';

describe('MarketplaceProductImage', () => {
  it('replaces a failed remote product image with the local placeholder', () => {
    render(
      <MarketplaceProductImage
        src="https://cdn.hstatic.net/missing-product.jpg"
        alt="Sản phẩm thử nghiệm"
        width={320}
        height={320}
      />,
    );
    const image = screen.getByRole('img', { name: 'Sản phẩm thử nghiệm' });
    fireEvent.error(image);
    expect(image.getAttribute('src')).toContain('product-placeholder.svg');
  });

  it('resolves API-relative seller media against the API origin', () => {
    render(
      <MarketplaceProductImage
        src="/api/v1/product-media/00000000-0000-4000-8000-000000000501"
        alt="Ảnh seller"
        width={320}
        height={320}
      />,
    );
    expect(screen.getByRole('img', { name: 'Ảnh seller' })).toHaveAttribute(
      'src',
      'http://localhost:3001/api/v1/product-media/00000000-0000-4000-8000-000000000501',
    );
  });
});
