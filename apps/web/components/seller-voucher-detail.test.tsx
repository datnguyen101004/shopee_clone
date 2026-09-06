import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SellerVoucherSummary } from '@shopee-clone/contracts';
import { ToastProvider } from '@shopee-clone/ui';
import { SellerVoucherDetail } from './seller-voucher-detail';

const api = vi.hoisted(() => ({
  fetchVoucher: vi.fn(),
  updateVoucher: vi.fn(),
  authenticatedFetch: vi.fn(),
  push: vi.fn(),
}));

vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({
    state: { status: 'authenticated', user: { roles: ['buyer', 'seller'] } },
    authenticatedFetch: api.authenticatedFetch,
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock('../lib/seller-promotions-api', () => ({
  fetchSellerVoucher: (...args: unknown[]) => api.fetchVoucher(...args),
  updateSellerVoucher: (...args: unknown[]) => api.updateVoucher(...args),
  actionSellerVoucher: vi.fn(),
  deleteSellerVoucher: vi.fn(),
}));
vi.mock('../lib/seller-products-api', () => ({ fetchSellerProducts: vi.fn() }));

const voucher: SellerVoucherSummary = {
  id: '00000000-0000-4000-8000-000000000001', issuer: 'SHOP', code: 'SHOP10', name: 'Giảm shop',
  benefitType: 'FIXED_AMOUNT', fixedAmountMinor: 10000, percentageBasisPoints: null,
  maximumDiscountMinor: null, minimumSpendMinor: 50000, startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-31T00:00:00.000Z',
  usageLimit: 20, perBuyerLimit: 1, productIds: [], state: 'PAUSED', usedCount: 0, version: 2,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('SellerVoucherDetail', () => {
  beforeEach(() => {
    api.fetchVoucher.mockReset();
    api.updateVoucher.mockReset();
    api.push.mockReset();
    api.fetchVoucher.mockResolvedValue(voucher);
    api.updateVoucher.mockResolvedValue({ value: { ...voucher, name: 'Giảm shop mới', version: 3 }, etag: 'seller-voucher-v3' });
  });

  it('keeps actions below the detail and opens the edit form in place', async () => {
    render(<ToastProvider><SellerVoucherDetail voucherId={voucher.id} /></ToastProvider>);
    expect(await screen.findByText('Chi tiết Voucher: SHOP10')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /quản lý voucher/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa thông tin' }));
    expect(screen.getByRole('heading', { name: 'Cập nhật voucher' })).toBeInTheDocument();
    expect(api.push).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Giảm shop mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateVoucher).toHaveBeenCalledWith(
      api.authenticatedFetch,
      voucher.id,
      voucher.version,
      expect.objectContaining({ name: 'Giảm shop mới' }),
    ));
    expect(await screen.findByText('Đã cập nhật voucher')).toBeInTheDocument();
  });
});
