import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthSession } from '../../../../components/auth-session-provider';
import { listMyReports } from '../../../../lib/reporting-api';
import AccountReportsPage from './page';

vi.mock('../../../../components/auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('../../../../lib/reporting-api', () => ({ listMyReports: vi.fn() }));

const authenticatedFetch = vi.fn();
const report = {
  id: '30000000-0000-4000-8000-000000000001',
  targetType: 'PRODUCT',
  targetName: 'Sản phẩm bị báo cáo',
  reasonCode: 'COUNTERFEIT',
  status: 'SUBMITTED',
  createdAt: '2026-08-21T00:00:00.000Z',
  caseId: 'private-case-id',
  evidenceUrls: ['https://private.example/evidence'],
} as const;

describe('AccountReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue({
      state: {
        status: 'authenticated',
        user: { id: '30000000-0000-4000-8000-000000000002', roles: ['buyer'] },
      },
      authenticatedFetch,
    } as unknown as ReturnType<typeof useAuthSession>);
  });

  it('keeps a reporter-safe history projection and supports cursor pagination', async () => {
    const user = userEvent.setup();
    vi.mocked(listMyReports)
      .mockResolvedValueOnce({ items: [report], nextCursor: 'next-page' } as never)
      .mockResolvedValueOnce({ items: [], nextCursor: null } as never);

    render(<AccountReportsPage />);

    expect(await screen.findByRole('heading', { name: 'Báo cáo đã gửi' })).toBeInTheDocument();
    expect(screen.getByText('Sản phẩm bị báo cáo')).toBeInTheDocument();
    expect(screen.queryByText('private-case-id')).not.toBeInTheDocument();
    expect(screen.queryByText('https://private.example/evidence')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xem thêm báo cáo' }));
    await waitFor(() => expect(listMyReports).toHaveBeenLastCalledWith(authenticatedFetch, { cursor: 'next-page' }));
  });

  it('does not load private history for a guest', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'guest', user: null },
      authenticatedFetch,
    } as unknown as ReturnType<typeof useAuthSession>);

    render(<AccountReportsPage />);

    expect(screen.getByRole('link', { name: 'Đăng nhập ngay' })).toHaveAttribute(
      'href',
      '/login?returnTo=/account/reports',
    );
    expect(listMyReports).not.toHaveBeenCalled();
  });
});
