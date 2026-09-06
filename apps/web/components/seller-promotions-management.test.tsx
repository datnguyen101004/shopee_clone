import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SellerProductSummary, SellerVoucherSummary } from '@shopee-clone/contracts';
import { ToastProvider } from '@shopee-clone/ui';
import type { ReactElement } from 'react';
import { SellerPromotionsManagement } from './seller-promotions-management';

function renderPromotions(ui: ReactElement = <SellerPromotionsManagement />) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const api = vi.hoisted(() => ({
  vouchers: vi.fn(),
  products: vi.fn(),
  createVoucher: vi.fn(),
  updateVoucher: vi.fn(),
  actionVoucher: vi.fn(),
  deleteVoucher: vi.fn(),
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
  createSellerVoucher: (...args: unknown[]) => api.createVoucher(...args),
  updateSellerVoucher: (...args: unknown[]) => api.updateVoucher(...args),
  actionSellerVoucher: (...args: unknown[]) => api.actionVoucher(...args),
  deleteSellerVoucher: (...args: unknown[]) => api.deleteVoucher(...args),
}));
vi.mock('../lib/seller-products-api', () => ({
  fetchSellerProducts: (...args: unknown[]) => api.products(...args),
}));

const voucher: SellerVoucherSummary = {
  id: '00000000-0000-4000-8000-000000000001', issuer: 'SHOP', code: 'SHOP10', name: 'Giảm shop',
  benefitType: 'FIXED_AMOUNT', fixedAmountMinor: 10000, percentageBasisPoints: null,
  maximumDiscountMinor: null, minimumSpendMinor: 50000, startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-31T00:00:00.000Z',
  usageLimit: 20, perBuyerLimit: 1, productIds: [], state: 'SCHEDULED', usedCount: 0, version: 2,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};
const products: SellerProductSummary[] = [
  {
    id: '00000000-0000-4000-8000-000000000002', slug: 'ao', name: 'Áo', categoryName: 'Thời trang',
    lifecycle: 'published', moderationStatus: 'active', primaryMediaUrl: '/media/products/ao.jpg',
    variantCount: 1, stockQuantity: 10, updatedAt: '2026-07-01T00:00:00.000Z',
    operationalPriceRange: { minPriceMinor: 100000, maxPriceMinor: 100000 },
  },
  {
    id: '00000000-0000-4000-8000-000000000003', slug: 'quan', name: 'Quần', categoryName: 'Thời trang',
    lifecycle: 'published', moderationStatus: 'active', primaryMediaUrl: null,
    variantCount: 1, stockQuantity: 8, updatedAt: '2026-07-02T00:00:00.000Z',
    operationalPriceRange: { minPriceMinor: 120000, maxPriceMinor: 180000 },
  },
];

