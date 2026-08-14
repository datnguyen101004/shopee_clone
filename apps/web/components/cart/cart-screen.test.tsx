import type { CartResponse } from '@shopee-clone/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthSession } from '../auth-session-provider';
import { useCart } from './cart-provider';
import { CartScreen } from './cart-screen';
import { useCartPricing } from './use-cart-pricing';

vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('./cart-provider', () => ({ useCart: vi.fn() }));
vi.mock('./use-cart-pricing', () => ({ useCartPricing: vi.fn() }));

const shopId = '00000000-0000-4000-8000-000000000010';
const lineId = '00000000-0000-4000-8000-000000000020';
const cart: CartResponse = {
  owner: 'authenticated',
  version: 3,
  groups: [
    {
      shop: { id: shopId, slug: 'sample-shop', name: 'Sample Shop', href: '/shops/sample-shop' },
      eligibleLineCount: 1,
      selectedEligibleLineCount: 1,
      lines: [
        {
          id: lineId,
          product: {
            id: '00000000-0000-4000-8000-000000000030',
            name: 'Sample product',
            href: '/products/00000000-0000-4000-8000-000000000030',
            imageUrl: null,
            imageAlt: 'Sample product',
          },
          variant: { id: '00000000-0000-4000-8000-000000000040', name: 'Black' },
          unitPriceMinor: 100_000,
          previousUnitPriceMinor: null,
          availableQuantity: 10,
          maxPurchaseQuantity: 10,
          quantity: 2,
          selected: true,
          effectivelySelected: true,
          eligible: true,
          lineSubtotalMinor: 200_000,
          issues: [],
        },
      ],
    },
  ],
  summary: {
    distinctLineCount: 1,
    selectedValidLineCount: 1,
    selectedValidQuantity: 2,
    selectedMerchandiseSubtotalMinor: 200_000,
  },
};

