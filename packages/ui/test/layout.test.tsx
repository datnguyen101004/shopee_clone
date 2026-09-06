import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  PageShell,
  ProductCard,
  SectionHeader,
  SellerShell,
  StorefrontContainer,
  StorefrontSection,
} from '../src';

describe('PageShell', () => {
  it('renders only supplied landmarks and makes skip navigation first', async () => {
    const { container } = render(
      <PageShell>
        <h1>Marketplace</h1>
      </PageShell>,
    );
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('header')).not.toBeInTheDocument();
    expect(container.querySelector('nav')).not.toBeInTheDocument();
    expect(container.querySelector('footer')).not.toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Bỏ qua đến nội dung chính' })).toHaveFocus();
  });

  it('renders storefront layout primitives with consistent structure', () => {
    const { container } = render(
      <StorefrontContainer>
        <StorefrontSection>
          <SectionHeader
            title="Gợi ý hôm nay"
            subtitle="Dành riêng cho bạn"
            action={<a href="/all">Xem tất cả</a>}
          />
          <ProductCard
            image={<img src="/p1.jpg" alt="Áo thun" />}
            name="Áo thun Shopee Clone Cotton"
            price="₫120.000"
            compareAtPrice="₫150.000"
            discountPercent={20}
            soldCount="Đã bán 1,2k"
            href="/products/p1"
          />
        </StorefrontSection>
      </StorefrontContainer>,
    );

    expect(container.querySelector('.sc-storefront-container')).toBeInTheDocument();
    expect(container.querySelector('.sc-storefront-section')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Gợi ý hôm nay' })).toBeInTheDocument();
    expect(screen.getByText('Dành riêng cho bạn')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem tất cả' })).toBeInTheDocument();
    expect(screen.getByText('Áo thun Shopee Clone Cotton')).toBeInTheDocument();
    expect(screen.getByText('₫120.000')).toBeInTheDocument();
    expect(screen.getByText('Đã bán 1,2k')).toBeInTheDocument();
  });

  it('renders product card with custom link, heading level, and deal slots', () => {
    const CustomLink = ({ href, children, ...rest }: any) => (
      <a href={href} data-custom="true" {...rest}>
        {children}
      </a>
    );

    render(
      <ProductCard
        data-testid="test-product-card"
        image={<img src="/p2.jpg" alt="Tai nghe" />}
        name="Tai nghe không dây"
        titleHeadingLevel="h2"
        price="₫350.000"
        compareAtPrice="₫500.000"
        discountPercent={30}
        bestPriceBadge={<span>Voucher giảm 50k</span>}
        scheduledDeal={<span>Giảm sốc 30%</span>}
        soldCount="Đã bán 500"
        rating={<span>★ 4.9</span>}
        location="Hà Nội"
        shopName="Shop Công Nghệ"
        href="/products/p2"
        linkComponent={CustomLink}
        linkAriaLabel="Xem Tai nghe không dây"
      />,
    );

    expect(screen.getByTestId('test-product-card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Tai nghe không dây' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Xem Tai nghe không dây' });
    expect(link).toHaveAttribute('data-custom', 'true');
    expect(link).toHaveAttribute('href', '/products/p2');
    expect(screen.getByText('-30%')).toBeInTheDocument();
    expect(screen.getByText('Voucher giảm 50k')).toBeInTheDocument();
    expect(screen.getByText('Giảm sốc 30%')).toBeInTheDocument();
    expect(screen.getByText('★ 4.9')).toBeInTheDocument();
    expect(screen.getByText('Hà Nội')).toBeInTheDocument();
    expect(screen.getByText('Shop Công Nghệ')).toBeInTheDocument();
  });

  it('renders seller shell with compact density', () => {
    const { container } = render(
      <SellerShell
        sidebar={<div>Sidebar menu</div>}
        header={<div>Shop Admin</div>}
      >
        <div>Order list</div>
      </SellerShell>,
    );

    const shell = container.querySelector('.sc-seller-shell');
    expect(shell).toBeInTheDocument();
    expect(shell).toHaveAttribute('data-density', 'compact');
    expect(screen.getByText('Sidebar menu')).toBeInTheDocument();
    expect(screen.getByText('Shop Admin')).toBeInTheDocument();
    expect(screen.getByText('Order list')).toBeInTheDocument();
  });
});
