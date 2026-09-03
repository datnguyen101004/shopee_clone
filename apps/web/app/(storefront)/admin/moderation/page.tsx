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

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function safeHttpsHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function targetHref(detail: ModerationCaseDetail): string | null {
  if (detail.targetType === 'PRODUCT') return `/products/${detail.targetId}`;
  if (detail.targetType === 'CHAT_CONVERSATION' || detail.targetType === 'CHAT_MESSAGE') return null;
  return detail.targetDetails.slug ? `/shops/${encodeURIComponent(detail.targetDetails.slug)}` : null;
}

function summaryTargetHref(item: ModerationCaseSummary): string | null {
  return item.targetType === 'PRODUCT' ? `/products/${item.targetId}` : null;
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

export default function AdminModerationPage() {
  const { authenticatedFetch, state: authState } = useAuthSession();
  const isAdmin =
    authState.status === 'authenticated' && authState.user.roles.includes('admin');
  const [activeTab, setActiveTab] = useState<'cases' | 'reviews'>('cases');
  const [cases, setCases] = useState<ModerationCaseSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'IN_REVIEW' | 'RESOLVED' | ''>('OPEN');
  const [typeFilter, setTypeFilter] = useState<'PRODUCT' | 'SHOP' | 'CHAT_CONVERSATION' | 'CHAT_MESSAGE' | ''>('');
  const [targetIdSearch, setTargetIdSearch] = useState('');
  const [targetIdFilter, setTargetIdFilter] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDetail, setCaseDetail] = useState<ModerationCaseDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [decisionOutcome, setDecisionOutcome] = useState<ModerationDecisionOutcome>('SUSPEND_TARGET');
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionPrivateNote, setDecisionPrivateNote] = useState('');
  const [restrictionUntil, setRestrictionUntil] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [lookupReviewId, setLookupReviewId] = useState('');
  const [reviewDetail, setReviewDetail] = useState<AdminReviewDetail | null>(null);
  const [reviewActionReason, setReviewActionReason] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [reportedReviews, setReportedReviews] = useState<AdminReportedReviewSummary[]>([]);
  const [isLoadingReportedReviews, setIsLoadingReportedReviews] = useState(false);
  const [reportedReviewsError, setReportedReviewsError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const decisionButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const confirmationButtonRef = useRef<HTMLButtonElement>(null);
  const caseCardRefs = useRef(new Map<string, HTMLButtonElement>());

  const fetchCases = useCallback(
    async (cursor?: string) => {
      setIsLoadingList(true);
      setQueueError(null);
      try {
        const hasExactIdSearch = targetIdFilter.length > 0;
        const response = await listModerationCases(authenticatedFetch, {
          status: hasExactIdSearch ? undefined : statusFilter || undefined,
          targetType: hasExactIdSearch ? undefined : typeFilter || undefined,
          searchId: targetIdFilter || undefined,
          cursor,
        });
        setCases((current) => (cursor ? [...current, ...response.items] : response.items));
        setNextCursor(response.nextCursor);
      } catch (error) {
        setQueueError(messageFrom(error, 'Không thể tải hàng đợi kiểm duyệt.'));
      } finally {
        setIsLoadingList(false);
      }
    },
    [authenticatedFetch, statusFilter, targetIdFilter, typeFilter],
  );

  const loadCaseDetail = useCallback(
    async (caseId: string, preserveDrafts = false) => {
      setSelectedCaseId(caseId);
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
      } catch (error) {
        setActionError(messageFrom(error, 'Không thể tải chi tiết hồ sơ kiểm duyệt.'));
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [authenticatedFetch],
  );

  const loadReportedReviews = useCallback(async () => {
    setIsLoadingReportedReviews(true);
    setReportedReviewsError(null);
    try {
      const response = await listAdminReportedReviews(authenticatedFetch);
      setReportedReviews(response.items);
    } catch (error) {
      setReportedReviewsError(messageFrom(error, 'Không thể tải danh sách đánh giá được người bán báo cáo.'));
    } finally {
      setIsLoadingReportedReviews(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (isAdmin) void fetchCases();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [fetchCases, isAdmin]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (isAdmin && activeTab === 'reviews') void loadReportedReviews();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [activeTab, isAdmin, loadReportedReviews]);

  useEffect(() => {
    if (confirmation) confirmationButtonRef.current?.focus();
  }, [confirmation]);

  const refreshAfterConflict = useCallback(
    async (caseId: string, error: unknown) => {
      if (error instanceof ModerationApiError && error.status === 409) {
        await loadCaseDetail(caseId, true);
        setActionError('Hồ sơ đã thay đổi ở phiên khác. Dữ liệu mới đã được tải; nội dung bạn soạn vẫn được giữ lại.');
        return;
      }
      setActionError(messageFrom(error, 'Không thể cập nhật hồ sơ kiểm duyệt.'));
    },
    [loadCaseDetail],
  );

  const openDecisionConfirmation = () => {
    if (!caseDetail) return;
    const trimmedReason = decisionReason.trim();
    if (trimmedReason.length < 8 || trimmedReason.length > 240) {
      setActionError('Lý do công khai phải dài từ 8 đến 240 ký tự.');
      return;
    }
    if (decisionOutcome === 'RESTRICT_CHAT_TEMPORARY' && !restrictionUntil) {
      setActionError('Vui lòng chọn thời điểm mở lại chat.');
      return;
    }
    if (
      ['WARN_USER', 'RESTRICT_CHAT_TEMPORARY', 'RESTRICT_CHAT_INDEFINITE', 'RESTORE_CHAT'].includes(decisionOutcome) &&
      decisionPrivateNote.trim().length < 8
    ) {
      setActionError('Các quyết định chat cần ghi chú nội bộ ít nhất 8 ký tự.');
      return;
    }
    confirmationTriggerRef.current = decisionButtonRef.current;
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
      await loadCaseDetail(caseDetail.id);
      await fetchCases();
    } catch (error) {
      setConfirmation(null);
      await refreshAfterConflict(caseDetail.id, error);
    } finally {
      setIsMutating(false);
    }
  };

  const loadReviewDetail = async (reviewId: string) => {
    const normalizedId = reviewId.trim();
    if (!normalizedId) return;
    setIsLoadingReview(true);
    setReviewError(null);
    try {
      setReviewDetail(await getAdminReviewDetail(authenticatedFetch, normalizedId));
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

  const handleLookupReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadReviewDetail(lookupReviewId);
  };

  const openReviewConfirmation = (
    action: AdminReviewVisibilityAction,
    trigger: HTMLButtonElement,
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
      setStatusMessage(action === 'HIDE' ? 'Đánh giá đã được ẩn và số liệu đã được làm mới.' : action === 'RESTORE' ? 'Đánh giá đã được khôi phục.' : 'Đã giữ nguyên hiển thị và đóng các báo cáo của người bán.');
      await loadReportedReviews();
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

  const closeCaseDetail = () => {
    const caseId = selectedCaseId;
    setSelectedCaseId(null);
    setCaseDetail(null);
    setActionError(null);
    if (caseId) {
      requestAnimationFrame(() => caseCardRefs.current.get(caseId)?.focus());
    }
  };

  const handleTargetIdSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTargetIdFilter(targetIdSearch.trim());
  };

  const clearTargetIdSearch = () => {
    setTargetIdSearch('');
    setTargetIdFilter('');
  };

  if (authState.status === 'loading') {
    return <p className="admin-moderation-container" role="status">Đang kiểm tra quyền quản trị…</p>;
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

  const selectedTargetHref = caseDetail ? targetHref(caseDetail) : null;

  return (
    <main className="admin-moderation-container" aria-labelledby="moderation-title">
      <header className="admin-moderation-header">
        <div>
          <h1 id="moderation-title">Trung tâm Kiểm duyệt &amp; Tố cáo</h1>
          <p>Xử lý báo cáo, trạng thái sản phẩm/shop và đánh giá đã xác minh.</p>
        </div>
        <div className="admin-tab-group" role="tablist" aria-label="Khu vực kiểm duyệt">
          <button
            id="moderation-cases-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'cases'}
            aria-controls="moderation-cases-panel"
            onClick={() => setActiveTab('cases')}
            className={`admin-tab-btn ${activeTab === 'cases' ? 'admin-tab-btn--active' : ''}`}
          >
            Hồ sơ vi phạm ({cases.length})
          </button>
          <button
            id="moderation-reviews-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'reviews'}
            aria-controls="moderation-reviews-panel"
            onClick={() => setActiveTab('reviews')}
            className={`admin-tab-btn ${activeTab === 'reviews' ? 'admin-tab-btn--active' : ''}`}
          >
            Kiểm duyệt đánh giá
          </button>
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>

      {activeTab === 'cases' ? (
        <section id="moderation-cases-panel" role="tabpanel" aria-labelledby="moderation-cases-tab" className="admin-moderation-grid">
          <aside className="admin-case-sidebar" aria-label="Hàng đợi hồ sơ">
            <form className="admin-target-search" onSubmit={handleTargetIdSearch}>
              <label htmlFor="case-target-id-search">Tìm mã hồ sơ hoặc đối tượng</label>
              <div className="admin-target-search__field">
                <svg className="admin-target-search__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
                <input
                  id="case-target-id-search"
                  className="admin-form-input"
                  value={targetIdSearch}
                  onChange={(event) => setTargetIdSearch(event.target.value)}
                  placeholder="Nhập UUID hồ sơ, sản phẩm hoặc shop"
                />
                {targetIdFilter ? (
                  <button type="button" className="admin-target-search__clear" aria-label="Xóa mã tìm kiếm" onClick={clearTargetIdSearch} disabled={isLoadingList}>
                    ×
                  </button>
                ) : null}
                <button type="submit" className="sr-only">Tìm kiếm</button>
              </div>
              <p className="admin-target-search__hint">Nhấn Enter để tìm chính xác. Khi tìm theo mã, mọi trạng thái và loại đối tượng đều được xét.</p>
            </form>
            <div className="admin-filter-bar">
              <label>
                <span className="sr-only">Trạng thái hồ sơ</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="OPEN">Chờ xử lý</option>
                  <option value="IN_REVIEW">Đang xem xét</option>
                  <option value="RESOLVED">Đã giải quyết</option>
                  <option value="">Tất cả trạng thái</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Loại đối tượng</span>
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
                  <option value="">Tất cả đối tượng</option>
                  <option value="PRODUCT">Sản phẩm</option>
                  <option value="SHOP">Cửa hàng</option>
                  <option value="CHAT_CONVERSATION">Cuộc trò chuyện</option>
                  <option value="CHAT_MESSAGE">Tin nhắn</option>
                </select>
              </label>
            </div>

            {queueError ? <p role="alert" className="admin-inline-error">{queueError}</p> : null}
            {isLoadingList && cases.length === 0 ? <p role="status">Đang tải danh sách hồ sơ…</p> : null}
            {!isLoadingList && !queueError && cases.length === 0 ? <p role="status">Không có hồ sơ nào phù hợp bộ lọc.</p> : null}
            {cases.length > 0 ? (
              <div className="admin-case-list">
                {cases.map((item) => {
                  const itemTargetHref = summaryTargetHref(item);
                  return (
                  <article
                    key={item.id}
                    className={`admin-case-card ${selectedCaseId === item.id ? 'admin-case-card--selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="admin-case-card__select"
                      aria-pressed={selectedCaseId === item.id}
                      aria-label={`Mở hồ sơ ${item.targetName}`}
                      ref={(element) => {
                        if (element) caseCardRefs.current.set(item.id, element);
                        else caseCardRefs.current.delete(item.id);
                      }}
                      onClick={() => void loadCaseDetail(item.id)}
                    >
                      <span className="admin-case-card__header">
                        <span className={`admin-badge ${item.targetType === 'PRODUCT' ? 'admin-badge--product' : item.targetType === 'SHOP' ? 'admin-badge--shop' : 'admin-badge--chat'}`}>
                          {item.targetType === 'PRODUCT' ? 'Sản phẩm' : item.targetType === 'SHOP' ? 'Cửa hàng' : item.targetType === 'CHAT_MESSAGE' ? 'Tin nhắn' : 'Cuộc trò chuyện'}
                        </span>
                        <span className={`admin-badge ${item.status === 'RESOLVED' ? 'admin-badge--resolved' : item.status === 'IN_REVIEW' ? 'admin-badge--inreview' : 'admin-badge--open'}`}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </span>
                      <span className="admin-case-card__title">{item.targetName}</span>
                      <span className="admin-case-card__meta">
                        {item.reportCount} báo cáo · {REASON_LABELS[item.primaryReasonCode] ?? item.primaryReasonCode}
                      </span>
                      <span className="admin-case-card__target-id">Mã hồ sơ: <code>{item.id}</code></span>
                    </button>
                    <p className="admin-case-card__target-id">
                      Mã đối tượng: {itemTargetHref ? <Link href={itemTargetHref} className="admin-case-card__target-link"><code>{item.targetId}</code></Link> : <code>{item.targetId}</code>}
                    </p>
                  </article>
                  );
                })}
                {nextCursor ? (
                  <button type="button" className="admin-btn-action" onClick={() => void fetchCases(nextCursor)} disabled={isLoadingList}>
                    {isLoadingList ? 'Đang tải…' : 'Tải thêm hồ sơ'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </aside>

          <section aria-live="polite">
            {!selectedCaseId ? <p className="admin-empty-state">Chọn một hồ sơ để xem báo cáo và quyết định kiểm duyệt.</p> : null}
            {selectedCaseId && isLoadingDetail ? <p role="status" className="admin-empty-state">Đang tải chi tiết hồ sơ…</p> : null}
            {caseDetail && !isLoadingDetail ? (
              <article className="admin-detail-panel" aria-labelledby="case-detail-title">
                <header className="admin-detail-header">
                  <div>
                    <h2 id="case-detail-title">{caseDetail.targetName}</h2>
                    <p>Mã hồ sơ: <code>{caseDetail.id}</code></p>
                    <p>
                      Mã đối tượng: {selectedTargetHref ? <Link href={selectedTargetHref} className="admin-case-detail__target-link"><code>{caseDetail.targetId}</code></Link> : <code>{caseDetail.targetId}</code>}
                    </p>
                  </div>
                  <div className="admin-detail-header-actions">
                    <span className="admin-badge">{STATUS_LABELS[caseDetail.status]}</span>
                    <button
                      type="button"
                      className="admin-detail-close"
                      onClick={closeCaseDetail}
                      disabled={isMutating}
                    >
                      Đóng chi tiết hồ sơ
                    </button>
                  </div>
                </header>

                {actionError ? <p className="admin-inline-error" role="alert">{actionError}</p> : null}

                <section aria-labelledby="reports-title">
                  <h3 id="reports-title" className="admin-section-title">Báo cáo đính kèm ({caseDetail.reports.length})</h3>
                  <div className="admin-reports-container">
                    {caseDetail.reports.map((report) => (
                      <article key={report.id} className="admin-report-card">
                        <p className="admin-report-card__header">Mã người gửi: <code>{report.reporterOpaqueId}</code> · {new Date(report.createdAt).toLocaleString('vi-VN')}</p>
                        <p className="admin-report-card__reason">{REASON_LABELS[report.reasonCode] ?? report.reasonCode}</p>
                        <p className="admin-report-card__details">{report.details}</p>
                        {report.evidenceUrls.length > 0 ? (
                          <ul className="admin-evidence-list" aria-label="Liên kết bằng chứng">
                            {report.evidenceUrls.map((url, index) => {
                              const href = safeHttpsHref(url);
                              return (
                                <li key={`${report.id}-${index}`}>
                                  <code>{url}</code>
                                  {href ? <a href={href} target="_blank" rel="noopener noreferrer">Mở bằng chứng {index + 1}</a> : <span>Liên kết không hợp lệ</span>}
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>

                {caseDetail.targetDetails.chat ? (
                  <section aria-labelledby="chat-evidence-title" className="admin-chat-evidence">
                    <h3 id="chat-evidence-title" className="admin-section-title">Ngữ cảnh chat giới hạn</h3>
                    <p>Chỉ hiển thị tối đa 20 tin nhắn gần nhất để phục vụ quyết định.</p>
                    <ol>
                      {caseDetail.targetDetails.chat.messages.map((message) => (
                        <li key={`${message.senderUserId}-${message.sequence}`}>
                          <strong>{message.senderLabel}</strong>
                          <span>{message.content}</span>
                          <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('vi-VN')}</time>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}

                <section aria-labelledby="events-title">
                  <h3 id="events-title" className="admin-section-title">Nhật ký hoạt động</h3>
                  {caseDetail.events.length === 0 ? <p>Chưa có hoạt động nào.</p> : (
                    <ol className="admin-events-list">
                      {caseDetail.events.map((event) => <li key={event.id} className="admin-event-item">{event.eventType} · {event.actorName ?? 'Hệ thống'} · {new Date(event.createdAt).toLocaleString('vi-VN')}{event.note ? `: ${event.note}` : ''}</li>)}
                    </ol>
                  )}
                </section>

                <section aria-labelledby="decision-title" className="admin-decision-box">
                  <h3 id="decision-title">Ra quyết định kiểm duyệt</h3>
                  <div className="admin-outcome-options" role="radiogroup" aria-label="Hành động xử lý">
                    {caseDetail.targetType === 'CHAT_CONVERSATION' || caseDetail.targetType === 'CHAT_MESSAGE' ? (
                      <>
                        <label className="admin-outcome-pill"><input type="radio" name="outcome" checked={decisionOutcome === 'NO_ACTION'} onChange={() => setDecisionOutcome('NO_ACTION')} />Không xử lý</label>
                        <label className="admin-outcome-pill"><input type="radio" name="outcome" checked={decisionOutcome === 'WARN_USER'} onChange={() => setDecisionOutcome('WARN_USER')} />Cảnh cáo</label>
                        <label className="admin-outcome-pill"><input type="radio" name="outcome" checked={decisionOutcome === 'RESTRICT_CHAT_TEMPORARY'} onChange={() => setDecisionOutcome('RESTRICT_CHAT_TEMPORARY')} />Hạn chế tạm thời</label>
                        <label className="admin-outcome-pill"><input type="radio" name="outcome" checked={decisionOutcome === 'RESTRICT_CHAT_INDEFINITE'} onChange={() => setDecisionOutcome('RESTRICT_CHAT_INDEFINITE')} />Hạn chế vô thời hạn</label>
                        <label className="admin-outcome-pill"><input type="radio" name="outcome" checked={decisionOutcome === 'RESTORE_CHAT'} onChange={() => setDecisionOutcome('RESTORE_CHAT')} />Mở lại chat</label>
                      </>
                    ) : caseDetail.targetStatus === 'SUSPENDED' ? (
                      <label className="admin-outcome-pill"><input type="radio" name="outcome" checked={decisionOutcome === 'RESTORE_TARGET'} onChange={() => setDecisionOutcome('RESTORE_TARGET')} />Khôi phục</label>
                    ) : (
                      <>
                        <label className="admin-outcome-pill"><input type="radio" name="outcome" checked={decisionOutcome === 'SUSPEND_TARGET'} onChange={() => setDecisionOutcome('SUSPEND_TARGET')} />Đình chỉ</label>
                        <label className="admin-outcome-pill"><input type="radio" name="outcome" checked={decisionOutcome === 'NO_ACTION'} onChange={() => setDecisionOutcome('NO_ACTION')} />Không xử lý</label>
                      </>
                    )}
                  </div>
                  <div className="admin-form-stack">
                    <label htmlFor="decision-reason">Lý do công khai (8–240 ký tự)</label>
                    <textarea id="decision-reason" className="admin-form-input" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} minLength={8} maxLength={240} rows={3} />
                    <label htmlFor="decision-private-note">Ghi chú nội bộ {caseDetail.targetType === 'CHAT_CONVERSATION' || caseDetail.targetType === 'CHAT_MESSAGE' ? '(bắt buộc với quyết định chat)' : '(tùy chọn)'}</label>
                    <textarea id="decision-private-note" className="admin-form-input" value={decisionPrivateNote} onChange={(event) => setDecisionPrivateNote(event.target.value)} maxLength={2000} rows={3} />
                    {caseDetail.targetType === 'CHAT_CONVERSATION' || caseDetail.targetType === 'CHAT_MESSAGE' ? (
                      <>
                        <label htmlFor="restriction-until">Mở lại lúc (chỉ áp dụng hạn chế tạm thời)</label>
                        <input id="restriction-until" className="admin-form-input" type="datetime-local" value={restrictionUntil} onChange={(event) => setRestrictionUntil(event.target.value)} disabled={decisionOutcome !== 'RESTRICT_CHAT_TEMPORARY'} />
                      </>
                    ) : null}
                    <button ref={decisionButtonRef} type="button" className="admin-btn-action admin-btn-action--danger" onClick={openDecisionConfirmation} disabled={isMutating}>
                      Xác nhận áp dụng quyết định
                    </button>
                  </div>
                </section>
              </article>
            ) : null}
          </section>
        </section>
      ) : (
        <section id="moderation-reviews-panel" role="tabpanel" aria-labelledby="moderation-reviews-tab" className="admin-review-panel">
          <h2>Kiểm duyệt đánh giá</h2>
          <section className="admin-reported-review-queue" aria-labelledby="reported-reviews-title">
            <div className="admin-reported-review-queue__header">
              <div>
                <h3 id="reported-reviews-title">Đánh giá được người bán báo cáo ({reportedReviews.length})</h3>
                <p>Chọn một đánh giá để xem lý do báo cáo trước khi ra quyết định.</p>
              </div>
              <button type="button" className="admin-btn-action" onClick={() => void loadReportedReviews()} disabled={isLoadingReportedReviews}>
                {isLoadingReportedReviews ? 'Đang tải…' : 'Làm mới'}
              </button>
            </div>
            {reportedReviewsError ? <p className="admin-inline-error" role="alert">{reportedReviewsError}</p> : null}
            {isLoadingReportedReviews && reportedReviews.length === 0 ? <p role="status">Đang tải đánh giá được báo cáo…</p> : null}
            {!isLoadingReportedReviews && !reportedReviewsError && reportedReviews.length === 0 ? <p className="admin-reported-review-queue__empty">Chưa có đánh giá nào đang chờ xử lý từ người bán.</p> : null}
            {reportedReviews.length > 0 ? (
              <div className="admin-reported-review-list">
                {reportedReviews.map((review) => (
                  <button
                    key={review.reviewId}
                    type="button"
                    className={`admin-reported-review-card ${reviewDetail?.id === review.reviewId ? 'admin-reported-review-card--selected' : ''}`}
                    onClick={() => {
                      setLookupReviewId(review.reviewId);
                      void loadReviewDetail(review.reviewId);
                    }}
                  >
                    <strong>{review.productName}</strong>
                    <span>{review.shopName} · {review.rating} sao · {review.reportCount} báo cáo</span>
                    <span>{review.comment ?? 'Không có nội dung nhận xét.'}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
          <h3 className="admin-review-lookup__title">Tra cứu thủ công</h3>
          <form onSubmit={handleLookupReview} className="admin-review-lookup">
            <label htmlFor="review-id">Mã đánh giá</label>
            <input id="review-id" className="admin-form-input" value={lookupReviewId} onChange={(event) => setLookupReviewId(event.target.value)} placeholder="UUID đánh giá" />
            <button type="submit" className="admin-btn-action" disabled={isLoadingReview}>{isLoadingReview ? 'Đang tìm…' : 'Tra cứu'}</button>
          </form>
          {reviewError ? <p className="admin-inline-error" role="alert">{reviewError}</p> : null}
          {reviewDetail ? (
            <article className="admin-review-detail" aria-labelledby="review-detail-title">
              <h3 id="review-detail-title">Đánh giá trên sản phẩm: {reviewDetail.productName}</h3>
              <p>Người đánh giá: {reviewDetail.authorDisplayName} · {reviewDetail.rating} sao · Trạng thái: {reviewDetail.visibility === 'VISIBLE' ? 'Hiển thị' : 'Đang ẩn'}</p>
              <blockquote>{reviewDetail.comment ?? 'Không có nội dung nhận xét.'}</blockquote>
              {reviewDetail.sellerReportCount > 0 ? (
                <section className="admin-review-report-context" aria-labelledby="seller-report-context-title">
                  <h4 id="seller-report-context-title">Ngữ cảnh báo cáo từ người bán ({reviewDetail.sellerReportCount})</h4>
                  <p>Chỉ hiển thị lý do và mô tả cần thiết cho quyết định; không hiển thị danh tính người bán.</p>
                  <ul>
                    {reviewDetail.sellerReports.map((report) => (
                      <li key={report.id}>
                        <strong>{REASON_LABELS[report.reasonCode] ?? report.reasonCode}</strong>
                        {report.details ? <span> — {report.details}</span> : null}
                        <small>{new Date(report.createdAt).toLocaleString('vi-VN')}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <label htmlFor="review-reason">Lý do kiểm duyệt (8–240 ký tự)</label>
              <textarea id="review-reason" className="admin-form-input" value={reviewActionReason} onChange={(event) => setReviewActionReason(event.target.value)} minLength={8} maxLength={240} rows={3} />
              <div className="admin-review-actions">
                <button
                  type="button"
                  className={`admin-btn-action ${reviewDetail.visibility === 'VISIBLE' ? 'admin-btn-action--danger' : 'admin-btn-action--success'}`}
                  onClick={(event) => openReviewConfirmation(reviewDetail.visibility === 'VISIBLE' ? 'HIDE' : 'RESTORE', event.currentTarget)}
                  disabled={isLoadingReview}
                >
                  {reviewDetail.visibility === 'VISIBLE' ? 'Ẩn đánh giá vi phạm' : 'Khôi phục hiển thị đánh giá'}
                </button>
                {reviewDetail.visibility === 'VISIBLE' && reviewDetail.sellerReportCount > 0 ? (
                  <button
                    type="button"
                    className="admin-btn-action"
                    onClick={(event) => openReviewConfirmation('KEEP_VISIBLE', event.currentTarget)}
                    disabled={isLoadingReview}
                  >
                    Giữ nguyên hiển thị
                  </button>
                ) : null}
              </div>
            </article>
          ) : null}
        </section>
      )}

      {confirmation ? (
        <div className="admin-confirmation-overlay" role="presentation">
          <section className="admin-confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="moderation-confirmation-title" aria-describedby="moderation-confirmation-description">
            <h2 id="moderation-confirmation-title">Xác nhận hành động</h2>
            <p id="moderation-confirmation-description">{confirmation.label}. Thao tác này sẽ ghi lịch sử kiểm duyệt không thể sửa.</p>
            <div className="admin-confirmation-actions">
              <button type="button" className="admin-btn-action" onClick={closeConfirmation} disabled={isMutating}>Hủy</button>
              <button ref={confirmationButtonRef} type="button" className="admin-btn-action admin-btn-action--danger" onClick={confirmAction} disabled={isMutating}>{isMutating ? 'Đang thực hiện…' : 'Xác nhận'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
