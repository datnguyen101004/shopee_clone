import type { BuyerOrderDetailResponse, BuyerOrderSummary } from '@shopee-clone/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { cancelBuyerOrder, getBuyerOrderDetail, getBuyerOrders } from '../../lib/order-history-api';
import { createProductReview } from '../../lib/reviews-api';
import { useAuthSession } from '../auth-session-provider';
import { BuyerOrderDetailScreen, BuyerOrderListScreen } from './buyer-order-history';

vi.mock('../../lib/order-history-api', () => ({
  OrderHistoryApiError: class OrderHistoryApiError extends Error {},
  getBuyerOrders: vi.fn(),
  getBuyerOrderDetail: vi.fn(),
  cancelBuyerOrder: vi.fn(),
}));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('../../lib/reviews-api', () => ({
  ReviewsApiError: class ReviewsApiError extends Error {},
  createProductReview: vi.fn(),
  getAuthorProductReview: vi.fn(),
  stageReviewMedia: vi.fn(),
  updateProductReview: vi.fn(),
}));

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const order: BuyerOrderSummary = {
  orderReference: id('1'),
  purchaseReference: id('2'),
  status: 'PENDING_CONFIRMATION',
  paymentStatus: 'UNPAID',
  version: 0,
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
  shop: { id: id('3'), slug: 'space-t', name: 'Space T' },
  note: '',
  lines: [
    {
      lineId: id('4'),
      productId: id('5'),
      variantId: id('6'),
      quantity: 1,
      unitWeightGrams: 100,
      shipmentWeightGrams: 100,
      listUnitPriceMinor: 100_000,
      sellingUnitPriceMinor: 100_000,
      listSubtotalMinor: 100_000,
      productDiscountMinor: 0,
      merchandiseSubtotalMinor: 100_000,
      shopVoucherDiscountMinor: 0,
      platformVoucherDiscountMinor: 0,
      merchandiseVoucherDiscountMinor: 0,
      payableMerchandiseMinor: 100_000,
    productName: 'Ghế công thái học',
    productImageUrl: null,
    productAvailable: true,
      variantName: 'Đen',
      variantSku: 'CHAIR-BLACK',
    },
  ],
  shipping: {
    provider: 'MOCK',
    version: 'mock-v1',
    shopId: id('3'),
    originProvince: 'Hà Nội',
    destinationProvince: 'Thành phố Hồ Chí Minh',
    zone: 'CROSS_REGION',
    shipmentWeightGrams: 100,
    service: 'STANDARD',
    estimatedDaysMin: 2,
    estimatedDaysMax: 4,
    baseFeeMinor: 20_000,
    zoneSurchargeMinor: 0,
    weightSurchargeMinor: 0,
    shippingFeeMinor: 20_000,
  },
  listSubtotalMinor: 100_000,
  productDiscountMinor: 0,
  merchandiseSubtotalMinor: 100_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 20_000,
  payableTotalMinor: 120_000,
  cancellation: {
    allowed: true,
    reasonCodes: [
      'CHANGE_ADDRESS',
      'CHANGE_PRODUCT',
      'FOUND_BETTER_PRICE',
      'NO_LONGER_NEEDED',
      'OTHER',
    ],
  },
};

const detail: BuyerOrderDetailResponse = {
  orderHistoryVersion: 'order-history-v1',
  currency: 'VND',
  order,
  address: {
    id: id('7'),
    recipientName: 'Buyer',
    phoneNumber: '0900000000',
    province: 'Hồ Chí Minh',
    district: 'Quận 1',
    ward: 'Bến Nghé',
    addressLine: '1 Nguyễn Huệ',
    label: null,
  },
  vouchers: [],
  timeline: [
    {
      id: id('8'),
      previousStatus: null,
      status: 'PENDING_CONFIRMATION',
      orderVersion: 0,
      actorType: 'SYSTEM',
      actorUserId: null,
      reasonCode: 'ORDER_CREATED',
      reasonNote: null,
      occurredAt: '2026-08-14T00:00:00.000Z',
    },
  ],
};

