import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportTargetDialog } from './report-target-dialog';
import { submitReport } from '../../lib/reporting-api';

vi.mock('../../lib/reporting-api', async () => {
  const actual = (await vi.importActual('../../lib/reporting-api')) as Record<string, unknown>;
  return { ...actual, submitReport: vi.fn() };
});

const targetId = '123e4567-e89b-12d3-a456-426614174000';
const reportId = '123e4567-e89b-12d3-a456-426614174001';
const fetcher = vi.fn();

function renderDialog() {
  return render(
    <ReportTargetDialog
      targetType="PRODUCT"
      targetId={targetId}
      targetName="Sản phẩm kiểm thử"
      isOpen
      onClose={vi.fn()}
      fetcher={fetcher}
      isAuthenticated
    />,
  );
}

describe('ReportTargetDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => '123e4567-e89b-12d3-a456-426614174002' });
  });

  it('rejects non-HTTPS evidence before sending the report', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByLabelText(/Mô tả chi tiết/),
      'Thông tin mô tả đủ dài để gửi một báo cáo hợp lệ.',
    );
    await user.type(screen.getByLabelText('Link bằng chứng 1'), 'http://example.test/evidence');
    await user.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('https://');
    expect(submitReport).not.toHaveBeenCalled();
  });

  it('submits HTTPS evidence, keeps it out of the URL, and announces a safe receipt', async () => {
    const user = userEvent.setup();
    vi.mocked(submitReport).mockResolvedValue({
      reportId,
      targetType: 'PRODUCT',
      targetId,
      reasonCode: 'COUNTERFEIT',
      status: 'SUBMITTED',
      createdAt: '2026-08-21T00:00:00.000Z',
    });
    renderDialog();

    await user.selectOptions(screen.getByLabelText(/Lý do báo cáo vi phạm/), 'COUNTERFEIT');
    await user.type(
      screen.getByLabelText(/Mô tả chi tiết/),
      'Sản phẩm có dấu hiệu giả mạo và nội dung quảng cáo gây hiểu lầm.',
    );
    await user.type(screen.getByLabelText('Link bằng chứng 1'), 'https://example.test/evidence');
    await user.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    expect(submitReport).toHaveBeenCalledWith(
      fetcher,
      expect.objectContaining({
        targetType: 'PRODUCT',
        targetId,
        reasonCode: 'COUNTERFEIT',
        evidenceUrls: ['https://example.test/evidence'],
      }),
      '123e4567-e89b-12d3-a456-426614174002',
    );
    expect(screen.getByRole('heading', { name: 'Đã gửi báo cáo thành công' })).toBeVisible();
    expect(window.location.search).not.toContain('evidence');
  });
});
