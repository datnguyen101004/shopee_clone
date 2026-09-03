import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SellerDiscountSummary, SellerVoucherSummary } from '@shopee-clone/contracts';
import { ToastProvider } from '@shopee-clone/ui';
import type { ReactElement } from 'react';
import { SellerPromotionsManagement } from './seller-promotions-management';

function renderPromotions(ui: ReactElement = <SellerPromotionsManagement />) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const api = vi.hoisted(() => ({
  vouchers: vi.fn(),
  discounts: vi.fn(),
  createVoucher: vi.fn(),
  updateVoucher: vi.fn(),
  actionVoucher: vi.fn(),
  deleteVoucher: vi.fn(),
  createDiscount: vi.fn(),
  updateDiscount: vi.fn(),
  actionDiscount: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({
    state: { status: 'authenticated', user: { roles: ['buyer', 'seller'] } },
    authenticatedFetch: api.authenticatedFetch,
  }),
}));
vi.mock('../lib/seller-promotions-api', () => ({
  fetchSellerVouchers: (...args: unknown[]) => api.vouchers(...args),
  fetchSellerDiscounts: (...args: unknown[]) => api.discounts(...args),
  createSellerVoucher: (...args: unknown[]) => api.createVoucher(...args),
  updateSellerVoucher: (...args: unknown[]) => api.updateVoucher(...args),
  actionSellerVoucher: (...args: unknown[]) => api.actionVoucher(...args),
  deleteSellerVoucher: (...args: unknown[]) => api.deleteVoucher(...args),
  createSellerDiscount: (...args: unknown[]) => api.createDiscount(...args),
  updateSellerDiscount: (...args: unknown[]) => api.updateDiscount(...args),
  actionSellerDiscount: (...args: unknown[]) => api.actionDiscount(...args),
}));

const voucher: SellerVoucherSummary = {
  id: '00000000-0000-4000-8000-000000000001', issuer: 'SHOP', code: 'SHOP10', name: 'Giảm shop',
  benefitType: 'FIXED_AMOUNT', fixedAmountMinor: 10000, percentageBasisPoints: null,
  maximumDiscountMinor: null, minimumSpendMinor: 50000, startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-31T00:00:00.000Z',
  usageLimit: 20, perBuyerLimit: 1, productIds: [], state: 'SCHEDULED', usedCount: 0, version: 2,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};
