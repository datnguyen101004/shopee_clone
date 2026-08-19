import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SellerOrderDetailResponse, SellerOrderListResponse } from '@shopee-clone/contracts';
import { SellerOrderDetailScreen, SellerOrderQueueScreen } from './seller-order-management';

const apiMocks = vi.hoisted(() => ({ fetchOrders: vi.fn(), fetchOrder: vi.fn(), execute: vi.fn(), authenticatedFetch: vi.fn() }));

const orderReference = '00000000-0000-4000-8000-000000000001';
const baseSummary = {
  orderReference,
  purchaseReference: '00000000-0000-4000-8000-000000000002',
  shopId: '00000000-0000-4000-8000-000000000003',
  status: 'PENDING_CONFIRMATION' as const,
  paymentStatus: 'UNPAID' as const,
  fulfillmentState: 'PENDING_CONFIRMATION' as const,
  orderVersion: 0,
  fulfillmentVersion: 0,
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
  lineCount: 1,
  itemQuantity: 1,
  payableTotalMinor: 10000,
  shippingService: 'STANDARD' as const,
  deadline: { confirmationAt: '2026-08-19T00:00:00.000Z', handoffAt: null, confirmationOverdue: false, handoffOverdue: false },
  lines: [{ lineId: 'line-1', productId: '00000000-0000-4000-8000-000000000004', variantId: '00000000-0000-4000-8000-000000000005', productName: 'Bình nước', productImageUrl: null, variantName: 'Mặc định', variantSku: 'SKU-1', quantity: 1, unitPriceMinor: 10000, payableLineMinor: 10000, weightGrams: 100 }],
  availableActions: [{ action: 'REJECT' as const, reasonCodes: ['OUT_OF_STOCK' as const, 'OTHER' as const] }],
};
const detail: SellerOrderDetailResponse = {
  sellerOrderVersion: 'seller-orders-v1', currency: 'VND', order: {
    summary: baseSummary,
    shop: { id: baseSummary.shopId, slug: 'shop', name: 'Shop', pickupAddress: null },
    buyerNote: '',
    address: { recipientName: 'Người nhận', phoneNumber: '0912345678', province: 'Hà Nội', district: 'Quận 1', ward: 'Phường 1', addressLine: 'Số 1' },
    shipping: { provider: 'MOCK', version: 'mock-v1', shopId: baseSummary.shopId, originProvince: 'Hà Nội', destinationProvince: 'Hà Nội', zone: 'SAME_PROVINCE', shipmentWeightGrams: 100, service: 'STANDARD', estimatedDaysMin: 1, estimatedDaysMax: 2, baseFeeMinor: 0, zoneSurchargeMinor: 0, weightSurchargeMinor: 0, shippingFeeMinor: 0 },
    listSubtotalMinor: 10000, productDiscountMinor: 0, merchandiseSubtotalMinor: 10000, voucherDiscountMinor: 0, shippingPayableMinor: 0, payableTotalMinor: 10000,
    fulfillmentTimeline: [{ id: 'event-1', previousState: null, state: 'PENDING_CONFIRMATION', version: 0, actorType: 'SYSTEM', actorUserId: null, action: 'ORDER_CREATED', reasonCode: 'ORDER_CREATED', reasonNote: null, late: false, occurredAt: '2026-08-18T00:00:00.000Z' }],
    orderTimeline: [], shipment: null,
  },
};
const list: SellerOrderListResponse = { sellerOrderVersion: 'seller-orders-v1', items: [baseSummary], page: { limit: 20, nextCursor: null } };

apiMocks.fetchOrders.mockResolvedValue(list);
apiMocks.fetchOrder.mockResolvedValue({ data: detail, etag: '"seller-order-0-0"' });
apiMocks.execute.mockResolvedValue({ data: detail, etag: '"seller-order-0-0"' });

vi.mock('../lib/seller-orders-api', () => ({ fetchSellerOrders: apiMocks.fetchOrders, fetchSellerOrder: apiMocks.fetchOrder, executeSellerOrderAction: apiMocks.execute }));
vi.mock('../lib/role-api', () => ({ RoleApiError: class RoleApiError extends Error { status = 0; problem?: { detail?: string }; constructor() { super(); } } }));
vi.mock('./auth-session-provider', () => ({ useAuthSession: () => ({ state: { status: 'authenticated', user: { roles: ['buyer', 'seller'] } }, authenticatedFetch: apiMocks.authenticatedFetch }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

describe('Seller order management', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('renders an owned queue card and server-declared action count', async () => {
    render(<SellerOrderQueueScreen />);
    expect(await screen.findByText('Bình nước')).toBeInTheDocument();
    expect(screen.getByText('1 thao tác khả dụng')).toBeInTheDocument();
  });

  it('requires a controlled rejection reason before submitting', async () => {
    render(<SellerOrderDetailScreen orderReference={orderReference} />);
    await waitFor(() => expect(apiMocks.fetchOrder).toHaveBeenCalled());
    expect(await screen.findByText('Từ chối đơn')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Từ chối đơn'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'OTHER' } });
    expect(screen.getByText('Xác nhận')).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Không thể xử lý đơn' } });
    expect(screen.getByText('Xác nhận')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Xác nhận'));
    await waitFor(() => expect(apiMocks.execute).toHaveBeenCalled());
  });
});
