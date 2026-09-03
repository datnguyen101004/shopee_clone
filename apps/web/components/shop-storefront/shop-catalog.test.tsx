import type { PublicShopCatalogPage } from '@shopee-clone/contracts';
import { render, screen } from '@testing-library/react';

import { ShopCatalog } from './shop-catalog';

const response: PublicShopCatalogPage = {
  shopId: '00000000-0000-4000-8000-000000000101',
  query: { q: 'phone', category: 'electronics', sort: 'price-asc' },
  pagination: { page: 2, pageSize: 1, totalItems: 3, totalPages: 3 },
  categories: [
    { slug: 'electronics', name: 'Thiết bị điện tử', parentSlug: null, productCount: 3 },
  ],
  items: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      name: 'Phone',
      href: '/products/00000000-0000-4000-8000-000000000301',
      imageUrl: null,
      imageAlt: 'Phone',
      priceMinor: 1000,
      ratingAverageBasisPoints: 450,
      ratingCount: 2,
      soldCount: 3,
      shop: { name: 'Demo Shop', location: 'Hà Nội' },
      category: { slug: 'electronics', name: 'Thiết bị điện tử' },
    },
  ],
};

describe('ShopCatalog', () => {
  it('renders scoped controls, canonical cards, and preserved pagination', () => {
    render(
      <ShopCatalog
        shopSlug="demo-shop"
        response={response}
        query={{
          q: 'phone',
          category: 'electronics',
          sort: 'price-asc',
          page: 2,
          pageSize: 1,
        }}
      />,
    );
    expect(screen.getByRole('search', { name: 'Tìm sản phẩm trong shop' })).toHaveAttribute(
      'action',
      '/shops/demo-shop',
    );
    expect(screen.getByRole('searchbox', { name: 'Từ khóa' })).toHaveValue('phone');
    expect(screen.getByRole('combobox', { name: 'Danh mục' })).toHaveValue('electronics');
    expect(screen.queryByRole('button', { name: 'Đăng nhập để thêm vào yêu thích' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Trang sau')).toHaveAttribute(
      'href',
      '/shops/demo-shop?q=phone&category=electronics&sort=price-asc&page=3&pageSize=1',
    );
  });
});
