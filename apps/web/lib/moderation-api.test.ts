import { describe, expect, it, vi } from 'vitest';
import {
  addModerationCaseNote,
  assignModerationCase,
  executeAdminReviewAction,
  getAdminReviewDetail,
  getModerationCaseDetail,
  listAdminReportedReviews,
  listModerationCases,
  makeModerationDecision,
} from './moderation-api';
import {
  getMyReportDetail,
  listMyReports,
  submitReport,
} from './reporting-api';
import {
  listSellerModerationNotices,
  markSellerModerationNoticeRead,
} from './seller-moderation-api';

describe('Moderation and Reporting Frontend API Clients', () => {
  it('submits buyer report correctly', async () => {
    const mockRes = { reportId: '123e4567-e89b-12d3-a456-426614174000', status: 'SUBMITTED' };
    const fetcher = vi.fn().mockResolvedValue(Response.json(mockRes));

    const res = await submitReport(
      fetcher,
      {
        targetType: 'PRODUCT',
        targetId: '123e4567-e89b-12d3-a456-426614174001',
        reasonCode: 'COUNTERFEIT',
        details: 'This product appears to be a fake item with false claims.',
      },
      '123e4567-e89b-12d3-a456-426614174002',
    );

    expect(res).toEqual(mockRes);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('http://localhost:3001/api/v1/reports');
    expect(init?.method).toBe('POST');
    expect(init?.headers?.['Idempotency-Key']).toBe('123e4567-e89b-12d3-a456-426614174002');
  });

  it('lists buyer reports and single report detail', async () => {
    const listRes = { items: [], nextCursor: null };
    const detailRes = { id: 'r-1', status: 'SUBMITTED' };

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(listRes))
      .mockResolvedValueOnce(Response.json(detailRes));

    const list = await listMyReports(fetcher, { limit: 10 });
    expect(list).toEqual(listRes);

    const detail = await getMyReportDetail(fetcher, 'r-1');
    expect(detail).toEqual(detailRes);
  });

  it('handles admin moderation case queue and decision execution', async () => {
    const queueRes = { items: [], nextCursor: null };
    const detailRes = { id: 'case-1', version: 1 };
    const decisionRes = { caseId: 'case-1', outcome: 'SUSPEND_TARGET', version: 2 };

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(queueRes))
      .mockResolvedValueOnce(Response.json(detailRes))
      .mockResolvedValueOnce(Response.json(decisionRes));

    const queue = await listModerationCases(fetcher, {
      status: 'OPEN',
      targetId: '123e4567-e89b-12d3-a456-426614174099',
    });
    expect(queue).toEqual(queueRes);
    expect(String(fetcher.mock.calls[0]![0])).toContain('targetId=123e4567-e89b-12d3-a456-426614174099');

    const detail = await getModerationCaseDetail(fetcher, 'case-1');
    expect(detail).toEqual(detailRes);

    const dec = await makeModerationDecision(
      fetcher,
      'case-1',
      {
        outcome: 'SUSPEND_TARGET',
        publicReason: 'Violation of product quality terms.',
        expectedVersion: 1,
      },
      'idemp-key',
    );
    expect(dec).toEqual(decisionRes);
  });

  it('handles admin reported-review queue, lookup, and hide action', async () => {
    const reportedRes = { items: [{ reviewId: 'rev-1', reportCount: 1 }], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 };
    const reviewRes = { id: 'rev-1', visibility: 'VISIBLE' };
    const actionRes = { reviewId: 'rev-1', visibility: 'HIDDEN', version: 2 };

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(reportedRes))
      .mockResolvedValueOnce(Response.json(reviewRes))
      .mockResolvedValueOnce(Response.json(actionRes));

    const reported = await listAdminReportedReviews(fetcher);
    expect(reported).toEqual(reportedRes);
    expect(String(fetcher.mock.calls[0]![0])).toBe('http://localhost:3001/api/v1/admin/reviews/reported?page=1');

    const review = await getAdminReviewDetail(fetcher, 'rev-1');
    expect(review).toEqual(reviewRes);

    const act = await executeAdminReviewAction(
      fetcher,
      'rev-1',
      {
        action: 'HIDE',
        reason: 'Harassment or hate speech in review text.',
        expectedVersion: 1,
      },
      'idemp-key-rev',
    );
    expect(act).toEqual(actionRes);
  });

  it('lists seller notices and marks notice as read', async () => {
    const noticesRes = { items: [], unreadCount: 0, nextCursor: null };
    const readRes = { noticeId: 'notice-1', readAt: '2026-08-21T12:00:00.000Z' };

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(noticesRes))
      .mockResolvedValueOnce(Response.json(readRes));

    const list = await listSellerModerationNotices(fetcher, { unreadOnly: true });
    expect(list).toEqual(noticesRes);

    const read = await markSellerModerationNoticeRead(fetcher, 'notice-1');
    expect(read).toEqual(readRes);
  });
});
