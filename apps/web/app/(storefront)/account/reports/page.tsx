'use client';

import type { ReporterReportSummary } from '@shopee-clone/contracts';
import React, { useCallback, useEffect, useState } from 'react';
import { listMyReports } from '../../../../lib/reporting-api';
import { useAuthSession } from '../../../../components/auth-session-provider';

const REASON_LABELS: Record<string, string> = {
  PROHIBITED_ITEM: 'Hàng cấm kinh doanh / Vi phạm pháp luật',
  COUNTERFEIT: 'Hàng giả / Hàng nhái / Gian lận thương hiệu',
  MISLEADING_INFORMATION: 'Thông tin gây hiểu lầm / Sai lệch',
  INAPPROPRIATE_CONTENT: 'Nội dung phản cảm / Không phù hợp',
  FRAUD_SCAM: 'Lừa đảo / Gian lận thương mại',
  ABUSIVE_BEHAVIOR: 'Hành vi xúc phạm / Quấy rối',
  PROHIBITED_SELLER: 'Người bán bị cấm kinh doanh',
  OTHER: 'Lý do khác',
};

export default function AccountReportsPage() {
  const { state: authState, authenticatedFetch } = useAuthSession();
  const [reports, setReports] = useState<ReporterReportSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchReports = useCallback(async (cursor?: string) => {
    if (authState.status !== 'authenticated') {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await listMyReports(authenticatedFetch, { cursor });
      if (cursor) {
        setReports((prev) => [...prev, ...res.items]);
      } else {
        setReports(res.items);
      }
      setNextCursor(res.nextCursor);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error && error.message ? error.message : 'Không thể tải lịch sử báo cáo');
    } finally {
      setIsLoading(false);
    }
  }, [authState.status, authenticatedFetch]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (authState.status === 'authenticated') {
        void fetchReports();
      } else if (authState.status === 'guest') {
        setIsLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [authState.status, fetchReports]);

  if (authState.status === 'loading') {
    return <div className="mx-auto max-w-4xl px-4 py-12 text-center text-zinc-500">Đang tải tài khoản...</div>;
  }

  if (authState.status === 'guest') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Bạn chưa đăng nhập</h1>
        <p className="mt-2 text-sm text-zinc-500">Vui lòng đăng nhập để xem lịch sử báo cáo của bạn.</p>
        <a
          href="/login?returnTo=/account/reports"
          className="mt-4 inline-block rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700"
        >
          Đăng nhập ngay
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between border-b pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Báo cáo đã gửi</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Theo dõi trạng thái và tiến độ xử lý các báo cáo vi phạm bạn đã gửi.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {isLoading && reports.length === 0 ? (
        <div className="py-12 text-center text-zinc-500">Đang tải danh sách báo cáo...</div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
          <p className="text-zinc-500 dark:text-zinc-400">Bạn chưa gửi báo cáo nào.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {report.targetType === 'PRODUCT' ? 'Sản phẩm' : 'Cửa hàng'}
                    </span>
                    <h2 className="font-semibold text-zinc-900 dark:text-white">
                      {report.targetName}
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Lý do: <span className="font-medium text-zinc-800 dark:text-zinc-200">{REASON_LABELS[report.reasonCode] ?? report.reasonCode.replace(/_/g, ' ')}</span>
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">
                    Mã báo cáo: <span className="font-mono">{report.id}</span> • Ngày gửi:{' '}
                    {new Date(report.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div>
                  {report.status === 'SUBMITTED' ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                      Đang xử lý
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-950/50 dark:text-green-400">
                      Đã duyệt
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {nextCursor && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => fetchReports(nextCursor)}
                disabled={isLoading}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {isLoading ? 'Đang tải...' : 'Xem thêm báo cáo'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
