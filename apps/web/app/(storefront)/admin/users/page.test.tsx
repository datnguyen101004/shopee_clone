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
const userPage = (items: (typeof activeSeller)[], page = 1, totalItems = items.length) => ({
  items,
  page,
  pageSize: 10,
  totalItems,
  totalPages: Math.ceil(totalItems / 10),
});

describe('AdminUsersPage paired seller lifecycle feedback', () => {
  beforeEach(() => {
    api.fetchAdminUsers.mockReset();
    api.executeAdminUserAction.mockReset();
    api.fetchAdminUsers.mockResolvedValue(userPage([activeSeller]));
  });

  it('confirms paired account suspension and refetches the account state', async () => {
    const suspendedSeller = { ...activeSeller, status: 'SUSPENDED' };
    api.executeAdminUserAction.mockResolvedValue(suspendedSeller);
    api.fetchAdminUsers
      .mockResolvedValueOnce(userPage([activeSeller]))
      .mockResolvedValueOnce(userPage([suspendedSeller]));

    const { container } = render(<AdminUsersPage />);
    await screen.findByText(activeSeller.displayName);
    expect(screen.queryByRole('button', { name: /phân quyền/i })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: `Khóa tài khoản ${activeSeller.displayName}` }),
    );

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

  it('uses an icon action and loads the selected numeric page', async () => {
    const secondPageUser = {
      ...activeSeller,
      id: '00000000-0000-4000-8000-000000000202',
      displayName: 'Second Page User',
      email: 'second-page@example.test',
    };
    api.fetchAdminUsers
      .mockResolvedValueOnce(userPage([activeSeller], 1, 200))
      .mockResolvedValueOnce(userPage([secondPageUser], 2, 200));

    const { container } = render(<AdminUsersPage />);
    await screen.findByText(activeSeller.displayName);

    const action = screen.getByRole('button', {
      name: `Khóa tài khoản ${activeSeller.displayName}`,
    });
    expect(action).toHaveClass('admin-icon-btn', 'admin-icon-btn--danger');
    expect(action.querySelector('svg')).not.toBeNull();

    const scroller = container.querySelector<HTMLElement>('.admin-users-table-scroll')!;
    expect(scroller).not.toHaveAttribute('data-overflowing');
    expect(scroller).not.toHaveAttribute('data-scroll-end');
    expect(screen.getAllByText('…')).toHaveLength(1);
    [1, 2, 3, 4, 5, 20].forEach((pageNumber) => {
      expect(screen.getByRole('button', { name: `Trang ${pageNumber}` })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Trang 6' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trang 2' }));
    await screen.findByText(secondPageUser.displayName);
    expect(api.fetchAdminUsers).toHaveBeenLastCalledWith(
      api.authenticatedFetch,
      expect.objectContaining({ page: 2 }),
    );
  });
});
