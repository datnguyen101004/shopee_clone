import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminUsersPage from './page';

const api = vi.hoisted(() => ({
  fetchAdminUsers: vi.fn(),
  executeAdminUserAction: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

vi.mock('../../../../components/auth-session-provider', () => ({
  useAuthSession: () => ({ authenticatedFetch: api.authenticatedFetch }),
}));
vi.mock('../../../../lib/admin-api', () => ({
  fetchAdminUsers: (...args: unknown[]) => api.fetchAdminUsers(...args),
  executeAdminUserAction: (...args: unknown[]) => api.executeAdminUserAction(...args),
}));
const activeSeller = {
  id: '00000000-0000-4000-8000-000000000201',
  email: 'seller@example.test',
  displayName: 'Seller User',
  phoneNumber: null,
  status: 'ACTIVE',
  roles: ['buyer', 'seller'],
  createdAt: '2026-08-25T00:00:00.000Z',
};

describe('AdminUsersPage paired seller lifecycle feedback', () => {
  beforeEach(() => {
    api.fetchAdminUsers.mockReset();
    api.executeAdminUserAction.mockReset();
    api.fetchAdminUsers.mockResolvedValue({ items: [activeSeller], nextCursor: null });
  });

  it('confirms paired account suspension and refetches the account state', async () => {
    const suspendedSeller = { ...activeSeller, status: 'SUSPENDED' };
    api.executeAdminUserAction.mockResolvedValue(suspendedSeller);
    api.fetchAdminUsers
      .mockResolvedValueOnce({ items: [activeSeller], nextCursor: null })
      .mockResolvedValueOnce({ items: [suspendedSeller], nextCursor: null });

    const { container } = render(<AdminUsersPage />);
    await screen.findByText(activeSeller.displayName);
    expect(screen.queryByRole('button', { name: /phân quyền/i })).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('button.admin-btn-danger-outline')!);

    const forms = container.querySelectorAll('form');
    const actionForm = forms[forms.length - 1]!;
    fireEvent.change(actionForm.querySelector('textarea')!, {
      target: { value: 'Policy violation' },
    });
    fireEvent.submit(actionForm);

    await waitFor(() =>
      expect(api.executeAdminUserAction).toHaveBeenCalledWith(
        api.authenticatedFetch,
        activeSeller.id,
        { action: 'SUSPEND', reason: 'Policy violation' },
      ),
    );
    await waitFor(() => expect(api.fetchAdminUsers).toHaveBeenCalledTimes(2));
  });
});
