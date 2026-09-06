import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminAuditPage from './page';

const authenticatedFetch = vi.fn();
const fetchAdminAudit = vi.fn();

vi.mock('../../../../components/auth-session-provider', () => ({
  useAuthSession: () => ({ authenticatedFetch }),
}));

vi.mock('../../../../lib/admin-api', () => ({
  fetchAdminAudit: (...args: unknown[]) => fetchAdminAudit(...args),
}));

const reviewId = 'fdb49322-09b3-5e97-b94a-6193ef3957e8';

describe('AdminAuditPage', () => {
  beforeEach(() => {
    fetchAdminAudit.mockReset().mockResolvedValue({
      items: [
        {
          id: 'event-1',
          actorUserId: 'admin-1',
          actorDisplayName: 'Kiểm duyệt viên',
          targetType: 'REVIEW',
          targetId: reviewId,
          targetName: 'Đánh giá sản phẩm',
          action: 'HIDE',
          reason: 'Nội dung vi phạm quy định.',
          beforeSummary: { visibility: 'VISIBLE', name: 'Không thay đổi' },
          afterSummary: { visibility: 'HIDDEN', name: 'Không thay đổi' },
          createdAt: '2026-08-21T03:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
  });

  it('renders a friendly target and a structured before-and-after detail panel', async () => {
    render(<AdminAuditPage />);

    expect(await screen.findByText('Đánh giá sản phẩm')).toBeInTheDocument();
    expect(screen.queryByText(reviewId)).not.toBeInTheDocument();
    expect(screen.getByTitle('Mở quản lý Đánh giá sản phẩm')).toHaveAttribute(
      'href',
      `/admin/moderation?reviewId=${reviewId}`,
    );
    expect(screen.getByTitle('HIDE')).toHaveTextContent('Ẩn đánh giá');

    const detailsButton = screen.getByRole('button', { name: 'Xem thay đổi' });
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(detailsButton);

    expect(
      await screen.findByRole('region', { name: 'Chi tiết thay đổi của Đánh giá' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Trạng thái hiển thị')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị')).toBeInTheDocument();
    expect(screen.getByText('Đã ẩn')).toBeInTheDocument();
    expect(screen.queryByText('Tên')).not.toBeInTheDocument();
    expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('passes the moderation target and action filters to the audit query', async () => {
    render(<AdminAuditPage />);
    await screen.findByText('Đánh giá sản phẩm');

    fireEvent.change(screen.getByLabelText('Lọc theo đối tượng tác động'), {
      target: { value: 'MODERATION_CASE' },
    });
    fireEvent.change(screen.getByLabelText('Lọc theo hành động'), {
      target: { value: 'NO_ACTION' },
    });

    await waitFor(() => {
      expect(fetchAdminAudit).toHaveBeenLastCalledWith(
        authenticatedFetch,
        expect.objectContaining({ targetType: 'MODERATION_CASE', action: 'NO_ACTION' }),
      );
    });
  });
});
