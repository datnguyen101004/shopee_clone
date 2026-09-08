import type {
  AdminReturnDetailResponse,
  ReturnDetailResponse,
  ReturnListResponse,
} from '@shopee-clone/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  AdminReturnDetailScreen,
  AdminReturnQueueScreen,
  BuyerReturnDetailScreen,
  BuyerReturnQueueScreen,
  SellerReturnDetailScreen,
  SellerReturnQueueScreen,
} from './return-workflows';

const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, '0')}`;
const returnReference = id('601');
const orderReference = id('602');

const api = vi.hoisted(() => ({
  fetchBuyerReturns: vi.fn(),
  fetchBuyerReturn: vi.fn(),
  fetchSellerReturns: vi.fn(),
  fetchSellerReturn: vi.fn(),
  fetchAdminReturns: vi.fn(),
  fetchAdminReturn: vi.fn(),
  executeBuyerReturnAction: vi.fn(),
  executeSellerReturnAction: vi.fn(),
  decideAdminReturn: vi.fn(),
  authenticatedFetch: vi.fn(),
  roles: ['buyer'] as string[],
}));

vi.mock('../../lib/returns-api', () => {
  class ReturnApiError extends Error {
    constructor(
      public readonly kind: 'status' | 'contract',
      public readonly status: number,
      public readonly problem?: { detail: string; code: string },
    ) {
      super(problem?.detail ?? `Return API ${kind}`);
      this.name = 'ReturnApiError';
    }
  }
  return {
    ReturnApiError,
    fetchBuyerReturns: api.fetchBuyerReturns,
    fetchBuyerReturn: api.fetchBuyerReturn,
    fetchSellerReturns: api.fetchSellerReturns,
    fetchSellerReturn: api.fetchSellerReturn,
    fetchAdminReturns: api.fetchAdminReturns,
    fetchAdminReturn: api.fetchAdminReturn,
    executeBuyerReturnAction: api.executeBuyerReturnAction,
    executeSellerReturnAction: api.executeSellerReturnAction,
    decideAdminReturn: api.decideAdminReturn,
  };
});

vi.mock('../auth-session-provider', () => ({
  useAuthSession: () => ({
    state: {
      status: 'authenticated' as const,
      user: {
        id: id('600'),
        email: 'actor@example.test',
        displayName: 'Actor',
        status: 'active',
        roles: api.roles,
      },
    },
    authenticatedFetch: api.authenticatedFetch,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const summary = {
  returnReference,
  orderReference,
  status: 'REQUESTED' as const,
  version: 0,
  reasonCode: 'DAMAGED' as const,
  refundAmountMinor: 100_000,
  deadline: {
    eligibilityAt: '2026-08-25T00:00:00.000Z',
    sellerResponseAt: '2026-08-22T00:00:00.000Z',
    shipmentAt: null,
    receiptAt: null,
  },
  updatedAt: '2026-08-20T00:00:00.000Z',
  availableActions: [{ action: 'CANCEL' as const, requiresPublicReason: false }],
};

const list: ReturnListResponse = {
  returnVersion: 'returns-v1',
  items: [summary],
  page: { limit: 20, nextCursor: null },
};

function detail(
  status: ReturnDetailResponse['return']['status'],
  actions: ReturnDetailResponse['return']['availableActions'],
): ReturnDetailResponse {
  return {
    returnVersion: 'returns-v1',
    return: {
      ...summary,
      status,
      availableActions: actions,
      currency: 'VND',
      description: 'Sản phẩm bị hư hỏng khi nhận hàng',
      lines: [
        {
          lineReference: id('603'),
          productName: 'Ghế',
          variantName: 'Đen',
          productImageUrl: null,
          purchasedQuantity: 2,
          requestedQuantity: 1,
          payableMerchandiseMinor: 200_000,
          refundMinor: 100_000,
        },
      ],
      evidence: [
        {
          evidenceId: id('604'),
          mimeType: 'image/png',
          bytes: 12,
          width: 1,
          height: 1,
          url: `/api/v1/return-evidence/${id('604')}`,
        },
      ],
      timeline: [
        {
          id: id('605'),
          version: 0,
          previousStatus: null,
          status: 'REQUESTED',
          actorType: 'BUYER',
          occurredAt: '2026-08-20T00:00:00.000Z',
          reasonCode: 'RETURN_CREATE',
          publicReason: null,
        },
      ],
      shipment: null,
      refund: null,
      sellerPublicReason: null,
    },
  };
}

const adminDetail = (internalNote: string | null): AdminReturnDetailResponse => ({
  returnVersion: 'returns-v1',
  return: {
    ...detail('ESCALATED', [
      { action: 'APPROVE_REFUND', requiresPublicReason: true },
      { action: 'REJECT', requiresPublicReason: true },
      { action: 'APPROVE_RETURN', requiresPublicReason: true },
    ]).return,
    status: 'ESCALATED',
    availableActions: [
      { action: 'APPROVE_REFUND', requiresPublicReason: true },
      { action: 'REJECT', requiresPublicReason: true },
      { action: 'APPROVE_RETURN', requiresPublicReason: true },
    ],
    buyer: { id: id('606'), displayName: 'Buyer' },
    shop: { id: id('607'), name: 'Shop' },
    decisions: internalNote
      ? [
          {
            id: id('608'),
            decision: 'REJECT',
            publicReason: 'Không đủ bằng chứng',
            internalNote,
            decidedAt: '2026-08-20T01:00:00.000Z',
          },
        ]
      : [],
  },
});

describe('return workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.roles = ['buyer'];
    api.fetchBuyerReturns.mockResolvedValue(list);
    api.fetchSellerReturns.mockResolvedValue(list);
    api.fetchAdminReturns.mockResolvedValue({
      ...list,
      items: [{ ...summary, status: 'ESCALATED', availableActions: [] }],
    });
    api.fetchBuyerReturn.mockResolvedValue({
      data: detail('REQUESTED', [{ action: 'CANCEL', requiresPublicReason: false }]),
      etag: '"return-0"',
    });
    api.fetchSellerReturn.mockResolvedValue({
      data: detail('REQUESTED', [
        { action: 'ACCEPT_RETURN', requiresPublicReason: false },
        { action: 'REJECT_AND_ESCALATE', requiresPublicReason: true },
      ]),
      etag: '"return-0"',
    });
    api.fetchAdminReturn.mockResolvedValue({ data: adminDetail(null), etag: '"return-1"' });
    api.authenticatedFetch.mockResolvedValue(new Response(new Blob(['x']), { status: 200 }));
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => cleanup());

  it('shows buyer queue, filters, cancel action, and conflict refresh', async () => {
    const user = userEvent.setup();
    render(<BuyerReturnQueueScreen />);
    expect(await screen.findByText('Đang chờ người bán phản hồi')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Trạng thái' }), {
      target: { value: 'REQUESTED' },
    });
    await user.click(screen.getByRole('button', { name: 'Lọc' }));
    await waitFor(() =>
      expect(api.fetchBuyerReturns).toHaveBeenCalledWith(
        api.authenticatedFetch,
        expect.objectContaining({ status: 'REQUESTED' }),
      ),
    );

    api.executeBuyerReturnAction.mockRejectedValueOnce(
      new (await import('../../lib/returns-api')).ReturnApiError('status', 409, {
        detail: 'stale',
        code: 'RETURN_STALE',
      }),
    );
    render(<BuyerReturnDetailScreen returnReference={returnReference} />);
    expect(await screen.findByText('Sản phẩm bị hư hỏng khi nhận hàng')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hủy yêu cầu' }));
    expect(await screen.findByText(/Trạng thái đã thay đổi/i)).toBeInTheDocument();
    expect(api.fetchBuyerReturn.mock.calls.length).toBeGreaterThan(1);
    expect(localStorage.length).toBe(0);
  });

  it('blocks non-seller access and accepts seller actions with public reason when required', async () => {
    api.roles = ['buyer'];
    render(<SellerReturnQueueScreen />);
    expect(await screen.findByText(/không có quyền/i)).toBeInTheDocument();
    expect(api.fetchSellerReturns).not.toHaveBeenCalled();

    api.roles = ['seller'];
    api.executeSellerReturnAction.mockResolvedValue({
      data: detail('AWAITING_RETURN', [{ action: 'SUBMIT_SHIPMENT', requiresPublicReason: false }]),
      etag: '"return-1"',
    });
    render(<SellerReturnDetailScreen returnReference={returnReference} />);
    expect(await screen.findByText('Xử lý yêu cầu')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Chọn thao tác'), {
      target: { value: 'REJECT_AND_ESCALATE' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Lý do hiển thị cho người mua/i), {
      target: { value: 'Không đủ điều kiện đổi trả' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() =>
      expect(api.executeSellerReturnAction).toHaveBeenCalledWith(
        api.authenticatedFetch,
        returnReference,
        '"return-0"',
        expect.objectContaining({
          action: 'REJECT_AND_ESCALATE',
          publicReason: 'Không đủ điều kiện đổi trả',
        }),
        expect.any(String),
      ),
    );
  });

  it('requires admin confirmation and keeps internal notes off buyer/seller surfaces', async () => {
    api.roles = ['admin'];
    api.decideAdminReturn.mockResolvedValue({
      data: adminDetail('Ghi chú nội bộ nhạy cảm'),
      etag: '"return-2"',
    });
    api.fetchAdminReturn.mockResolvedValue({
      data: adminDetail('Ghi chú nội bộ nhạy cảm'),
      etag: '"return-1"',
    });
    render(<AdminReturnQueueScreen />);
    expect(await screen.findByText('Cần quản trị viên xử lý')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Yêu cầu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Xử lý yêu cầu ${returnReference}` })).toHaveAttribute(
      'href',
      `/admin/returns/${returnReference}#admin-return-actions`,
    );
    expect(screen.getByRole('link', { name: `Xem chi tiết yêu cầu ${returnReference}` })).toHaveAttribute(
      'href',
      `/admin/returns/${returnReference}`,
    );
    fireEvent.change(screen.getByPlaceholderText(/Nhập mã yêu cầu hoặc đơn/i), {
      target: { value: returnReference },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lọc' }));
    await waitFor(() =>
      expect(api.fetchAdminReturns).toHaveBeenCalledWith(
        api.authenticatedFetch,
        expect.objectContaining({ reference: returnReference }),
      ),
    );

    render(<AdminReturnDetailScreen returnReference={returnReference} />);
    expect(
      await screen.findByRole('heading', { name: 'Chi tiết trả hàng / hoàn tiền' }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Ghi chú nội bộ nhạy cảm/i)).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Chọn quyết định'), {
      target: { value: 'APPROVE_REFUND' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Lý do hiển thị cho người mua và người bán/i), {
      target: { value: 'Bằng chứng đủ để hoàn tiền' },
    });
    expect(screen.getByRole('button', { name: 'Ra quyết định' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ra quyết định' }));
    expect(await screen.findByText(/Hãy xác nhận trước khi ra quyết định/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Tôi xác nhận quyết định này/i));
    fireEvent.click(screen.getByRole('button', { name: 'Ra quyết định' }));
    await waitFor(() => expect(api.decideAdminReturn).toHaveBeenCalled());

    cleanup();
    api.roles = ['buyer'];
    api.fetchBuyerReturn.mockResolvedValue({
      data: detail('REFUNDED', []),
      etag: '"return-2"',
    });
    render(<BuyerReturnDetailScreen returnReference={returnReference} />);
    expect(await screen.findByText('Đã hoàn tiền')).toBeInTheDocument();
    expect(screen.queryByText(/Ghi chú nội bộ nhạy cảm/i)).not.toBeInTheDocument();
  });
});
