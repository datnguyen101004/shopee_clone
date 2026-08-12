import type { HomepageModule } from '@shopee-clone/contracts';
import { render, screen } from '@testing-library/react';

import { HomepageModules } from './homepage-modules';
import { HomepageEmptyState, HomepageErrorState } from './homepage-states';

const product = {
  id: 'product-1',
  name: 'Tai nghe',
  shopName: 'Tech Store',
  href: '/products/product-1',
  imageUrl: null,
  imageAlt: 'Ảnh Tai nghe',
  priceMinor: 129000,
  compareAtPriceMinor: 159000,
  label: 'Mall',
  soldCount: 1200,
};
const modules: HomepageModule[] = [
  {
    id: 'banner',
    key: 'banner',
    type: 'campaign-banner',
    title: 'Chiến dịch',
    sortOrder: 1,
    banners: [
      {
        id: 'b',
        title: 'Siêu hội mua sắm',
        imageUrl: null,
        altText: 'Hộp quà',
        href: '/search?q=sale',
        theme: 'brand',
      },
    ],
  },
  {
    id: 'categories',
    key: 'categories',
    type: 'category-shortcuts',
    title: 'Danh mục',
    sortOrder: 2,
    categories: [
      { id: 'c', label: 'Điện tử', icon: 'device', href: '/search?category=electronics' },
    ],
  },
  ...(['flash-sale', 'top-selling', 'mall', 'daily-recommendations'] as const).map(
    (type, index) => ({
      id: type,
      key: type,
      type,
      title: `Section ${index + 1}`,
      sortOrder: index + 3,
      products: [product],
    }),
  ),
];

describe('HomepageModules', () => {
  it('renders every known module in API order with valid buyer links', () => {
    const { container } = render(<HomepageModules modules={modules} />);
    expect(container.querySelectorAll('[data-module-type]')).toHaveLength(6);
    expect(
      [...container.querySelectorAll('[data-module-type]')].map((node) =>
        node.getAttribute('data-module-type'),
      ),
    ).toEqual(modules.map((module) => module.type));
    expect(screen.getByRole('link', { name: 'Xem danh mục Điện tử' })).toHaveAttribute(
      'href',
      '/search?category=electronics',
    );
    expect(screen.getAllByRole('link', { name: 'Xem Tai nghe' })[0]).toHaveAttribute(
      'href',
      '/products/product-1',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Siêu hội mua sắm' })).toBeInTheDocument();
  });

  it('ignores an unknown module without breaking known siblings', () => {
    render(
      <HomepageModules modules={[modules[1]!, { type: 'future' } as unknown as HomepageModule]} />,
    );
    expect(screen.getByRole('heading', { name: 'Danh mục' })).toBeInTheDocument();
  });

  it('renders accessible missing-media, empty and retry states', () => {
    const { unmount } = render(<HomepageModules modules={[modules[0]!]} />);
    expect(screen.getByRole('img', { name: 'Hộp quà' })).toBeInTheDocument();
    unmount();
    render(<HomepageEmptyState />);
    expect(screen.getByRole('link', { name: 'Khám phá sản phẩm' })).toHaveAttribute(
      'href',
      '/search',
    );
    unmount();
    render(<HomepageErrorState />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thử lại' })).toHaveAttribute('href', '/');
  });
});
