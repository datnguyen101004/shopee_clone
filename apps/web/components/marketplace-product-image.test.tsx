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
});
