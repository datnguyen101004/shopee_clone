import type {
  CartResponse,
  CheckoutPreviewResponse,
  PurchaseResult,
} from '@shopee-clone/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmCodCheckout, getCheckoutPurchase } from '../../lib/checkout-api';
import { useAuthSession } from '../auth-session-provider';
import { useCart } from '../cart/cart-provider';
import { CheckoutScreen } from './checkout-screen';
import { PurchaseSuccessScreen } from './purchase-success-screen';
import { useCheckoutPreview } from './use-checkout-preview';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../../lib/checkout-api', () => ({
  CheckoutApiError: class extends Error {},
  confirmCodCheckout: vi.fn(),
  getCheckoutPurchase: vi.fn(),
}));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('../cart/cart-provider', () => ({ useCart: vi.fn() }));
vi.mock('./use-checkout-preview', () => ({ useCheckoutPreview: vi.fn() }));

const buyerId = '00000000-0000-4000-8000-000000000001';
const addressId = '00000000-0000-4000-8000-000000000002';
const shopId = '00000000-0000-4000-8000-000000000003';
const lineId = '00000000-0000-4000-8000-000000000004';
const productId = '00000000-0000-4000-8000-000000000005';
const variantId = '00000000-0000-4000-8000-000000000006';
const purchaseReference = '00000000-0000-4000-8000-000000000007';
const orderReference = '00000000-0000-4000-8000-000000000008';
const fingerprint = 'a'.repeat(64);
const summary = {
  selectedLineCount: 1,
  selectedQuantity: 1,
  listSubtotalMinor: 100_000,
  productDiscountMinor: 0,
  merchandiseSubtotalMinor: 100_000,
  shippingTotalMinor: 22_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 22_000,
  payableTotalMinor: 122_000,
};
const address = {
  id: addressId,
  recipientName: 'Nguyễn Văn A',
  phoneNumber: '0900000000',
  province: 'Hà Nội',
  district: 'Ba Đình',
  ward: 'Phúc Xá',
  addressLine: '1 Hồng Hà',
  label: 'Nhà',
};
const line = {
  lineId,
  productId,
  variantId,
  quantity: 1,
  unitWeightGrams: 500,
  shipmentWeightGrams: 500,
  listUnitPriceMinor: 100_000,
  sellingUnitPriceMinor: 100_000,
  listSubtotalMinor: 100_000,
  productDiscountMinor: 0,
  merchandiseSubtotalMinor: 100_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  payableMerchandiseMinor: 100_000,
  productName: 'Sản phẩm test',
  productImageUrl: null,
  variantName: 'Mặc định',
  variantSku: 'SKU',
};
const shop = {
  shop: { id: shopId, ownerUserId: '00000000-0000-4000-8000-000000000101', slug: 'shop-test', name: 'Shop Test' },
  note: '',
  lines: [line],
  shipping: {
    provider: 'MOCK' as const,
    version: 'mock-v1' as const,
    shopId,
    originProvince: 'Hà Nội',
    destinationProvince: 'Hà Nội',
    zone: 'SAME_PROVINCE' as const,
    shipmentWeightGrams: 500,
    service: 'STANDARD' as const,
    estimatedDaysMin: 2,
    estimatedDaysMax: 4,
    baseFeeMinor: 22_000,
    zoneSurchargeMinor: 0,
    weightSurchargeMinor: 0,
    shippingFeeMinor: 22_000,
  },
  listSubtotalMinor: 100_000,
  productDiscountMinor: 0,
  merchandiseSubtotalMinor: 100_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 22_000,
  payableTotalMinor: 122_000,
};
const preview: CheckoutPreviewResponse = {
  checkoutVersion: 'checkout-v1',
  pricingVersion: 'pricing-v2',
  voucherVersion: 'voucher-v1',
  shippingVersion: 'mock-v1',
  currency: 'VND',
  evaluatedAt: '2026-08-14T05:00:00.000Z',
  cartVersion: 2,
  ready: true,
  checkoutFingerprint: fingerprint,
  address,
  shops: [shop],
  vouchers: [],
  exclusions: [],
  blockers: [],
  summary,
};
const purchase: PurchaseResult = {
  checkoutVersion: 'checkout-v1',
  pricingVersion: 'pricing-v2',
  voucherVersion: 'voucher-v1',
  shippingVersion: 'mock-v1',
  currency: 'VND',
  purchaseReference,
  createdAt: '2026-08-14T05:01:00.000Z',
  sourceCartVersion: 2,
  paymentMethod: 'COD',
  paymentStatus: 'UNPAID',
  address,
  orders: [{ ...shop, orderReference, status: 'PENDING_CONFIRMATION', paymentStatus: 'UNPAID' }],
  vouchers: [],
  summary,
};
const cart = {
  owner: 'authenticated',
  version: 2,
  groups: [
    {
      shop: { id: shopId, slug: 'shop-test', name: 'Shop Test', href: '/shops/shop-test' },
      eligibleLineCount: 1,
      selectedEligibleLineCount: 1,
      lines: [],
    },
  ],
  summary: {
    distinctLineCount: 1,
    selectedValidLineCount: 1,
    selectedValidQuantity: 1,
    selectedMerchandiseSubtotalMinor: 100_000,
  },
} satisfies CartResponse;

