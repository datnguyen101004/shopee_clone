import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthSession } from '../../../../components/auth-session-provider';
import {
  getModerationCaseDetail,
  listAdminReportedReviews,
  listModerationCases,
} from '../../../../lib/moderation-api';
import AdminModerationPage from './page';

vi.mock('../../../../components/auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('../../../../lib/moderation-api', () => ({
  executeAdminReviewAction: vi.fn(),
  getAdminReviewDetail: vi.fn(),
  getModerationCaseDetail: vi.fn(),
  listAdminReportedReviews: vi.fn(),
  listModerationCases: vi.fn(),
  makeModerationDecision: vi.fn(),
  ModerationApiError: class ModerationApiError extends Error {},
}));

const authenticatedFetch = vi.fn();
const caseSummary = {
  id: '30000000-0000-4000-8000-000000000021',
  targetType: 'PRODUCT',
  targetId: '30000000-0000-4000-8000-000000000022',
  targetName: 'Sản phẩm cần kiểm duyệt',
  targetStatus: 'ACTIVE',
  status: 'OPEN',
  reportCount: 1,
  primaryReasonCode: 'COUNTERFEIT',
  assignedAdminId: null,
  assignedAdminName: null,
  currentOutcome: null,
  version: 0,
  createdAt: '2026-08-21T00:00:00.000Z',
  lastActivityAt: '2026-08-21T00:00:00.000Z',
  resolvedAt: null,
  reporterEmail: 'private@example.test',
} as const;

const chatCase = {
  id: '30000000-0000-4000-8000-000000000031',
  targetType: 'CHAT_MESSAGE',
  targetId: '30000000-0000-4000-8000-000000000032',
  targetName: 'Tài khoản bị báo cáo',
  targetStatus: 'ACTIVE',
  status: 'OPEN',
  reportCount: 2,
  primaryReasonCode: 'ABUSIVE_BEHAVIOR',
  assignedAdminId: null,
  assignedAdminName: null,
  currentOutcome: null,
  version: 0,
  createdAt: '2026-08-21T00:00:00.000Z',
  lastActivityAt: '2026-08-21T00:00:00.000Z',
  resolvedAt: null,
} as const;

describe('AdminModerationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue({
      state: {
        status: 'authenticated',
        user: { id: '30000000-0000-4000-8000-000000000023', roles: ['buyer', 'admin'] },
      },
      authenticatedFetch,
    } as unknown as ReturnType<typeof useAuthSession>);
    vi.mocked(listModerationCases).mockResolvedValue({ items: [caseSummary], nextCursor: null } as never);
    vi.mocked(listAdminReportedReviews).mockResolvedValue({ items: [] } as never);
  });

  it('shows admin-safe queue identifiers without exposing reporter contact data', async () => {
    render(<AdminModerationPage />);

    expect(await screen.findByRole('heading', { name: 'Trung tâm Kiểm duyệt & Tố cáo' })).toBeInTheDocument();
    expect(await screen.findByText(caseSummary.targetId)).toBeInTheDocument();
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument();
  });

  it('blocks a non-admin before any moderation queue request', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: {
        status: 'authenticated',
        user: { id: '30000000-0000-4000-8000-000000000024', roles: ['buyer'] },
      },
      authenticatedFetch,
    } as unknown as ReturnType<typeof useAuthSession>);

    render(<AdminModerationPage />);

    expect(screen.getByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeInTheDocument();
    expect(listModerationCases).not.toHaveBeenCalled();
  });

  it('renders bounded chat evidence and only offers chat-valid decisions', async () => {
    const user = userEvent.setup();
    vi.mocked(listModerationCases).mockResolvedValue({ items: [chatCase], nextCursor: null } as never);
    vi.mocked(getModerationCaseDetail).mockResolvedValue({
      ...chatCase,
      targetDetails: {
        targetType: 'CHAT_MESSAGE',
        id: chatCase.targetId,
        name: chatCase.targetName,
        slug: null,
        currentStatus: 'ACTIVE',
        moderationStatus: 'ACTIVE',
        chat: {
          conversationId: '30000000-0000-4000-8000-000000000033',
          messageId: chatCase.targetId,
          reportedUserId: '30000000-0000-4000-8000-000000000034',
          reportedUserName: 'Người bị báo cáo',
          messages: [{ sequence: 1, senderUserId: '30000000-0000-4000-8000-000000000034', senderLabel: 'Người bị báo cáo', content: 'Nội dung giới hạn', createdAt: '2026-08-21T00:00:00.000Z' }],
        },
      },
      reports: [{ id: '30000000-0000-4000-8000-000000000035', reporterOpaqueId: 'reporter-1', reasonCode: 'ABUSIVE_BEHAVIOR', details: 'Mô tả hành vi', evidenceUrls: [], createdAt: '2026-08-21T00:00:00.000Z' }],
      events: [],
      decisions: [],
    } as never);
    render(<AdminModerationPage />);

    await user.click(await screen.findByRole('button', { name: /Mở hồ sơ Tài khoản bị báo cáo/ }));
    expect(await screen.findByText('Ngữ cảnh chat giới hạn')).toBeInTheDocument();
    expect(screen.getByText('Nội dung giới hạn')).toBeInTheDocument();
    expect(screen.getByText('reporter-1')).toBeInTheDocument();
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Hành động xử lý')).toBeInTheDocument();
    expect(screen.getByText('Hạn chế tạm thời')).toBeInTheDocument();
    expect(screen.queryByText('Đình chỉ')).not.toBeInTheDocument();

    await user.click(screen.getByText('Hạn chế tạm thời'));
    await user.type(screen.getByLabelText(/Lý do công khai/), 'Lý do giới hạn chat hợp lệ');
    await user.type(screen.getByLabelText(/Ghi chú nội bộ/), 'Đã kiểm tra bằng chứng');
    await user.clear(screen.getByLabelText('Mở lại lúc (chỉ áp dụng hạn chế tạm thời)'));
    await user.type(screen.getByLabelText('Mở lại lúc (chỉ áp dụng hạn chế tạm thời)'), '2030-01-01T12:00');
    await user.click(screen.getByRole('button', { name: 'Xác nhận áp dụng quyết định' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('hạn chế chat tạm thời');
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đóng chi tiết hồ sơ' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Mở hồ sơ Tài khoản bị báo cáo/ })).toHaveFocus());
  });

  it('applies an exact-id search across statuses and target types', async () => {
    const user = userEvent.setup();
    render(<AdminModerationPage />);
    const search = screen.getByLabelText('Tìm mã hồ sơ hoặc đối tượng');
    await user.type(search, chatCase.id);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(listModerationCases).toHaveBeenLastCalledWith(authenticatedFetch, expect.objectContaining({ searchId: chatCase.id, status: undefined, targetType: undefined })));
  });
});
