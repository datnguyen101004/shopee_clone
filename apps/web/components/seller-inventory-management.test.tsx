import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SellerInventoryManagement } from './seller-inventory-management';

const fetchInventory = vi.fn();
const adjustInventory = vi.fn();
const fetchHistory = vi.fn();
const authenticatedFetch = vi.fn();

vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({ authenticatedFetch, state: { status: 'authenticated', user: { roles: ['buyer', 'seller'] } } }),
}));
vi.mock('../lib/inventory-api', () => ({
  fetchSellerInventory: (...args: unknown[]) => fetchInventory(...args),
  adjustSellerInventory: (...args: unknown[]) => adjustInventory(...args),
  fetchSellerInventoryHistory: (...args: unknown[]) => fetchHistory(...args),
}));

const item = {
  variantId: '00000000-0000-4000-8000-000000000001',
  productId: '00000000-0000-4000-8000-000000000002',
  productName: 'Gương',
  productImageUrl: 'https://cdn.example.test/guong.jpg',
  variantName: 'Mặc định',
  sku: 'SKU-GUONG',
  lifecycle: 'active' as const,
  quantityOnHand: 10,
  quantityReserved: 3,
  quantitySold: 2,
  availableQuantity: 7,
  lowStock: false,
  version: 4,
  updatedAt: '2026-08-18T00:00:00.000Z',
};

describe('SellerInventoryManagement', () => {
  beforeEach(() => {
    fetchInventory.mockReset().mockResolvedValue({ items: [item], nextCursor: null });
    adjustInventory.mockReset().mockResolvedValue({ id: 'audit' });
    fetchHistory.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  });

  it('shows the authoritative balance and keeps adjustment controls keyboard reachable', async () => {
    render(<SellerInventoryManagement />);
    expect(await screen.findByText('Gương')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Điều chỉnh' }));
    const input = screen.getByLabelText('Thay đổi số lượng');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu điều chỉnh' }));
    await waitFor(() => expect(adjustInventory).toHaveBeenCalledWith(authenticatedFetch, item.variantId, item.version, expect.objectContaining({ delta: 5, reason: 'RESTOCK' })));
  });

  it('opens audit history and preserves the modal when a rejected adjustment is returned', async () => {
    const error = new Error('stale');
    adjustInventory.mockRejectedValueOnce(error);
    render(<SellerInventoryManagement />);
    await screen.findByText('Gương');
    fireEvent.click(screen.getByRole('button', { name: 'Lịch sử' }));
    expect(await screen.findByText('Lịch sử điều chỉnh')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Điều chỉnh' }));
    fireEvent.change(screen.getByLabelText('Thay đổi số lượng'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu điều chỉnh' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });

  it('renders the product thumbnail and a stable fallback when the image is unavailable', async () => {
    render(<SellerInventoryManagement />);
    const image = await screen.findByAltText('Ảnh Gương');
    expect(image).toHaveAttribute('src', item.productImageUrl);
    fireEvent.error(image);
    expect(await screen.findByLabelText('Chưa có ảnh cho Gương')).toBeInTheDocument();
  });

  it('explains that only published products are shown in the empty state', async () => {
    fetchInventory.mockResolvedValue({ items: [], nextCursor: null });
    render(<SellerInventoryManagement />);
    expect(await screen.findByText(/chỉ hiển thị sản phẩm đang bán/i)).toBeInTheDocument();
  });
});