const discount: SellerDiscountSummary = {
  id: '00000000-0000-4000-8000-000000000002', name: 'Mùa hè', startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-31T00:00:00.000Z',
  products: [{ productId: '00000000-0000-4000-8000-000000000003', discountBasisPoints: 1500 }], state: 'ACTIVE', version: 4,
  archivedAt: null, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('SellerPromotionsManagement', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset();
    api.vouchers.mockResolvedValue({ sellerPromotionVersion: 'seller-promotions-v1', items: [voucher], nextCursor: null });
    api.discounts.mockResolvedValue({ sellerPromotionVersion: 'seller-promotions-v1', items: [discount], nextCursor: null });
    api.createVoucher.mockResolvedValue(voucher);
    api.updateVoucher.mockResolvedValue(voucher);
    api.actionVoucher.mockResolvedValue({ ...voucher, state: 'PAUSED', version: 3 });
    api.deleteVoucher.mockResolvedValue({ value: { deleted: true }, etag: null });
    api.createDiscount.mockResolvedValue(discount);
    api.updateDiscount.mockResolvedValue(discount);
    api.actionDiscount.mockResolvedValue(discount);
  });

  it('preloads authoritative voucher values before editing and sends the current version', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByRole('heading', { name: 'Cập nhật voucher' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('SHOP10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10.000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateVoucher).toHaveBeenCalledWith(api.authenticatedFetch, voucher.id, voucher.version, expect.objectContaining({ code: 'SHOP10', fixedAmountMinor: 10000 })));
    expect(await screen.findByText('Đã cập nhật voucher')).toBeInTheDocument();
  });

  it('formats integer values and only enables the maximum discount for percentage vouchers', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));

    const maximum = screen.getByText('Mức giảm tối đa (tuỳ chọn)', { exact: true }).closest('label')?.querySelector('input');
    if (!(maximum instanceof HTMLInputElement)) throw new Error('Maximum discount input not found');
    expect(maximum).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Loại ưu đãi' }), { target: { value: 'PERCENTAGE' } });
    expect(maximum).not.toBeDisabled();
    const valueInput = screen.getByText('Mức giảm', { exact: true }).closest('label')?.querySelector('input');
    if (!(valueInput instanceof HTMLInputElement)) throw new Error('Discount input not found');
    fireEvent.change(valueInput, { target: { value: '10' } });
    fireEvent.change(maximum, { target: { value: '1000' } });
    expect(maximum).toHaveValue('1.000');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateVoucher).toHaveBeenCalledWith(api.authenticatedFetch, voucher.id, voucher.version, expect.objectContaining({ percentageBasisPoints: 1000, maximumDiscountMinor: 1000, fixedAmountMinor: null })));
  });

  it('requires a custom confirmation and prevents duplicate action submissions', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('tạm dừng');
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(api.actionVoucher).toHaveBeenCalledTimes(1));
    expect(api.actionVoucher).toHaveBeenCalledWith(api.authenticatedFetch, voucher.id, voucher.version, 'PAUSE');
  });

  it('confirms deletion of a paused voucher and sends its current version', async () => {
    api.vouchers.mockResolvedValue({ sellerPromotionVersion: 'seller-promotions-v1', items: [{ ...voucher, state: 'PAUSED' }], nextCursor: null });
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('xóa vĩnh viễn');
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    await waitFor(() => expect(api.deleteVoucher).toHaveBeenCalledWith(api.authenticatedFetch, voucher.id, voucher.version));
  });

  it('shows promotion start times with English AM/PM instead of Vietnamese SA/CH', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    const start = screen.getByRole('button', { name: 'Bắt đầu' });
    expect(start).toHaveTextContent(/\b(AM|PM)$/);
    expect(start).not.toHaveTextContent(/\b(SA|CH)$/);
  });

  it('preloads discount products and preserves the selected tab form contract', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Giảm giá sản phẩm' }));
    await screen.findByText('Mùa hè');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByRole('heading', { name: 'Cập nhật chương trình' })).toBeInTheDocument();
    expect(screen.getByDisplayValue(discount.products[0]!.productId)).toBeInTheDocument();
    expect(screen.getByDisplayValue('15')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateDiscount).toHaveBeenCalledWith(api.authenticatedFetch, discount.id, discount.version, expect.objectContaining({ products: [{ productId: discount.products[0]!.productId, discountBasisPoints: 1500 }] })));
  });

  it('shows a bottom toast when voucher create succeeds or fails', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.change(screen.getByLabelText('Mã voucher'), { target: { value: 'NEW10' } });
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Voucher mới' } });
    fireEvent.change(screen.getByText('Mức giảm', { exact: true }).closest('label')!.querySelector('input')!, {
      target: { value: '10000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher' }));
    expect(await screen.findByText('Tạo voucher thành công')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng thông báo' })).toBeInTheDocument();

    api.createVoucher.mockRejectedValueOnce(new Error('Mã voucher đã tồn tại.'));
    fireEvent.change(screen.getByLabelText('Mã voucher'), { target: { value: 'DUP10' } });
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Voucher trùng' } });
    fireEvent.change(screen.getByText('Mức giảm', { exact: true }).closest('label')!.querySelector('input')!, {
      target: { value: '5000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher' }));
    expect(await screen.findByText('Tạo voucher thất bại')).toBeInTheDocument();
    expect(screen.getByText('Mã voucher đã tồn tại.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a clear Vietnamese toast when voucher code is too short', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.change(screen.getByLabelText('Mã voucher'), { target: { value: 'ABC' } });
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Giảm 20k' } });
    fireEvent.change(screen.getByText('Mức giảm', { exact: true }).closest('label')!.querySelector('input')!, {
      target: { value: '20000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher' }));
    expect(await screen.findByText('Tạo voucher thất bại')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Mã voucher phải từ 4–32 ký tự, chỉ gồm chữ in hoa, số và dấu gạch ngang (không bắt đầu/kết thúc bằng -).',
      ),
    ).toBeInTheDocument();
    expect(api.createVoucher).not.toHaveBeenCalled();
  });
});
