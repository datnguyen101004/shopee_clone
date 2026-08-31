import type { ProductDetailResponse } from '@shopee-clone/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductDetailExperience } from './product-detail-experience';
import {
  initialProductDetailSelection,
  productLoginHandoff,
  quantityError,
  selectProductVariant,
} from './product-detail-interactions';

const { push, addItem, authSession, cartSession } = vi.hoisted(() => {
  const addItemFn = vi.fn();
  return {
    push: vi.fn(),
    addItem: addItemFn,
    authSession: {
      state: {
        state: { status: 'guest' as 'guest' | 'authenticated' | 'loading' },
        authenticatedFetch: vi.fn(),
      },
    },
    cartSession: {
      state: {
        state: { status: 'unauthenticated' as 'unauthenticated' | 'ready' | 'loading', cart: null },
        pending: false,
        message: '',
        refresh: vi.fn(),
        addItem: addItemFn,
        updateQuantity: vi.fn(),
        removeItem: vi.fn(),
        selectLine: vi.fn(),
        selectShop: vi.fn(),
        selectAll: vi.fn(),
      },
    },
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../auth-session-provider', () => ({
  useAuthSession: () => authSession.state,
}));
vi.mock('../cart/cart-provider', () => ({
  useCart: () => cartSession.state,
}));
vi.mock('../engagement/favorite-state-provider', () => ({
  FavoriteStateProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('../engagement/favorite-button', () => ({ FavoriteButton: () => null }));
vi.mock('../engagement/recently-viewed-recorder', () => ({ RecentlyViewedRecorder: () => null }));
vi.mock('./product-reviews', () => ({ ProductReviews: () => null }));

const product: ProductDetailResponse = {
  id: '00000000-0000-4000-8000-000000000301',
  name: 'Phone',
  description: 'Detail',
  category: { slug: 'phones', name: 'Phones' },
  ratingAverageBasisPoints: 490,
  ratingCount: 12,
  soldCount: 20,
  gallery: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      url: '/phone.jpg',
      altText: 'Phone',
      sortOrder: 0,
      variantId: null,
      isPrimary: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      url: '/phone-black.jpg',
      altText: 'Black phone',
      sortOrder: 1,
      variantId: '00000000-0000-4000-8000-000000000401',
      isPrimary: false,
    },
  ],
  variants: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      name: 'Black',
      sku: 'PHONE-BLK',
      priceMinor: 1000,
      availableQuantity: 2,
      availability: 'in-stock',
      preferredImageId: '00000000-0000-4000-8000-000000000502',
    },
    {
      id: '00000000-0000-4000-8000-000000000402',
      name: 'Silver',
      sku: 'PHONE-SLV',
      priceMinor: 1100,
      availableQuantity: 0,
      availability: 'unavailable',
      preferredImageId: '00000000-0000-4000-8000-000000000501',
    },
  ],
  purchasable: true,
  initialVariantId: '00000000-0000-4000-8000-000000000401',
  shop: {
    id: '00000000-0000-4000-8000-000000000101',
    ownerUserId: '00000000-0000-4000-8000-000000000201',
    slug: 'store',
    name: 'Store',
    location: 'Hà Nội',
    activeProductCount: 2,
  },
  shippingPreview: {
    origin: 'Hà Nội',
    destinationLabel: 'Toàn quốc',
    feeMinor: null,
    deliveryTimeLabel: null,
    message: 'Xác nhận sau.',
  },
  relatedProducts: [],
};

function authenticatedState(id = '00000000-0000-4000-8000-000000000999') {
  return {
    status: 'authenticated' as const,
    user: {
      id,
      email: 'buyer@example.test',
      displayName: 'Buyer',
      status: 'active' as const,
      roles: ['buyer' as const],
    },
  };
}

