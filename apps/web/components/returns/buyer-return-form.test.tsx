import type { BuyerOrderSummary } from '@shopee-clone/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BuyerReturnForm } from './buyer-return-form';

const api = vi.hoisted(() => ({
  stageReturnEvidence: vi.fn(),
  createBuyerReturn: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

vi.mock('../../lib/returns-api', () => ({
  ReturnApiError: class ReturnApiError extends Error {
    constructor(
      public readonly kind: 'status' | 'contract',
      public readonly status: number,
      public readonly problem?: { detail: string; code: string },
    ) {
      super(problem?.detail ?? `Return API ${kind}`);
      this.name = 'ReturnApiError';
    }
  },
  stageReturnEvidence: api.stageReturnEvidence,
  createBuyerReturn: api.createBuyerReturn,
}));
vi.mock('../auth-session-provider', () => ({
  useAuthSession: () => ({
    state: {
      status: 'authenticated',
      user: {
        id: '00000000-0000-4000-8000-000000050001',
        email: 'buyer@example.test',
        displayName: 'Buyer',
        status: 'active',
        roles: ['buyer'],
      },
    },
    authenticatedFetch: api.authenticatedFetch,
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: api.replace, refresh: api.refresh }),
}));

const order: BuyerOrderSummary = {
  orderReference: '00000000-0000-4000-8000-000000050002',
  purchaseReference: '00000000-0000-4000-8000-000000050003',
  status: 'DELIVERED',
  paymentStatus: 'UNPAID',
  version: 3,
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
  shop: { id: '00000000-0000-4000-8000-000000050004', slug: 'shop', name: 'Shop' },
  note: '',
  lines: [
    {
      lineId: '00000000-0000-4000-8000-000000050005',
      productId: '00000000-0000-4000-8000-000000050006',
      variantId: '00000000-0000-4000-8000-000000050007',
      quantity: 2,
      unitWeightGrams: 100,
      shipmentWeightGrams: 200,
      listUnitPriceMinor: 100_000,
      sellingUnitPriceMinor: 100_000,
      listSubtotalMinor: 200_000,
      productDiscountMinor: 0,
      merchandiseSubtotalMinor: 200_000,
      shopVoucherDiscountMinor: 0,
      platformVoucherDiscountMinor: 0,
      merchandiseVoucherDiscountMinor: 0,
      payableMerchandiseMinor: 200_000,
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
    shopId: '00000000-0000-4000-8000-000000050004',
    originProvince: 'Hà Nội',
    destinationProvince: 'Hà Nội',
    zone: 'SAME_PROVINCE',
    shipmentWeightGrams: 200,
    service: 'STANDARD',
    estimatedDaysMin: 1,
    estimatedDaysMax: 2,
    baseFeeMinor: 0,
    zoneSurchargeMinor: 0,
    weightSurchargeMinor: 0,
    shippingFeeMinor: 0,
  },
  listSubtotalMinor: 200_000,
  productDiscountMinor: 0,
  merchandiseSubtotalMinor: 200_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 0,
  payableTotalMinor: 200_000,
  cancellation: { allowed: false, reasonCodes: [] },
  returnCapability: {
    allowed: true,
    deadlineAt: '2026-08-25T00:00:00.000Z',
    returnReference: null,
  },
};

describe('BuyerReturnForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.stageReturnEvidence.mockResolvedValue({
      evidenceId: '00000000-0000-4000-8000-000000050008',
      expiresAt: '2026-08-21T00:00:00.000Z',
    });
    api.createBuyerReturn.mockResolvedValue({
      data: {
        returnVersion: 'returns-v1',
        return: { returnReference: '00000000-0000-4000-8000-000000050009' },
      },
      etag: '"return-0"',
    });
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => cleanup());

  it('blocks short descriptions and allows evidence removal before create', async () => {
    const user = userEvent.setup();
    render(<BuyerReturnForm order={order} />);
    const submit = screen.getByRole('button', { name: 'Gửi yêu cầu trả hàng' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/ít nhất 20 ký tự/i), {
      target: { value: 'Quá ngắn' },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/ít nhất 20 ký tự/i), {
      target: { value: 'Sản phẩm bị hư hỏng khi nhận hàng' },
    });
    const file = new File([new Uint8Array([1, 2, 3])], 'proof.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    expect(await screen.findByAltText('Bằng chứng 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(submit).toBeDisabled();
  });

  it('stages evidence, creates once, and navigates without persisting private payloads', async () => {
    const user = userEvent.setup();
    render(<BuyerReturnForm order={order} />);
    fireEvent.change(screen.getByPlaceholderText(/ít nhất 20 ký tự/i), {
      target: { value: 'Sản phẩm bị hư hỏng khi nhận hàng' },
    });
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File([new Uint8Array([137, 80, 78, 71])], 'proof.png', { type: 'image/png' }),
    );
    const submit = screen.getByRole('button', { name: 'Gửi yêu cầu trả hàng' });
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);
    await waitFor(() => expect(api.stageReturnEvidence).toHaveBeenCalled());
    await waitFor(() => expect(api.createBuyerReturn).toHaveBeenCalledTimes(1));
    expect(api.replace).toHaveBeenCalledWith(
      '/account/returns/00000000-0000-4000-8000-000000050009',
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('refreshes on stale conflict and keeps the draft message', async () => {
    const { ReturnApiError } = await import('../../lib/returns-api');
    api.createBuyerReturn.mockRejectedValueOnce(
      new ReturnApiError('status', 409, { detail: 'stale', code: 'RETURN_STALE' }),
    );
    const user = userEvent.setup();
    render(<BuyerReturnForm order={order} />);
    fireEvent.change(screen.getByPlaceholderText(/ít nhất 20 ký tự/i), {
      target: { value: 'Sản phẩm bị hư hỏng khi nhận hàng' },
    });
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File([new Uint8Array([1])], 'proof.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }));
    expect(await screen.findByText(/Đơn hàng đã thay đổi/i)).toBeInTheDocument();
    expect(api.refresh).toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/ít nhất 20 ký tự/i)).toHaveValue(
      'Sản phẩm bị hư hỏng khi nhận hàng',
    );
  });

  it('rejects unsupported evidence MIME with a safe message', () => {
    render(<BuyerReturnForm order={order} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/JPEG, PNG hoặc WebP/i);
    expect(api.stageReturnEvidence).not.toHaveBeenCalled();
  });
});
