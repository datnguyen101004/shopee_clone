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

function orderWith(overrides: Partial<BuyerOrderSummary>): BuyerOrderSummary {
  return { ...order, ...overrides };
}

const secondOrder: BuyerOrderSummary = {
  ...order,
  orderReference: id('20'),
  shop: { id: id('21'), slug: 'space-u', name: 'Space U' },
  lines: [{ ...order.lines[0]!, lineId: id('22'), productName: 'Bàn làm việc' }],
  shipping: { ...order.shipping, shopId: id('21') },
};
const multiProductOrder: BuyerOrderSummary = {
  ...order,
  lines: [
    ...order.lines,
    {
      ...order.lines[0]!,
      lineId: id('23'),
      productId: id('24'),
      productName: 'Đèn bàn',
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
      clickstreamFetch: vi.fn(),
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

  it('renders one buyer card per shop order while keeping each shop products together', async () => {
    vi.mocked(getBuyerOrders).mockResolvedValue({
      orderHistoryVersion: 'order-history-v1',
      items: [multiProductOrder, secondOrder],
      page: { limit: 20, nextCursor: null },
    });

    const rendered = render(<BuyerOrderListScreen filter="ALL" />);

    expect(await screen.findByText('Ghế công thái học')).toBeInTheDocument();
    expect(screen.getByText('Đèn bàn')).toBeInTheDocument();
    expect(screen.getByText('Bàn làm việc')).toBeInTheDocument();
    expect(rendered.container.querySelectorAll('.buyer-order-card')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Xem chi tiết' })[0]).toHaveAttribute(
      'href',
      `/account/orders/${order.orderReference}`,
    );
    expect(screen.getAllByRole('link', { name: 'Xem chi tiết' })[1]).toHaveAttribute(
      'href',
      `/account/orders/${secondOrder.orderReference}`,
    );
  });

  it('shows the payment state instead of fulfillment for an unsettled online order', async () => {
    vi.mocked(getBuyerOrders).mockResolvedValue({
      orderHistoryVersion: 'order-history-v1',
      items: [orderWith({ status: 'PENDING_PAYMENT', paymentStatus: 'PENDING_RECONCILIATION' })],
      page: { limit: 20, nextCursor: null },
    });

    const rendered = render(<BuyerOrderListScreen filter="PENDING_PAYMENT" />);

    expect(await screen.findByText('Ghế công thái học')).toBeInTheDocument();
    expect(rendered.container.querySelector('.buyer-order-status')).toHaveTextContent(
      'Chờ thanh toán',
    );
    expect(screen.getByText('Thanh toán: Đang xác minh thanh toán')).toBeInTheDocument();
    expect(screen.queryByText('Thanh toán: Chờ xác nhận')).not.toBeInTheDocument();
  });

  it('shows cancelled and failed online payments in the cancelled tab with granular labels', async () => {
    vi.mocked(getBuyerOrders).mockResolvedValue({
      orderHistoryVersion: 'order-history-v1',
      items: [
        orderWith({ status: 'CANCELLED', paymentStatus: 'CANCELLED' }),
        orderWith({
          orderReference: id('12'),
          purchaseReference: id('13'),
          status: 'CANCELLED',
          paymentStatus: 'FAILED',
        }),
      ],
      page: { limit: 20, nextCursor: null },
    });

    render(<BuyerOrderListScreen filter="CANCELLED" />);

    expect(await screen.findByText('Thanh toán: Đã hủy thanh toán')).toBeInTheDocument();
    expect(screen.getByText('Thanh toán: Thanh toán thất bại')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đã hủy' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps payment and fulfillment labels separate after online payment succeeds', async () => {
    vi.mocked(getBuyerOrderDetail).mockResolvedValue({
      ...detail,
      order: orderWith({ paymentStatus: 'PAID', version: 1 }),
      timeline: [
        detail.timeline[0]!,
        {
          id: id('11'),
          previousStatus: 'PENDING_CONFIRMATION',
          status: 'PENDING_CONFIRMATION',
          orderVersion: 1,
          actorType: 'SYSTEM',
          actorUserId: null,
          reasonCode: 'VNPAY_PAYMENT_CONFIRMED',
          reasonNote: null,
          occurredAt: '2026-08-14T00:00:10.000Z',
        },
      ],
    });

    render(<BuyerOrderDetailScreen orderReference={order.orderReference} />);

    expect(await screen.findByText('Hành trình đơn hàng')).toBeInTheDocument();
    const journey = screen.getByText('Hành trình đơn hàng').parentElement!;
    const milestones = Array.from(journey.querySelectorAll('ol strong')).map(
      (element) => element.textContent,
    );
    expect(milestones).toEqual(['Chờ thanh toán', 'Chờ xác nhận']);
    expect(screen.getByText('Thanh toán: Đã thanh toán')).toBeInTheDocument();
  });

  it('places the cancellation action beside the link back to buyer orders', async () => {
    vi.mocked(getBuyerOrderDetail).mockResolvedValue(detail);

    const rendered = render(<BuyerOrderDetailScreen orderReference={order.orderReference} />);

    expect(await screen.findByText('Hành trình đơn hàng')).toBeInTheDocument();
    const actions = rendered.container.querySelector('.buyer-order-detail__actions');
    const backLink = screen.getByRole('link', { name: 'Về đơn mua' });
    const cancelButton = screen.getByRole('button', { name: 'Hủy đơn hàng' });

    expect(actions).not.toBeNull();
    expect(actions).toContainElement(backLink);
    expect(actions).toContainElement(cancelButton);
    expect(cancelButton.parentElement).toBe(actions);
  });

  it('hides the internal confirmation anchor for a cancelled VNPAY order', async () => {
    vi.mocked(getBuyerOrderDetail).mockResolvedValue({
      ...detail,
      order: orderWith({
        status: 'CANCELLED',
        paymentStatus: 'CANCELLED',
        version: 2,
        cancellation: { allowed: false, reasonCodes: [] },
      }),
      timeline: [
        detail.timeline[0]!,
        {
          id: id('13'),
          previousStatus: 'PENDING_CONFIRMATION',
          status: 'PENDING_PAYMENT',
          orderVersion: 1,
          actorType: 'SYSTEM',
          actorUserId: null,
          reasonCode: 'VNPAY_PAYMENT_PENDING',
          reasonNote: null,
          occurredAt: '2026-08-14T00:00:01.000Z',
        },
        {
          id: id('14'),
          previousStatus: 'PENDING_PAYMENT',
          status: 'CANCELLED',
          orderVersion: 2,
          actorType: 'SYSTEM',
          actorUserId: null,
          reasonCode: 'VNPAY_PAYMENT_CANCELLED',
          reasonNote: null,
          occurredAt: '2026-08-14T00:00:02.000Z',
        },
      ],
    });

    render(<BuyerOrderDetailScreen orderReference={order.orderReference} />);

    expect(await screen.findByText('Hành trình đơn hàng')).toBeInTheDocument();
    const journey = screen.getByText('Hành trình đơn hàng').parentElement!;
    const milestones = Array.from(journey.querySelectorAll('ol strong')).map(
      (element) => element.textContent,
    );
    expect(milestones).toEqual(['Chờ thanh toán', 'Đã hủy']);
  });

  it('keeps a deleted historical product link and explains that the product is unavailable', async () => {
    vi.mocked(getBuyerOrders).mockResolvedValue({
      orderHistoryVersion: 'order-history-v1',
      items: [
        orderWith({
          lines: [{ ...order.lines[0]!, productAvailable: false }],
        }),
      ],
      page: { limit: 20, nextCursor: null },
    });

    render(<BuyerOrderListScreen filter="PENDING_CONFIRMATION" />);

    const productLink = await screen.findByRole('link', {
      name: 'Ghế công thái học (sản phẩm đã bị xóa)',
    });
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
      order: orderWith({
        status: 'CANCELLED',
        version: 1,
        cancellation: { allowed: false, reasonCodes: [] },
      }),
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
      order: orderWith({
        status: 'DELIVERED' as const,
        cancellation: { allowed: false, reasonCodes: [] },
        lines: [{ ...order.lines[0]!, review: { state: 'ELIGIBLE' as const, reviewId: null } }],
      }),
    };
    vi.mocked(getBuyerOrderDetail).mockResolvedValue(delivered);
    vi.mocked(createProductReview).mockResolvedValue({
      review: {
        id: id('11'),
        orderLineId: id('4'),
        rating: 5,
        text: 'Tốt',
        authorName: 'Buyer',
        verifiedPurchase: true,
        media: [],
        updatedAt: '2026-08-15T00:00:00.000Z',
        visibility: 'VISIBLE',
        version: 0,
      },
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
    expect(
      screen.getByText('Đánh giá đã được lưu. Tải lại chi tiết đơn để xem trạng thái mới.'),
    ).toBeInTheDocument();
  });
});
