'use client';

import type {
  AdminReportedReviewSummary,
  AdminReviewDetail,
  AdminReviewVisibilityAction,
  ModerationCaseDetail,
  ModerationCaseSummary,
  ModerationDecisionOutcome,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { AdminModerationActionDialog } from '../../../../components/admin/admin-moderation-action-dialog';
import { AdminModerationCaseDetail } from '../../../../components/admin/admin-moderation-case-detail';
import { AdminEntityLink } from '../../../../components/admin/admin-entity-link';
import { AdminPagination } from '../../../../components/admin/admin-pagination';
import { useAuthSession } from '../../../../components/auth-session-provider';
import {
  executeAdminReviewAction,
  getAdminReviewDetail,
  getModerationCaseDetail,
  listAdminReportedReviews,
  listModerationCases,
  makeModerationDecision,
  ModerationApiError,
} from '../../../../lib/moderation-api';

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

Object.assign(REASON_LABELS, {
  ABUSIVE_CONTENT: 'Nội dung xúc phạm hoặc quấy rối',
  IRRELEVANT_CONTENT: 'Nội dung không liên quan tới sản phẩm',
  SPAM_OR_FRAUD: 'Spam, lừa đảo hoặc liên kết đáng ngờ',
});

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Chờ xử lý',
  IN_REVIEW: 'Đang xem xét',
  RESOLVED: 'Đã giải quyết',
};

type Confirmation =
  | { kind: 'decision'; label: string }
  | { kind: 'review'; action: AdminReviewVisibilityAction; label: string };

type ReportTypeFilter = '' | 'CHAT_MESSAGE' | 'SHOP' | 'PRODUCT' | 'REVIEW';
type TimeFilter = '' | 'TODAY' | '7_DAYS' | '30_DAYS';

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function decisionLabel(outcome: ModerationDecisionOutcome): string {
  if (outcome === 'SUSPEND_TARGET') return 'đình chỉ đối tượng';
  if (outcome === 'RESTORE_TARGET') return 'khôi phục đối tượng';
  if (outcome === 'WARN_USER') return 'cảnh cáo người dùng';
  if (outcome === 'RESTRICT_CHAT_TEMPORARY') return 'hạn chế chat tạm thời';
  if (outcome === 'RESTRICT_CHAT_INDEFINITE') return 'hạn chế chat vô thời hạn';
  if (outcome === 'RESTORE_CHAT') return 'mở lại chat';
  return 'kết thúc hồ sơ mà không áp dụng chế tài';
}

function moderationAdminHref(item: ModerationCaseSummary): string {
  if (item.targetType === 'PRODUCT') return `/admin/products/${item.targetId}`;
  if (item.targetType === 'SHOP') return `/admin/shops/${item.targetId}`;
  return `/admin/moderation/${item.id}`;
}

