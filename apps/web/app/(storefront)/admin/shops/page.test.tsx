import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminShopsPage from './page';

const api = vi.hoisted(() => ({
  fetchAdminShops: vi.fn(),
  executeAdminShopAction: vi.fn(),
  approveSellerShop: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

vi.mock('../../../../components/auth-session-provider', () => ({
  useAuthSession: () => ({ authenticatedFetch: api.authenticatedFetch }),
}));
vi.mock('../../../../lib/admin-api', () => ({
  fetchAdminShops: (...args: unknown[]) => api.fetchAdminShops(...args),
  executeAdminShopAction: (...args: unknown[]) => api.executeAdminShopAction(...args),
}));
vi.mock('../../../../lib/seller-shop-api', () => ({
  approveSellerShop: (...args: unknown[]) => api.approveSellerShop(...args),
}));

const activeShop = {
  id: '00000000-0000-4000-8000-000000000101',
  ownerId: '00000000-0000-4000-8000-000000000201',
  slug: 'active-shop',
  name: 'Active Shop',
  status: 'ACTIVE',
  onboardingStatus: 'APPROVED',
  onboardingReason: null,
  updatedAt: '2026-08-25T00:00:00.000Z',
};
const shopPage = (items: (typeof activeShop)[], page = 1, totalItems = items.length) => ({
  items,
  page,
  pageSize: 10,
  totalItems,
  totalPages: Math.ceil(totalItems / 10),
});

describe('AdminShopsPage paired seller lifecycle feedback', () => {
  beforeEach(() => {
    api.fetchAdminShops.mockReset();
    api.executeAdminShopAction.mockReset();
    api.approveSellerShop.mockReset();
    api.fetchAdminShops.mockResolvedValue(shopPage([activeShop]));
  });

  it('confirms paired suspension and refetches authoritative shop state', async () => {
    const suspendedShop = { ...activeShop, status: 'SUSPENDED' };
    api.executeAdminShopAction.mockResolvedValue(suspendedShop);
    api.fetchAdminShops
      .mockResolvedValueOnce(shopPage([activeShop]))
      .mockResolvedValueOnce(shopPage([suspendedShop]));

    const { container } = render(<AdminShopsPage />);
    await screen.findByText(activeShop.name);
    fireEvent.click(screen.getByRole('button', { name: `Khóa cửa hàng ${activeShop.name}` }));

    const forms = container.querySelectorAll('form');
    const actionForm = forms[forms.length - 1]!;
    fireEvent.change(actionForm.querySelector('textarea')!, {
      target: { value: 'Policy violation' },
    });
    fireEvent.submit(actionForm);

    await waitFor(() =>
      expect(api.executeAdminShopAction).toHaveBeenCalledWith(
        api.authenticatedFetch,
        activeShop.id,
        { action: 'SUSPEND', reason: 'Policy violation' },
      ),
    );
    await waitFor(() => expect(api.fetchAdminShops).toHaveBeenCalledTimes(2));
  });

  it('keeps invalid action feedback accessible and does not submit', async () => {
    const { container } = render(<AdminShopsPage />);
    await screen.findByText(activeShop.name);
    fireEvent.click(screen.getByRole('button', { name: `Khóa cửa hàng ${activeShop.name}` }));
    const forms = container.querySelectorAll('form');
    const actionForm = forms[forms.length - 1]!;
    fireEvent.change(actionForm.querySelector('textarea')!, { target: { value: 'short' } });
    fireEvent.submit(actionForm);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.executeAdminShopAction).not.toHaveBeenCalled();
  });

  it('uses icon actions and loads the selected numeric page', async () => {
    const secondPageShop = {
      ...activeShop,
      id: '00000000-0000-4000-8000-000000000102',
      name: 'Second Page Shop',
      slug: 'second-page-shop',
    };
    api.fetchAdminShops
      .mockResolvedValueOnce(shopPage([activeShop], 1, 200))
      .mockResolvedValueOnce(shopPage([secondPageShop], 2, 200));

    render(<AdminShopsPage />);
    await screen.findByText(activeShop.name);
    expect(screen.queryByText(`/${activeShop.slug}`)).not.toBeInTheDocument();
    const action = screen.getByRole('button', { name: `Khóa cửa hàng ${activeShop.name}` });
    expect(action).toHaveClass('admin-icon-btn', 'admin-icon-btn--danger');
    expect(action.querySelector('svg')).not.toBeNull();
    [1, 2, 3, 4, 5, 20].forEach((pageNumber) => {
      expect(screen.getByRole('button', { name: `Trang ${pageNumber}` })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Trang 2' }));
    await screen.findByText(secondPageShop.name);
    expect(api.fetchAdminShops).toHaveBeenLastCalledWith(
      api.authenticatedFetch,
      expect.objectContaining({ page: 2 }),
    );
  });

  it('uses accessible icons for onboarding approval actions', async () => {
    const pendingShop = {
      ...activeShop,
      onboardingStatus: 'PENDING_APPROVAL',
      status: 'INACTIVE',
    };
    api.fetchAdminShops.mockResolvedValue(shopPage([pendingShop]));

    render(<AdminShopsPage />);
    await screen.findByText(pendingShop.name);
    const approve = screen.getByRole('button', { name: `Duyệt cửa hàng ${pendingShop.name}` });
    const reject = screen.getByRole('button', { name: `Từ chối cửa hàng ${pendingShop.name}` });
    expect(approve.querySelector('svg')).not.toBeNull();
    expect(reject.querySelector('svg')).not.toBeNull();
  });
});
