import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthSession } from '../../../../components/auth-session-provider';
import {
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
});