describe('multi-shop cart screen', () => {
  const selectLine = vi.fn();
  const selectShop = vi.fn();
  const selectAll = vi.fn();
  const updateQuantity = vi.fn();
  const removeItem = vi.fn();
  const refresh = vi.fn();
  let cartContext: ReturnType<typeof useCart>;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const callback of [selectLine, selectShop, selectAll, updateQuantity, removeItem]) {
      callback.mockResolvedValue({ cart, adjustments: [] });
    }
    vi.mocked(useAuthSession).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'buyer@example.test',
          displayName: 'Buyer',
          status: 'active',
          roles: ['buyer'],
        },
      },
    } as ReturnType<typeof useAuthSession>);
    cartContext = {
      state: { status: 'ready', cart },
      pending: false,
      message: '',
      refresh,
      addItem: vi.fn(),
      updateQuantity,
      removeItem,
      selectLine,
      selectShop,
      selectAll,
    };
    vi.mocked(useCart).mockReturnValue(cartContext);
    vi.mocked(useCartPricing).mockReturnValue({
      status: 'ready',
      addresses: [
        {
          id: '00000000-0000-4000-8000-000000000050',
          recipientName: 'Buyer',
          phoneNumber: '0900000000',
          province: 'Thành phố Hồ Chí Minh',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          addressLine: '1 Nguyễn Huệ',
          label: 'Nhà riêng',
          isDefault: true,
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
      ],
      selectedAddressId: '00000000-0000-4000-8000-000000000050',
      services: { [shopId]: 'STANDARD' },
      vouchers: {},
      quote: {
        pricingVersion: 'pricing-v2',
        voucherVersion: 'voucher-v1',
        shippingVersion: 'mock-v1',
        currency: 'VND',
        evaluatedAt: '2026-08-14T00:00:00.000Z',
        cartVersion: 3,
        address: {
          id: '00000000-0000-4000-8000-000000000050',
          province: 'Thành phố Hồ Chí Minh',
          district: 'Quận 1',
        },
        shops: [
          {
            shop: { id: shopId, slug: 'sample-shop', name: 'Sample Shop' },
            lines: [
              {
                lineId,
                productId: '00000000-0000-4000-8000-000000000030',
                variantId: '00000000-0000-4000-8000-000000000040',
                quantity: 2,
                unitWeightGrams: 250,
                shipmentWeightGrams: 500,
                listUnitPriceMinor: 120_000,
                sellingUnitPriceMinor: 100_000,
                listSubtotalMinor: 240_000,
                productDiscountMinor: 40_000,
                merchandiseSubtotalMinor: 200_000,
                shopVoucherDiscountMinor: 0,
                platformVoucherDiscountMinor: 0,
                merchandiseVoucherDiscountMinor: 0,
                payableMerchandiseMinor: 200_000,
              },
            ],
            shipping: {
              provider: 'MOCK',
              version: 'mock-v1',
              shopId,
              originProvince: 'Thành phố Hồ Chí Minh',
              destinationProvince: 'Thành phố Hồ Chí Minh',
              zone: 'SAME_PROVINCE',
              shipmentWeightGrams: 500,
              service: 'STANDARD',
              estimatedDaysMin: 2,
              estimatedDaysMax: 4,
              baseFeeMinor: 22_000,
              zoneSurchargeMinor: 0,
              weightSurchargeMinor: 0,
              shippingFeeMinor: 22_000,
            },
            listSubtotalMinor: 240_000,
            productDiscountMinor: 40_000,
            merchandiseSubtotalMinor: 200_000,
            shopVoucherDiscountMinor: 0,
            platformVoucherDiscountMinor: 0,
            merchandiseVoucherDiscountMinor: 0,
            shippingVoucherDiscountMinor: 0,
            voucherDiscountMinor: 0,
            shippingPayableMinor: 22_000,
            payableTotalMinor: 222_000,
          },
        ],
        vouchers: [],
        exclusions: [],
        summary: {
          selectedLineCount: 1,
          selectedQuantity: 2,
          listSubtotalMinor: 240_000,
          productDiscountMinor: 40_000,
          merchandiseSubtotalMinor: 200_000,
          shippingTotalMinor: 22_000,
          shopVoucherDiscountMinor: 0,
          platformVoucherDiscountMinor: 0,
          merchandiseVoucherDiscountMinor: 0,
          shippingVoucherDiscountMinor: 0,
          voucherDiscountMinor: 0,
          shippingPayableMinor: 22_000,
          payableTotalMinor: 222_000,
        },
      },
      message: 'Bảng giá đã xác nhận.',
      setAddress: vi.fn(),
      setService: vi.fn(),
      setPlatformVoucher: vi.fn(),
      setShopVoucher: vi.fn(),
      setFreeShippingVoucher: vi.fn(),
      retry: vi.fn(),
    });
  });

  it('groups lines by shop and exposes confirmed authenticated totals', () => {
    render(<CartScreen />);
    expect(screen.getByRole('heading', { name: 'Giỏ hàng của bạn' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Sample Shop' })).toHaveAttribute(
      'href',
      '/shops/sample-shop',
    );
    expect(screen.getByText('200.000₫')).toBeVisible();
    expect(screen.getByText('222.000₫')).toBeVisible();
    expect(screen.getByText(/Giảm 40.000₫/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mua hàng' })).toBeEnabled();
  });

  it('wires line quantity, selection and removal controls to authoritative actions', async () => {
    const user = userEvent.setup();
    render(<CartScreen />);
    await user.click(screen.getByRole('button', { name: 'Tăng số lượng Sample product' }));
    expect(updateQuantity).toHaveBeenCalledWith(lineId, 3);
    const quantity = screen.getByRole('textbox', { name: 'Nhập số lượng Sample product' });
    await user.clear(quantity);
    await user.type(quantity, '99');
    await user.tab();
    expect(updateQuantity).toHaveBeenCalledWith(lineId, 99);
    expect(quantity).toHaveValue('2');
    await user.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(removeItem).toHaveBeenCalledWith(lineId);
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]!);
    expect(selectLine).toHaveBeenCalledWith(lineId, false);
  });

  it('keeps a recoverable failure actionable without hiding the confirmed cart', async () => {
    const user = userEvent.setup();
    vi.mocked(useCart).mockReturnValue({
      ...cartContext,
      state: { status: 'error', cart },
      message: 'Không thể tải giỏ hàng.',
      refresh,
    });
    render(<CartScreen />);
    expect(screen.getByText('Sample product')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('places the missing-address handoff after the product groups', () => {
    const currentPricing = vi.mocked(useCartPricing)(cart, refresh);
    vi.mocked(useCartPricing).mockReturnValue({
      ...currentPricing,
      status: 'missing-address',
      addresses: [],
      selectedAddressId: '',
      quote: null,
      message: 'Hãy thêm địa chỉ nhận hàng để xem phí vận chuyển và tổng thanh toán.',
    });
    render(<CartScreen />);

    const product = screen.getByRole('link', { name: 'Sample product' });
    const missingAddress = screen
      .getByRole('heading', { name: 'Cần địa chỉ nhận hàng' })
      .closest('section');
    const summary = screen.getByRole('complementary', { name: 'Tổng kết giỏ hàng' });
    expect(missingAddress).not.toBeNull();
    expect(product.compareDocumentPosition(missingAddress!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(missingAddress!.compareDocumentPosition(summary)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('requires login before exposing private cart state', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'guest', user: null },
    } as ReturnType<typeof useAuthSession>);
    vi.mocked(useCart).mockReturnValue({
      ...cartContext,
      state: { status: 'unauthenticated', cart: null },
    });
    render(<CartScreen />);
    expect(screen.getByRole('heading', { name: 'Đăng nhập để sử dụng giỏ hàng' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fcart',
    );
    expect(screen.queryByText('Sample product')).toBeNull();
  });
});
