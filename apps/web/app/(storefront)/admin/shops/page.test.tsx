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

describe('AdminShopsPage paired seller lifecycle feedback', () => {
  beforeEach(() => {
    api.fetchAdminShops.mockReset();
    api.executeAdminShopAction.mockReset();
    api.approveSellerShop.mockReset();
    api.fetchAdminShops.mockResolvedValue({ items: [activeShop], nextCursor: null });
  });

  it('confirms paired suspension and refetches authoritative shop state', async () => {
    const suspendedShop = { ...activeShop, status: 'SUSPENDED' };
    api.executeAdminShopAction.mockResolvedValue(suspendedShop);
    api.fetchAdminShops
      .mockResolvedValueOnce({ items: [activeShop], nextCursor: null })
      .mockResolvedValueOnce({ items: [suspendedShop], nextCursor: null });

    const { container } = render(<AdminShopsPage />);
    await screen.findByText(activeShop.name);
    const suspendButton = container.querySelector('button.admin-btn-danger-outline');
    expect(suspendButton).toBeTruthy();
    fireEvent.click(suspendButton!);

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
    fireEvent.click(container.querySelector('button.admin-btn-danger-outline')!);
    const forms = container.querySelectorAll('form');
    const actionForm = forms[forms.length - 1]!;
    fireEvent.change(actionForm.querySelector('textarea')!, { target: { value: 'short' } });
    fireEvent.submit(actionForm);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.executeAdminShopAction).not.toHaveBeenCalled();
  });
});