describe('buyer order-history screens', () => {
  const authenticatedFetch = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: id('9'),
          email: 'buyer@test.local',
          displayName: 'Buyer',
          status: 'active',
          roles: ['buyer'],
        },
      },
      authenticatedFetch,
      sessionFetch: vi.fn(),
      synchronizeDisplayName: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      restore: vi.fn(),
      completeGoogleSignIn: vi.fn(),
    });
  });

  it('loads order cards for a deep-linkable status tab', async () => {
    vi.mocked(getBuyerOrders).mockResolvedValue({
      orderHistoryVersion: 'order-history-v1',
      items: [order],
      page: { limit: 20, nextCursor: null },
    });
    render(<BuyerOrderListScreen filter="PENDING_CONFIRMATION" />);
    expect(await screen.findByText('Ghế công thái học')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chờ xác nhận' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute(
      'href',
      `/account/orders/${order.orderReference}`,
    );
  });

  it('keeps a deleted historical product link and explains that the product is unavailable', async () => {
    vi.mocked(getBuyerOrders).mockResolvedValue({
      orderHistoryVersion: 'order-history-v1',
      items: [{
        ...order,
        lines: [{ ...order.lines[0]!, productAvailable: false }],
      }],
      page: { limit: 20, nextCursor: null },
    });

    render(<BuyerOrderListScreen filter="PENDING_CONFIRMATION" />);

    const productLink = await screen.findByRole('link', { name: 'Ghế công thái học (sản phẩm đã bị xóa)' });
    expect(productLink).toHaveAttribute('href', `/products/${order.lines[0]!.productId}`);
    expect(screen.getByText(/Sản phẩm đã bị xóa/)).toBeInTheDocument();
  });

  it('shows timeline and prevents a second cancellation submit', async () => {
    vi.mocked(getBuyerOrderDetail).mockResolvedValue(detail);
    let resolveCancel!: (value: BuyerOrderDetailResponse) => void;
    vi.mocked(cancelBuyerOrder).mockReturnValue(
      new Promise((resolve) => {
        resolveCancel = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<BuyerOrderDetailScreen orderReference={order.orderReference} />);
    expect(await screen.findByText('Hành trình đơn hàng')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hủy đơn hàng' }));
    const confirm = screen.getByRole('button', { name: 'Xác nhận hủy' });
    await user.click(confirm);
    expect(cancelBuyerOrder).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Đang hủy…' })).toBeDisabled();
    resolveCancel({
      ...detail,
      order: {
        ...order,
        status: 'CANCELLED',
        version: 1,
        cancellation: { allowed: false, reasonCodes: [] },
      },
      timeline: [
        ...detail.timeline,
        {
          id: id('10'),
          previousStatus: 'PENDING_CONFIRMATION',
          status: 'CANCELLED',
          orderVersion: 1,
          actorType: 'BUYER',
          actorUserId: id('9'),
          reasonCode: 'CHANGE_ADDRESS',
          reasonNote: null,
          occurredAt: '2026-08-14T00:01:00.000Z',
        },
      ],
    });
    await waitFor(() => expect(screen.getByText('Đơn hàng đã được hủy.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Hủy đơn hàng' })).not.toBeInTheDocument();
  });

  it('only exposes a review action for an eligible delivered line and preserves a stable create flow', async () => {
    const delivered = {
      ...detail,
      order: {
        ...order,
        status: 'DELIVERED' as const,
        cancellation: { allowed: false, reasonCodes: [] },
        lines: [{ ...order.lines[0]!, review: { state: 'ELIGIBLE' as const, reviewId: null } }],
      },
    };
    vi.mocked(getBuyerOrderDetail).mockResolvedValue(delivered);
    vi.mocked(createProductReview).mockResolvedValue({
      review: { id: id('11'), orderLineId: id('4'), rating: 5, text: 'Tốt', authorName: 'Buyer', verifiedPurchase: true, media: [], updatedAt: '2026-08-15T00:00:00.000Z', visibility: 'VISIBLE', version: 0 },
      etag: '"review-0"',
    });
    const user = userEvent.setup();
    render(<BuyerOrderDetailScreen orderReference={order.orderReference} />);
    await user.click(await screen.findByRole('button', { name: 'Đánh giá' }));
    expect(screen.getByRole('dialog', { name: 'Đánh giá sản phẩm' })).toBeInTheDocument();
    expect(screen.getByText('Tuyệt vời')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Đúng với mô tả:'), 'Tốt');
    expect(screen.getByText('3/1000')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hoàn thành' }));
    await waitFor(() => expect(createProductReview).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Đánh giá đã được lưu. Tải lại chi tiết đơn để xem trạng thái mới.')).toBeInTheDocument();
  });
});