describe('checkout screens', () => {
  const refresh = vi.fn().mockResolvedValue(cart);
  const authenticatedFetch = vi.fn();
  let previewState: ReturnType<typeof useCheckoutPreview>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    vi.mocked(useAuthSession).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: buyerId,
          email: 'buyer@example.test',
          displayName: 'Buyer',
          status: 'active',
          roles: ['buyer'],
        },
      },
      authenticatedFetch,
    } as never);
    vi.mocked(useCart).mockReturnValue({
      state: { status: 'ready', cart },
      pending: false,
      message: '',
      refresh,
    } as never);
    previewState = {
      status: 'ready',
      addresses: [
        {
          ...address,
          isDefault: true,
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
      ],
      addressId,
      services: { [shopId]: 'STANDARD' },
      vouchers: {},
      notes: {},
      preview,
      message: 'Đã xác nhận',
      setAddress: vi.fn(),
      setService: vi.fn(),
      setNote: vi.fn(),
      retry: vi.fn(),
      request: { shippingAddressId: addressId, services: [{ shopId, service: 'STANDARD' }] },
    };
    vi.mocked(useCheckoutPreview).mockReturnValue(previewState);
  });

  it('renders authoritative totals and prevents duplicate confirmation clicks', async () => {
    const user = userEvent.setup();
    let resolveConfirmation!: (value: { replayed: boolean; purchase: PurchaseResult }) => void;
    vi.mocked(confirmCodCheckout).mockReturnValue(
      new Promise((resolve) => {
        resolveConfirmation = resolve;
      }),
    );
    render(<CheckoutScreen />);
    expect(screen.getAllByText('122.000₫')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Chat ngay' })).toHaveLength(preview.shops.length);
    const button = screen.getByRole('button', { name: 'Đặt hàng' });
    await user.dblClick(button);
    expect(confirmCodCheckout).toHaveBeenCalledTimes(1);
    resolveConfirmation({ replayed: false, purchase });
    expect(await screen.findByText('Đang tạo đơn hàng COD…')).toBeVisible();
    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/checkout/success/${purchaseReference}`),
    );
  });

  it('renders blockers and keeps confirmation disabled', () => {
    vi.mocked(useCheckoutPreview).mockReturnValue({
      ...previewState,
      status: 'blocked',
      preview: {
        ...preview,
        ready: false,
        checkoutFingerprint: null,
        blockers: [
          {
            code: 'LINE_UNAVAILABLE',
            message: 'Sản phẩm đã hết hàng.',
            shopId,
            lineId,
            voucherCode: null,
          },
        ],
      },
    });
    render(<CheckoutScreen />);
    expect(screen.getByText('Sản phẩm đã hết hàng.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Đặt hàng' })).toBeDisabled();
  });

  it('reloads and displays immutable child-order snapshots on success', async () => {
    vi.mocked(getCheckoutPurchase).mockResolvedValue(purchase);
    render(<PurchaseSuccessScreen purchaseReference={purchaseReference} />);
    expect(await screen.findByRole('heading', { name: 'Cảm ơn bạn đã mua hàng' })).toBeVisible();
    expect(screen.getByText(new RegExp(orderReference))).toBeVisible();
    expect(screen.getAllByText('122.000₫')).toHaveLength(2);
  });
});
