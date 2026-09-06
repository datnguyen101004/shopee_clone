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

  it('renders active scheduled and base fallback prices', () => {
    const productModule = {
      ...modules[2]!,
      products: [
        {
          ...product,
          priceMinor: 103200,
          scheduledPrice: {
            basePriceMinor: 129000,
            effectivePriceMinor: 103200,
            compareAtPriceMinor: 159000,
            discountBasisPoints: 2000,
            campaignId: 'campaign-1',
            evaluatedAt: '2026-08-31T00:00:00.000Z',
          },
        },
        { ...product, id: 'product-2', href: '/products/product-2' },
      ],
    } as HomepageModule;

    render(<HomepageModules modules={[productModule]} />);
    expect(screen.getByText('₫103.200')).toBeVisible();
    expect(screen.getByText('₫129.000')).toBeVisible();
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

  it('only applies decorative media overlays when a product image is missing', () => {
    const productModule = {
      ...modules[2]!,
      products: [
        product,
        {
          ...product,
          id: 'product-2',
          name: 'Sản phẩm có ảnh',
          href: '/products/product-2',
          imageUrl: '/media/products/product-placeholder.svg',
          imageAlt: 'Ảnh sản phẩm có ảnh',
        },
      ],
    } as HomepageModule;

    render(<HomepageModules modules={[productModule]} />);

    expect(screen.getByRole('img', { name: 'Ảnh Tai nghe' }).parentElement).toHaveClass(
      'product-card__image--fallback',
    );
    expect(screen.getByRole('img', { name: 'Ảnh sản phẩm có ảnh' }).parentElement).not.toHaveClass(
      'product-card__image--fallback',
    );
  });

  it('unifies layout composition with StorefrontContainer, StorefrontSection, and SectionHeader', () => {
    const { container } = render(<HomepageModules modules={modules} />);

    // Container
    const flowContainer = container.querySelector('.sc-storefront-container.home-flow');
    expect(flowContainer).toBeInTheDocument();

    // Sections
    const sections = container.querySelectorAll('.sc-storefront-section');
    expect(sections).toHaveLength(6);

    // Section headers
    const sectionHeaders = container.querySelectorAll('.sc-section-header');
    expect(sectionHeaders).toHaveLength(5); // categories, flash-sale, top-selling, mall, daily-recommendations

    // Check accessibility binding between section and heading id
    sections.forEach((sec) => {
      const labelledBy = sec.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(container.querySelector(`#${labelledBy}`)).toBeInTheDocument();
    });

    // Check flash badge inside flash-sale section header
    const flashSection = container.querySelector('[data-module-type="flash-sale"]');
    expect(flashSection).toBeInTheDocument();
    expect(flashSection?.querySelector('.homepage-section-title--flash')).toBeInTheDocument();
    expect(flashSection?.textContent).toContain('FLASH');
  });
});