function ModerationActionIcon({ name }: { name: 'details' | 'process' }) {
  if (name === 'details') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 19 6v5c0 4.5-2.8 7.5-7 10-4.2-2.5-7-5.5-7-10V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function matchesTimeFilter(value: string, filter: TimeFilter): boolean {
  if (!filter) return true;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (filter === 'TODAY') {
    const today = new Date();
    const date = new Date(value);
    return today.toDateString() === date.toDateString();
  }
  const days = filter === '7_DAYS' ? 7 : 30;
  return timestamp >= now - days * day;
}

export default function AdminModerationPage({ initialCaseId }: { initialCaseId?: string } = {}) {
  const { authenticatedFetch, state: authState } = useAuthSession();
  const isAdmin = authState.status === 'authenticated' && authState.user.roles.includes('admin');
  const [cases, setCases] = useState<ModerationCaseSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'IN_REVIEW' | 'RESOLVED' | ''>('OPEN');
  const [typeFilter, setTypeFilter] = useState<
    'PRODUCT' | 'SHOP' | 'CHAT_CONVERSATION' | 'CHAT_MESSAGE' | ''
  >('');
  const [reportTypeFilter, setReportTypeFilter] = useState<ReportTypeFilter>('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('');
  const [targetIdSearch, setTargetIdSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [caseDetail, setCaseDetail] = useState<ModerationCaseDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [decisionOutcome, setDecisionOutcome] =
    useState<ModerationDecisionOutcome>('SUSPEND_TARGET');
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionPrivateNote, setDecisionPrivateNote] = useState('');
  const [restrictionUntil, setRestrictionUntil] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [lookupReviewId, setLookupReviewId] = useState('');
  const [reviewDetail, setReviewDetail] = useState<AdminReviewDetail | null>(null);
  const [reviewAction, setReviewAction] = useState<AdminReviewVisibilityAction>('HIDE');
  const [reviewActionReason, setReviewActionReason] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [reportedReviews, setReportedReviews] = useState<AdminReportedReviewSummary[]>([]);
  const [reportedReviewPage, setReportedReviewPage] = useState(1);
  const [reportedReviewTotalItems, setReportedReviewTotalItems] = useState(0);
  const [reportedReviewTotalPages, setReportedReviewTotalPages] = useState(0);
  const [isLoadingReportedReviews, setIsLoadingReportedReviews] = useState(false);
  const [reportedReviewsError, setReportedReviewsError] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<'case' | 'review' | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const confirmationButtonRef = useRef<HTMLButtonElement>(null);
  const isDetailRoute = Boolean(initialCaseId);

  const fetchCases = useCallback(
    async (targetPage = 1) => {
      setIsLoadingList(true);
      setQueueError(null);
      try {
        const selectedTargetType =
          reportTypeFilter && reportTypeFilter !== 'REVIEW' ? reportTypeFilter : typeFilter;
        const response = await listModerationCases(authenticatedFetch, {
          status: statusFilter || undefined,
          targetType: selectedTargetType || undefined,
          page: targetPage,
        });
        const lastPage = Math.max(1, response.totalPages);
        if (targetPage > lastPage) { setCurrentPage(lastPage); return; }
        setCases(response.items);
        setCurrentPage(response.page);
        setTotalItems(response.totalItems);
        setTotalPages(response.totalPages);
      } catch (error) {
        setQueueError(messageFrom(error, 'Không thể tải hàng đợi kiểm duyệt.'));
      } finally {
        setIsLoadingList(false);
      }
    },
    [authenticatedFetch, reportTypeFilter, statusFilter, typeFilter],
  );

  const loadCaseDetail = useCallback(
    async (caseId: string, preserveDrafts = false) => {
      setIsLoadingDetail(true);
      setActionError(null);
      try {
        const detail = await getModerationCaseDetail(authenticatedFetch, caseId);
        setCaseDetail(detail);
        if (!preserveDrafts) {
          setDecisionOutcome(
            detail.targetType === 'CHAT_CONVERSATION' || detail.targetType === 'CHAT_MESSAGE'
              ? 'NO_ACTION'
              : detail.targetStatus === 'SUSPENDED'
                ? 'RESTORE_TARGET'
                : 'SUSPEND_TARGET',
          );
          setDecisionReason('');
          setDecisionPrivateNote('');
          setRestrictionUntil('');
        }
        return detail;
      } catch (error) {
        setActionError(messageFrom(error, 'Không thể tải chi tiết hồ sơ kiểm duyệt.'));
        return null;
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [authenticatedFetch],
  );

  const openCaseAction = async (caseId?: string) => {
    const requestedId = caseId ?? initialCaseId;
    if (!requestedId) return;
    const detail = caseDetail?.id === requestedId ? caseDetail : await loadCaseDetail(requestedId);
    if (detail?.id === requestedId) setActionDialog('case');
  };

  const loadReportedReviews = useCallback(async (targetPage = 1) => {
    setIsLoadingReportedReviews(true);
    setReportedReviewsError(null);
    try {
      const response = await listAdminReportedReviews(authenticatedFetch, targetPage);
      const lastPage = Math.max(1, response.totalPages);
      if (targetPage > lastPage) {
        setReportedReviewPage(lastPage);
        return;
      }
      setReportedReviews(response.items);
      setReportedReviewPage(response.page);
      setReportedReviewTotalItems(response.totalItems);
      setReportedReviewTotalPages(response.totalPages);
    } catch (error) {
      setReportedReviewsError(
        messageFrom(error, 'Không thể tải danh sách đánh giá được người bán báo cáo.'),
      );
    } finally {
      setIsLoadingReportedReviews(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (isAdmin && !initialCaseId && reportTypeFilter !== 'REVIEW') void fetchCases(currentPage);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [currentPage, fetchCases, initialCaseId, isAdmin, reportTypeFilter]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (isAdmin && !initialCaseId && reportTypeFilter === 'REVIEW') void loadReportedReviews(reportedReviewPage);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [initialCaseId, isAdmin, loadReportedReviews, reportTypeFilter, reportedReviewPage]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (isAdmin && initialCaseId) void loadCaseDetail(initialCaseId);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [initialCaseId, isAdmin, loadCaseDetail]);

  useEffect(() => {
    if (confirmation) confirmationButtonRef.current?.focus();
  }, [confirmation]);

  const refreshAfterConflict = useCallback(
    async (caseId: string, error: unknown) => {
      if (error instanceof ModerationApiError && error.status === 409) {
        await loadCaseDetail(caseId, true);
        setActionError(
          'Hồ sơ đã thay đổi ở phiên khác. Dữ liệu mới đã được tải; nội dung bạn soạn vẫn được giữ lại.',
        );
        return;
      }
      setActionError(messageFrom(error, 'Không thể cập nhật hồ sơ kiểm duyệt.'));
    },
    [loadCaseDetail],
  );

  const openDecisionConfirmation = (trigger: HTMLButtonElement | null) => {
    if (!caseDetail) return;
    const trimmedReason = decisionReason.trim();
    if (trimmedReason.length < 8 || trimmedReason.length > 240) {
      setActionError('Lý do công khai phải dài từ 8 đến 240 ký tự.');
      return;
    }
    if (decisionOutcome === 'RESTRICT_CHAT_TEMPORARY' && !restrictionUntil) {
      setActionError('Vui lòng chọn ngày mở lại chat.');
      return;
    }
    if (
      ['WARN_USER', 'RESTRICT_CHAT_TEMPORARY', 'RESTRICT_CHAT_INDEFINITE', 'RESTORE_CHAT'].includes(
        decisionOutcome,
      ) &&
      decisionPrivateNote.trim().length < 8
    ) {
      setActionError('Các quyết định chat cần ghi chú nội bộ ít nhất 8 ký tự.');
      return;
    }
    confirmationTriggerRef.current =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setConfirmation({
      kind: 'decision',
      label: `Xác nhận ${decisionLabel(decisionOutcome)} cho ${caseDetail.targetName}`,
    });
  };

  const performDecision = async () => {
    if (!caseDetail) return;
    setIsMutating(true);
    setActionError(null);
    try {
      const priorSuspension = caseDetail.decisions.find(
        (decision) => decision.outcome === 'SUSPEND_TARGET',
      );
      await makeModerationDecision(
        authenticatedFetch,
        caseDetail.id,
        {
          outcome: decisionOutcome,
          publicReason: decisionReason.trim(),
          privateNote: decisionPrivateNote.trim() || undefined,
          ...(decisionOutcome === 'RESTORE_TARGET' && priorSuspension
            ? { reversesDecisionId: priorSuspension.id }
            : {}),
          ...(decisionOutcome === 'RESTRICT_CHAT_TEMPORARY'
            ? { restrictionUntil: new Date(restrictionUntil).toISOString() }
            : {}),
          expectedVersion: caseDetail.version,
        },
        crypto.randomUUID(),
      );
      setConfirmation(null);
      setDecisionReason('');
      setDecisionPrivateNote('');
      setRestrictionUntil('');
      setStatusMessage('Quyết định kiểm duyệt đã được ghi nhận.');
      setActionDialog(null);
      await loadCaseDetail(caseDetail.id);
      if (!initialCaseId) await fetchCases();
    } catch (error) {
      setConfirmation(null);
      await refreshAfterConflict(caseDetail.id, error);
    } finally {
      setIsMutating(false);
    }
  };

  const loadReviewDetail = async (reviewId: string) => {
    const normalizedId = reviewId.trim();
    if (!normalizedId) return null;
    setIsLoadingReview(true);
    setReviewError(null);
    try {
      const detail = await getAdminReviewDetail(authenticatedFetch, normalizedId);
      setReviewDetail(detail);
      return detail;
    } catch (error) {
      setReviewDetail(null);
      if (error instanceof ModerationApiError && error.status === 404) {
        setReviewError('Không tìm thấy đánh giá với mã này.');
      } else if (error instanceof ModerationApiError && error.status === 400) {
        setReviewError('Mã đánh giá phải là UUID hợp lệ.');
      } else {
        setReviewError(messageFrom(error, 'Không thể tra cứu đánh giá. Vui lòng thử lại.'));
      }
    } finally {
      setIsLoadingReview(false);
    }
  };

  const openReviewAction = async (reviewId: string) => {
    const detail = await loadReviewDetail(reviewId);
    if (detail) {
      setReviewAction(detail.visibility === 'VISIBLE' ? 'HIDE' : 'RESTORE');
      setReviewActionReason('');
      setActionDialog('review');
    }
  };

  const handleLookupReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadReviewDetail(lookupReviewId);
  };

  const openReviewConfirmation = (
    action: AdminReviewVisibilityAction,
    trigger: HTMLButtonElement | null,
  ) => {
    if (!reviewDetail) return;
    if (reviewActionReason.trim().length < 8 || reviewActionReason.trim().length > 240) {
      setReviewError('Lý do kiểm duyệt phải dài từ 8 đến 240 ký tự.');
      return;
    }
    confirmationTriggerRef.current = trigger;
    setConfirmation({
      kind: 'review',
      action,
      label: `Xác nhận ${action === 'HIDE' ? 'ẩn' : action === 'RESTORE' ? 'khôi phục' : 'giữ nguyên hiển thị'} đánh giá của ${reviewDetail.authorDisplayName}`,
    });
  };

  const performReviewAction = async (action: AdminReviewVisibilityAction) => {
    if (!reviewDetail) return;
    setIsLoadingReview(true);
    setReviewError(null);
    try {
      await executeAdminReviewAction(
        authenticatedFetch,
        reviewDetail.id,
        {
          action,
          reason: reviewActionReason.trim(),
          expectedVersion: reviewDetail.version,
        },
        crypto.randomUUID(),
      );
      const updated = await getAdminReviewDetail(authenticatedFetch, reviewDetail.id);
      setReviewDetail(updated);
      setReviewActionReason('');
      setActionDialog(null);
      setStatusMessage(
        action === 'HIDE'
          ? 'Đánh giá đã được ẩn và số liệu đã được làm mới.'
          : action === 'RESTORE'
            ? 'Đánh giá đã được khôi phục.'
            : 'Đã giữ nguyên hiển thị và đóng các báo cáo của người bán.',
      );
      await loadReportedReviews(reportedReviewPage);
    } catch (error) {
      setReviewError(messageFrom(error, 'Không thể cập nhật trạng thái đánh giá.'));
    } finally {
      setConfirmation(null);
      setIsLoadingReview(false);
    }
  };

  const confirmAction = () => {
    if (!confirmation) return;
    if (confirmation.kind === 'decision') void performDecision();
    else void performReviewAction(confirmation.action);
  };

  const closeConfirmation = () => {
    setConfirmation(null);
    requestAnimationFrame(() => confirmationTriggerRef.current?.focus());
  };

  const clearTargetIdSearch = () => { setTargetIdSearch(''); setCurrentPage(1); setReportedReviewPage(1); };

  if (authState.status === 'loading') {
    return (
      <p className="admin-moderation-container" role="status">
        Đang kiểm tra quyền quản trị…
      </p>
    );
  }

  if (authState.status === 'guest') {
    return (
      <section className="admin-moderation-container" aria-labelledby="moderation-auth-title">
        <h1 id="moderation-auth-title">Cần đăng nhập</h1>
        <p>Đăng nhập bằng tài khoản quản trị để mở trung tâm kiểm duyệt.</p>
        <Link href="/login?returnTo=/admin/moderation">Đăng nhập</Link>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="admin-moderation-container" aria-labelledby="moderation-forbidden-title">
        <h1 id="moderation-forbidden-title">Bạn không có quyền truy cập</h1>
        <p>Trung tâm kiểm duyệt chỉ dành cho quản trị viên được ủy quyền.</p>
      </section>
    );
  }

  const searchQuery = targetIdSearch.trim().toLocaleLowerCase('vi-VN');
  const visibleCases = cases.filter((item) => {
    if (!matchesTimeFilter(item.createdAt, timeFilter)) return false;
    if (!searchQuery) return true;
    return [
      item.id,
      item.targetId,
      item.targetName,
      item.primaryReasonCode,
      REASON_LABELS[item.primaryReasonCode] ?? '',
      STATUS_LABELS[item.status] ?? '',
    ].some((value) => value.toLocaleLowerCase('vi-VN').includes(searchQuery));
  });
  const visibleReviews = reportedReviews.filter((review) => {
    if (!matchesTimeFilter(review.latestReportedAt, timeFilter)) return false;
    if (!searchQuery) return true;
    return [
      review.reviewId,
      review.productId,
      review.shopId,
      review.productName,
      review.shopName,
    ].some((value) => value.toLocaleLowerCase('vi-VN').includes(searchQuery));
  });

  return (
    <main
      className="admin-page admin-moderation-container"
      aria-label="Trung tâm kiểm duyệt và tố cáo"
    >
      {!isDetailRoute ? (
        <div className="admin-toolbar admin-moderation-toolbar" role="search">
          <div className="admin-field admin-moderation-toolbar__search">
            <label htmlFor="moderation-report-search">Tìm report hoặc đối tượng</label>
            <div className="admin-target-search__field">
              <input
                id="moderation-report-search"
                className="admin-form-input admin-control"
                value={targetIdSearch}
                onChange={(event) => { setTargetIdSearch(event.target.value); setCurrentPage(1); setReportedReviewPage(1); }}
                placeholder="Mã report, sản phẩm, shop hoặc đánh giá"
              />
              {targetIdSearch ? (
                <button
                  type="button"
                  className="admin-target-search__clear"
                  aria-label="Xóa tìm kiếm"
                  onClick={clearTargetIdSearch}
                  disabled={isLoadingList}
                >
                  ×
                </button>
              ) : null}
              <svg
                className="admin-target-search__icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
            </div>
          </div>
          <div className="admin-field">
            <label htmlFor="moderation-report-type">Loại report</label>
            <select
              id="moderation-report-type"
              className="admin-control"
              value={reportTypeFilter}
              onChange={(event) => { setReportTypeFilter(event.target.value as ReportTypeFilter); setCurrentPage(1); setReportedReviewPage(1); }}
            >
              <option value="">Tất cả loại report</option>
              <option value="CHAT_MESSAGE">Tin nhắn</option>
              <option value="SHOP">Shop</option>
              <option value="PRODUCT">Sản phẩm</option>
              <option value="REVIEW">Đánh giá</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="moderation-report-status">Trạng thái</label>
            <select
              id="moderation-report-status"
              className="admin-control"
              value={statusFilter}
              onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setCurrentPage(1); }}
            >
              <option value="OPEN">Chờ xử lý</option>
              <option value="IN_REVIEW">Đang xem xét</option>
              <option value="RESOLVED">Đã giải quyết</option>
              <option value="">Tất cả trạng thái</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="moderation-report-object">Đối tượng</label>
            <select
              id="moderation-report-object"
              className="admin-control"
              value={typeFilter}
              onChange={(event) => { setTypeFilter(event.target.value as typeof typeFilter); setCurrentPage(1); }}
            >
              <option value="">Tất cả đối tượng</option>
              <option value="PRODUCT">Sản phẩm</option>
              <option value="SHOP">Shop</option>
              <option value="CHAT_CONVERSATION">Cuộc trò chuyện</option>
              <option value="CHAT_MESSAGE">Tin nhắn</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="moderation-report-time">Thời gian</label>
            <select
              id="moderation-report-time"
              className="admin-control"
              value={timeFilter}
              onChange={(event) => { setTimeFilter(event.target.value as TimeFilter); setCurrentPage(1); setReportedReviewPage(1); }}
            >
              <option value="">Tất cả thời gian</option>
              <option value="TODAY">Hôm nay</option>
              <option value="7_DAYS">7 ngày qua</option>
              <option value="30_DAYS">30 ngày qua</option>
            </select>
          </div>
        </div>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {!isDetailRoute && reportTypeFilter !== 'REVIEW' ? (
        <section
          id="moderation-reports-panel"
          className="admin-moderation-workspace"
          aria-label="Danh sách report cần xử lý"
        >
          <section
            className="admin-table-card admin-moderation-list-card"
            aria-label="Bảng report cần xử lý"
          >
            <div className="admin-table-card__header">
              <div>
                <h2>Đối tượng được báo cáo</h2>
                <p>Quản lý tin nhắn, shop và sản phẩm theo trạng thái report.</p>
              </div>
              <span className="admin-table-card__count">Đã tải {visibleCases.length} report</span>
            </div>
            {queueError ? (
              <p role="alert" className="admin-inline-error">
                {queueError}
              </p>
            ) : null}
            {isLoadingList && cases.length === 0 ? (
              <p role="status">Đang tải danh sách hồ sơ…</p>
            ) : null}
            {!isLoadingList && !queueError && visibleCases.length === 0 ? (
              <p role="status">Không có report nào phù hợp bộ lọc.</p>
            ) : null}
            {visibleCases.length > 0 ? (
              <div className="admin-table-scroll">
                <table className="admin-data-table admin-management-table admin-moderation-table">
                  <thead>
                    <tr>
                      <th className="management-table-id-cell">ID</th>
                      <th>Loại report</th>
                      <th>Đối tượng</th>
                      <th>Báo cáo</th>
                      <th>Trạng thái</th>
                      <th>Cập nhật</th>
                      <th className="admin-table-cell--actions">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCases.map((item) => (
                      <tr key={item.id}>
                        <td className="management-table-id-cell">{item.id}</td>
                        <td>
                          <span
                            className={`admin-badge ${item.targetType === 'PRODUCT' ? 'admin-badge--product' : item.targetType === 'SHOP' ? 'admin-badge--shop' : 'admin-badge--chat'}`}
                          >
                            {item.targetType === 'PRODUCT'
                              ? 'Sản phẩm'
                              : item.targetType === 'SHOP'
                                ? 'Shop'
                                : item.targetType === 'CHAT_MESSAGE'
                                  ? 'Tin nhắn'
                                  : 'Cuộc trò chuyện'}
                          </span>
                        </td>
                        <td>
                          <AdminEntityLink
                            href={moderationAdminHref(item)}
                            name={item.targetName}
                            imageUrl={item.targetImageUrl}
                            meta={
                              item.targetType === 'PRODUCT'
                                ? 'Sản phẩm'
                                : item.targetType === 'SHOP'
                                  ? 'Shop'
                                  : 'Nội dung chat'
                            }
                          />
                        </td>
                        <td>
                          <strong className="admin-table-primary">
                            {item.reportCount} báo cáo
                          </strong>
                          <small className="admin-table-subtext">
                            {REASON_LABELS[item.primaryReasonCode] ?? item.primaryReasonCode}
                          </small>
                        </td>
                        <td>
                          <span
                            className={`admin-badge ${item.status === 'RESOLVED' ? 'admin-badge--resolved' : item.status === 'IN_REVIEW' ? 'admin-badge--inreview' : 'admin-badge--open'}`}
                          >
                            {STATUS_LABELS[item.status]}
                          </span>
                        </td>
                        <td>
                          <time dateTime={item.lastActivityAt}>
                            {new Date(item.lastActivityAt).toLocaleString('vi-VN')}
                          </time>
                        </td>
                        <td className="admin-table-cell--actions">
                          <div className="admin-table-actions">
                            <Link
                              href={`/admin/moderation/${item.id}`}
                              className="admin-icon-btn admin-icon-btn--secondary"
                              aria-label={`Mở hồ sơ ${item.targetName}`}
                              title="Xem chi tiết"
                            >
                              <ModerationActionIcon name="details" />
                            </Link>
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn--primary"
                              aria-label={`Xử lý report ${item.targetName}`}
                              title="Xử lý report"
                              onClick={() => void openCaseAction(item.id)}
                            >
                              <ModerationActionIcon name="process" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <AdminPagination itemLabel="report" page={currentPage} totalItems={totalItems} totalPages={totalPages} disabled={isLoadingList} onPageChange={setCurrentPage} />
          </section>
        </section>
      ) : !isDetailRoute ? (
        <section
          id="moderation-review-reports-panel"
          className="admin-moderation-workspace"
          aria-label="Report đánh giá"
        >
          <section
            className="admin-table-card admin-moderation-list-card"
            aria-labelledby="reported-reviews-title"
          >
            <div className="admin-table-card__header">
              <div>
                <h2 id="reported-reviews-title">Report đánh giá ({visibleReviews.length})</h2>
                <p>Quản lý đánh giá bị báo cáo theo trạng thái và thời gian.</p>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => void loadReportedReviews(reportedReviewPage)}
                disabled={isLoadingReportedReviews}
              >
                {isLoadingReportedReviews ? 'Đang tải…' : 'Làm mới'}
              </button>
            </div>
            {reportedReviewsError ? (
              <p className="admin-inline-error" role="alert">
                {reportedReviewsError}
              </p>
            ) : null}
            {isLoadingReportedReviews && reportedReviews.length === 0 ? (
              <p role="status">Đang tải report đánh giá…</p>
            ) : null}
            {!isLoadingReportedReviews && !reportedReviewsError && visibleReviews.length === 0 ? (
              <p className="admin-reported-review-queue__empty">
                Chưa có report đánh giá nào phù hợp bộ lọc.
              </p>
            ) : null}
            {visibleReviews.length > 0 ? (
              <div className="admin-table-scroll">
                <table className="admin-data-table admin-management-table admin-moderation-table">
                  <thead>
                    <tr>
                      <th className="management-table-id-cell">ID</th>
                      <th>Sản phẩm</th>
                      <th>Shop</th>
                      <th>Đánh giá</th>
                      <th>Trạng thái</th>
                      <th>Report gần nhất</th>
                      <th className="admin-table-cell--actions">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReviews.map((review) => (
                      <tr
                        key={review.reviewId}
                        className={
                          reviewDetail?.id === review.reviewId
                            ? 'admin-moderation-table__row--selected'
                            : undefined
                        }
                      >
                        <td className="management-table-id-cell">{review.reviewId}</td>
                        <td>
                          <AdminEntityLink
                            href={`/admin/products/${review.productId}`}
                            name={review.productName}
                            imageUrl={review.productImageUrl}
                            meta="Sản phẩm"
                          />
                        </td>
                        <td>
                          <AdminEntityLink
                            href={`/admin/shops/${review.shopId}`}
                            name={review.shopName}
                            imageUrl={review.shopLogoUrl}
                            meta="Shop"
                          />
                        </td>
                        <td>
                          <strong className="admin-table-primary">{review.rating} sao</strong>
                          <small className="admin-table-subtext">
                            {review.reportCount} báo cáo
                          </small>
                        </td>
                        <td>
                          <span
                            className={`admin-badge admin-table-status ${review.visibility === 'VISIBLE' ? 'admin-badge--success' : 'admin-badge--danger'}`}
                          >
                            {review.visibility === 'VISIBLE' ? 'Đang hiển thị' : 'Đã ẩn'}
                          </span>
                        </td>
                        <td>
                          <time dateTime={review.latestReportedAt}>
                            {new Date(review.latestReportedAt).toLocaleString('vi-VN')}
                          </time>
                        </td>
                        <td className="admin-table-cell--actions">
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn--secondary"
                              aria-label={`Mở report đánh giá ${review.productName}`}
                              title="Xem chi tiết"
                              onClick={() => {
                                setLookupReviewId(review.reviewId);
                                void loadReviewDetail(review.reviewId);
                              }}
                            >
                              <ModerationActionIcon name="details" />
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn--primary"
                              aria-label={`Xử lý report đánh giá ${review.productName}`}
                              title="Xử lý report"
                              onClick={() => void openReviewAction(review.reviewId)}
                            >
                              <ModerationActionIcon name="process" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <AdminPagination
              itemLabel="report đánh giá"
              page={reportedReviewPage}
              totalItems={reportedReviewTotalItems}
              totalPages={reportedReviewTotalPages}
              disabled={isLoadingReportedReviews}
              onPageChange={setReportedReviewPage}
            />
          </section>
          <section
            className="admin-review-panel admin-moderation-review-panel admin-moderation-detail-section"
            aria-label="Chi tiết report đánh giá"
          >
            <h3 className="admin-review-lookup__title">Tra cứu thủ công</h3>
            <form onSubmit={handleLookupReview} className="admin-review-lookup">
              <label htmlFor="review-id">Mã đánh giá</label>
              <input
                id="review-id"
                className="admin-form-input"
                value={lookupReviewId}
                onChange={(event) => setLookupReviewId(event.target.value)}
                placeholder="UUID đánh giá"
              />
              <button type="submit" className="admin-btn-action" disabled={isLoadingReview}>
                {isLoadingReview ? 'Đang tìm…' : 'Tra cứu'}
              </button>
            </form>
            {reviewError ? (
              <p className="admin-inline-error" role="alert">
                {reviewError}
              </p>
            ) : null}
            {reviewDetail ? (
              <article className="admin-review-detail" aria-labelledby="review-detail-title">
                <h3 id="review-detail-title">Đánh giá trên sản phẩm</h3>
                <AdminEntityLink
                  href={`/admin/products/${reviewDetail.productId}`}
                  name={reviewDetail.productName}
                  imageUrl={reviewDetail.productImageUrl}
                  meta="Sản phẩm"
                />
                <p>
                  Người đánh giá:{' '}
                  <AdminEntityLink
                    href={`/admin/users/${reviewDetail.authorUserId}`}
                    name={reviewDetail.authorDisplayName}
                    meta="Người dùng"
                  />{' '}
                  · {reviewDetail.rating} sao · Trạng thái:{' '}
                  {reviewDetail.visibility === 'VISIBLE' ? 'Hiển thị' : 'Đang ẩn'}
                </p>
                <blockquote>{reviewDetail.comment ?? 'Không có nội dung nhận xét.'}</blockquote>
                {reviewDetail.sellerReportCount > 0 ? (
                  <section
                    className="admin-review-report-context"
                    aria-labelledby="seller-report-context-title"
                  >
                    <h4 id="seller-report-context-title">
                      Ngữ cảnh báo cáo từ người bán ({reviewDetail.sellerReportCount})
                    </h4>
                    <p>
                      Chỉ hiển thị lý do và mô tả cần thiết cho quyết định; không hiển thị danh tính
                      người bán.
                    </p>
                    <ul>
                      {reviewDetail.sellerReports.map((report) => (
                        <li key={report.id}>
                          <span className="font-medium">
                            {REASON_LABELS[report.reasonCode] ?? report.reasonCode}
                          </span>
                          {report.details ? <span> — {report.details}</span> : null}
                          <small>{new Date(report.createdAt).toLocaleString('vi-VN')}</small>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                <div className="admin-detail-action-row">
                  <div>
                    <h4>Ra quyết định</h4>
                    <p>Chọn hành động và ghi lý do trong popup xử lý.</p>
                  </div>
                  <button
                    type="button"
                    className="admin-btn admin-btn-primary"
                    onClick={() => void openReviewAction(reviewDetail.id)}
                    disabled={isLoadingReview}
                  >
                    Xử lý report
                  </button>
                </div>
              </article>
            ) : null}
          </section>
        </section>
      ) : null}

      {isDetailRoute ? (
        <section className="admin-moderation-detail-route" aria-live="polite">
          <AdminModerationCaseDetail
            detail={caseDetail}
            isLoading={isLoadingDetail}
            actionError={actionError}
            isMutating={isMutating}
            reasonLabels={REASON_LABELS}
            backHref="/admin/moderation"
            onOpenAction={() => void openCaseAction()}
          />
        </section>
      ) : null}

      {actionDialog === 'case' && caseDetail ? (
        <AdminModerationActionDialog
          kind="case"
          detail={caseDetail}
          outcome={decisionOutcome}
          reason={decisionReason}
          privateNote={decisionPrivateNote}
          restrictionUntil={restrictionUntil}
          error={actionError}
          isSubmitting={isMutating}
          onOutcomeChange={setDecisionOutcome}
          onReasonChange={setDecisionReason}
          onPrivateNoteChange={setDecisionPrivateNote}
          onRestrictionUntilChange={setRestrictionUntil}
          onSubmit={openDecisionConfirmation}
          onClose={() => setActionDialog(null)}
        />
      ) : null}

      {actionDialog === 'review' && reviewDetail ? (
        <AdminModerationActionDialog
          kind="review"
          detail={reviewDetail}
          action={reviewAction}
          reason={reviewActionReason}
          error={reviewError}
          isSubmitting={isLoadingReview}
          onActionChange={setReviewAction}
          onReasonChange={setReviewActionReason}
          onSubmit={(trigger) => openReviewConfirmation(reviewAction, trigger)}
          onClose={() => setActionDialog(null)}
        />
      ) : null}

      {confirmation ? (
        <div className="admin-confirmation-overlay" role="presentation">
          <section
            className="admin-confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="moderation-confirmation-title"
            aria-describedby="moderation-confirmation-description"
          >
            <h2 id="moderation-confirmation-title">Xác nhận hành động</h2>
            <p id="moderation-confirmation-description">
              {confirmation.label}. Thao tác này sẽ ghi lịch sử kiểm duyệt không thể sửa.
            </p>
            <div className="admin-confirmation-actions">
              <button
                type="button"
                className="admin-btn-action"
                onClick={closeConfirmation}
                disabled={isMutating}
              >
                Hủy
              </button>
              <button
                ref={confirmationButtonRef}
                type="button"
                className="admin-btn-action admin-btn-action--danger"
                onClick={confirmAction}
                disabled={isMutating}
              >
                {isMutating ? 'Đang thực hiện…' : 'Xác nhận'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