describe('product detail interactions', () => {
  beforeEach(() => {
    push.mockReset();
    addItem.mockReset();
    authSession.state.authenticatedFetch.mockReset();
    authSession.state.authenticatedFetch.mockResolvedValue(new Response(null, { status: 503 }));
    authSession.state.state = { status: 'guest' };
    cartSession.state.state = { status: 'unauthenticated', cart: null };
    cartSession.state.pending = false;
  });

  it('initializes deterministically, switches media, resets invalid quantity, and serializes only trusted handoffs', () => {
    const initial = initialProductDetailSelection(product);
    expect(initial).toEqual({
      variantId: product.variants[0]!.id,
      activeImageId: product.gallery[1]!.id,
      quantity: '1',
    });
    expect(
      selectProductVariant(product, { ...initial, quantity: '2' }, product.variants[1]!.id)
        .quantity,
    ).toBe('1');
    expect(quantityError('3', product.variants[0]!)).toContain('tối đa');
    expect(productLoginHandoff(product, product.variants[0]!.id, '2', 'buy-now')).toBe(
      `/login?intent=buy-now&returnTo=%2Fproducts%2F${product.id}&productId=${product.id}&variantId=${product.variants[0]!.id}&quantity=2`,
    );
  });
  it('labels unavailable selections and disables purchase while retaining gallery controls', async () => {
    const user = userEvent.setup();
    render(<ProductDetailExperience product={product} />);
    expect(screen.getByRole('link', { name: 'Thêm vào giỏ · Đăng nhập' })).toHaveAttribute(
      'href',
      expect.stringContaining('/login?intent=add-to-cart'),
    );
    await user.click(screen.getByRole('button', { name: /Silver/ }));
    expect(screen.getByText('SKU')).toBeVisible();
    expect(
      screen
        .getAllByRole('button', { name: /Đang kiểm tra đăng nhập|Mua ngay/ })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Xem Phone' }));
    expect(screen.getByRole('img', { name: 'Phone' })).toBeVisible();
  });

  it('renders an active scheduled price and the stored-price fallback after variant selection', async () => {
    const user = userEvent.setup();
    const scheduledProduct: ProductDetailResponse = {
      ...product,
      variants: [
        {
          ...product.variants[0]!,
          priceMinor: 800,
          compareAtPriceMinor: 1_000,
          discountPercent: 20,
          scheduledPrice: {
            basePriceMinor: 1_000,
            effectivePriceMinor: 800,
            compareAtPriceMinor: 1_000,
            discountBasisPoints: 2_000,
            campaignId: 'campaign-1',
            evaluatedAt: '2026-08-31T00:00:00.000Z',
          },
        },
        { ...product.variants[1]!, availableQuantity: 1, availability: 'in-stock' },
      ],
    };

    render(<ProductDetailExperience product={scheduledProduct} />);
    expect(screen.getByText('₫800')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Silver/ }));
    expect(screen.getByText('₫1.100')).toBeVisible();
  });

  it('renders buyer merchandise and address-aware shipping previews separately', () => {
    const previewProduct: ProductDetailResponse = {
      ...product,
      variants: [
        {
          ...product.variants[0]!,
          buyerBestPrice: {
            version: 'buyer-best-price-v1',
            quantity: 1,
            currency: 'VND',
            evaluatedAt: '2026-08-31T04:00:00.000Z',
            effectivePriceMinor: 1_000,
            shopVoucher: {
              code: 'SHOP100',
              name: 'Shop giảm 100',
              slot: 'SHOP',
              discountMinor: 100,
            },
            platformVoucher: null,
            shopVoucherDiscountMinor: 100,
            platformVoucherDiscountMinor: 0,
            merchandiseDiscountMinor: 100,
            merchandisePayableMinor: 900,
            shipping: {
              service: 'STANDARD',
              shippingFeeMinor: 22_000,
              voucher: {
                code: 'FREESHIP10K',
                name: 'Freeship 10K',
                slot: 'FREE_SHIPPING',
                discountMinor: 10_000,
              },
              shippingVoucherDiscountMinor: 10_000,
              shippingPayableMinor: 12_000,
              estimatedPayableMinor: 12_900,
            },
          },
        },
        product.variants[1]!,
      ],
    };
    render(<ProductDetailExperience product={previewProduct} />);
    expect(screen.getByText('₫900')).toBeVisible();
    expect(screen.getByText(/Giá tốt nhất dự kiến cho 1 sản phẩm/)).toBeVisible();
    expect(screen.getByText(/Phí giao STANDARD dự kiến: ₫12\.000/)).toBeVisible();
  });

  it('adds the selected variant then navigates to cart when buying now while authenticated', async () => {
    const user = userEvent.setup();
    authSession.state.state = authenticatedState();
    cartSession.state.state = { status: 'ready', cart: null };
    addItem.mockResolvedValue({ adjustments: [] });
    render(<ProductDetailExperience product={product} />);
    await user.click(screen.getByRole('button', { name: 'Mua ngay' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledWith(product.variants[0]!.id, 1));
    expect(push).toHaveBeenCalledWith('/cart');
  });

  it('warns a seller and performs no cart mutation for own-shop purchase actions', async () => {
    const user = userEvent.setup();
    authSession.state.state = authenticatedState(product.shop.ownerUserId);
    cartSession.state.state = { status: 'ready', cart: null };
    render(<ProductDetailExperience product={product} />);

    await user.click(screen.getByRole('button', { name: 'Thêm vào giỏ hàng' }));
    expect(
      screen.getByRole('alertdialog', { name: 'Không thể mua sản phẩm này' }),
    ).toHaveTextContent('Bạn không thể mua sản phẩm từ cửa hàng của chính mình.');
    expect(addItem).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Đã hiểu' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mua ngay' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(addItem).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