describe('SellerPromotionsManagement', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset();
    api.vouchers.mockResolvedValue({ sellerPromotionVersion: 'seller-promotions-v1', items: [voucher], nextCursor: null });
    api.products.mockResolvedValue({ items: products, nextCursor: null });
    api.createVoucher.mockResolvedValue(voucher);
    api.updateVoucher.mockResolvedValue(voucher);
    api.actionVoucher.mockResolvedValue({ ...voucher, state: 'PAUSED', version: 3 });
    api.deleteVoucher.mockResolvedValue({ value: { deleted: true }, etag: null });
  });

  it('preloads authoritative voucher values before editing and sends the current version', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa voucher SHOP10' }));
    expect(screen.getByRole('heading', { name: 'Cập nhật voucher' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mã voucher')).toHaveTextContent('SHOP10');
    expect(screen.getByDisplayValue('10.000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.updateVoucher).toHaveBeenCalledWith(api.authenticatedFetch, voucher.id, voucher.version, expect.objectContaining({ fixedAmountMinor: 10000 })));
    expect(await screen.findByText('Đã cập nhật voucher')).toBeInTheDocument();
  });

  it('formats integer values and only enables the maximum discount for percentage vouchers', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa voucher SHOP10' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng voucher SHOP10' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('tạm dừng');
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(api.actionVoucher).toHaveBeenCalledTimes(1));
    expect(api.actionVoucher).toHaveBeenCalledWith(api.authenticatedFetch, voucher.id, voucher.version, 'PAUSE');
  });

  it('confirms deletion of a paused voucher and sends its current version', async () => {
    api.vouchers.mockResolvedValue({ sellerPromotionVersion: 'seller-promotions-v1', items: [{ ...voucher, state: 'PAUSED' }], nextCursor: null });
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa voucher SHOP10' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('xóa vĩnh viễn');
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    await waitFor(() => expect(api.deleteVoucher).toHaveBeenCalledWith(api.authenticatedFetch, voucher.id, voucher.version));
  });

  it('uses date-only promotion fields without rendering time controls', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher mới' }));
    const start = screen.getByRole('button', { name: 'Bắt đầu' });
    expect(start).toHaveTextContent(/^\d{2}\/\d{2}\/\d{4}$/);
    fireEvent.click(start);
    expect(screen.getByRole('dialog', { name: /Tháng/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'AM' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'PM' })).not.toBeInTheDocument();
  });

  it('resolves selected product IDs to names while editing a voucher', async () => {
    api.vouchers.mockResolvedValue({
      sellerPromotionVersion: 'seller-promotions-v1',
      items: [{ ...voucher, productIds: [products[0]!.id] }],
      nextCursor: null,
    });
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa voucher SHOP10' }));
    expect(screen.getByText('Sản phẩm áp dụng')).toBeInTheDocument();
    expect(await screen.findByText('Áo')).toBeInTheDocument();
    expect(screen.getByText('1 sản phẩm đã chọn')).toBeInTheDocument();
  });

  it('selects multiple products from the picker and keeps empty selection for all products', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher mới' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chọn sản phẩm' }));
    expect(await screen.findByText('Áo')).toBeInTheDocument();
    expect(screen.getByText('100.000 đ')).toBeInTheDocument();
    expect(screen.getByText('120.000 đ - 180.000 đ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Áo' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Quần' }));
    expect(screen.getByText('2 sản phẩm được chọn')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xong' }));
    expect(screen.getByText('2 sản phẩm đã chọn')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Voucher nhiều sản phẩm' } });
    fireEvent.change(screen.getByText('Mức giảm', { exact: true }).closest('label')!.querySelector('input')!, {
      target: { value: '10000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher' }));
    await waitFor(() => expect(api.createVoucher).toHaveBeenCalledWith(
      api.authenticatedFetch,
      expect.objectContaining({ productIds: [products[0]!.id, products[1]!.id] }),
    ));
  });

  it('shows a bottom toast when voucher create succeeds or fails', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher mới' }));
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Voucher mới' } });
    fireEvent.change(screen.getByText('Mức giảm', { exact: true }).closest('label')!.querySelector('input')!, {
      target: { value: '10000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher' }));
    expect(await screen.findByText('Tạo voucher thành công')).toBeInTheDocument();
    expect(api.createVoucher).toHaveBeenCalledWith(
      api.authenticatedFetch,
      expect.objectContaining({ productIds: [] }),
    );
    expect(screen.getByRole('button', { name: 'Đóng thông báo' })).toBeInTheDocument();

    api.createVoucher.mockRejectedValueOnce(new Error('Mã voucher đã tồn tại.'));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher mới' }));
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Voucher trùng' } });
    fireEvent.change(screen.getByText('Mức giảm', { exact: true }).closest('label')!.querySelector('input')!, {
      target: { value: '5000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher' }));
    expect(await screen.findByText('Tạo voucher thất bại')).toBeInTheDocument();
    expect(screen.getByText('Mã voucher đã tồn tại.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not expose voucher code entry in the create form', async () => {
    renderPromotions();
    await screen.findByText('SHOP10');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo voucher mới' }));
    expect(screen.queryByLabelText('Mã voucher')).not.toBeInTheDocument();
    expect(screen.getByText('Mã voucher sẽ được hệ thống tạo tự động sau khi lưu.')).toBeInTheDocument();
  });

  it('searches loaded vouchers and sorts by benefit value', async () => {
    const secondVoucher: SellerVoucherSummary = {
      ...voucher,
      id: '00000000-0000-4000-8000-000000000004',
      code: 'SHOP50',
      name: 'Giảm shop 50K',
      fixedAmountMinor: 50000,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-30T00:00:00.000Z',
    };
    api.vouchers.mockResolvedValue({
      sellerPromotionVersion: 'seller-promotions-v1',
      items: [voucher, secondVoucher],
      nextCursor: null,
    });

    renderPromotions();
    await screen.findByText('SHOP50');
    fireEvent.change(screen.getByLabelText('Sắp xếp'), { target: { value: 'highest-value' } });
    expect(screen.getByRole('row', { name: /SHOP50/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tìm kiếm voucher'), { target: { value: 'SHOP10' } });
    expect(screen.getByText('SHOP10')).toBeInTheDocument();
    expect(screen.queryByText('SHOP50')).not.toBeInTheDocument();
    expect(screen.getByText(/voucher đã tải/)).toHaveTextContent('Hiển thị 1 trong 2 voucher đã tải');
  });
});
