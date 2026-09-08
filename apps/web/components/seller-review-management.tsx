'use client';

import type { SellerReviewReportReasonCode, SellerShopReviewSummary } from '@shopee-clone/contracts';
import { ChevronDown, Flag, Search } from '@shopee-clone/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthSession } from './auth-session-provider';
import { listSellerShopReviews, SellerReviewReportApiError, submitSellerReviewReport } from '../lib/seller-review-report-api';
import { SellerPagination } from './seller/seller-pagination';

const REPORT_REASONS: Array<{ value: SellerReviewReportReasonCode; label: string }> = [
  { value: 'ABUSIVE_CONTENT', label: 'Nội dung xúc phạm hoặc quấy rối' },
  { value: 'IRRELEVANT_CONTENT', label: 'Nội dung không liên quan tới sản phẩm' },
  { value: 'SPAM_OR_FRAUD', label: 'Spam, lừa đảo hoặc liên kết đáng ngờ' },
  { value: 'OTHER', label: 'Lý do khác' },
];

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function reportStatusLabel(status: SellerShopReviewSummary['reportStatus']): string | null {
  if (status === 'OPEN') return 'Đã báo cáo — đang chờ kiểm duyệt';
  if (status === 'RESOLVED') return 'Báo cáo trước đã được xử lý';
  return null;
}

type ReviewSort = 'newest' | 'oldest' | 'highest-rating' | 'lowest-rating';

export function SellerReviewManagement() {
  const { authenticatedFetch, state: authState } = useAuthSession();
  const isSeller = authState.status === 'authenticated' && authState.user.roles.includes('seller');
  const [reviews, setReviews] = useState<SellerShopReviewSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<SellerShopReviewSummary | null>(null);
  const [reasonCode, setReasonCode] = useState<SellerReviewReportReasonCode>('ABUSIVE_CONTENT');
  const [details, setDetails] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const loadReviews = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const response = await listSellerShopReviews(authenticatedFetch, targetPage);
      const lastPage = Math.max(1, response.totalPages);
      if (targetPage > lastPage) {
        setPage(lastPage);
        return;
      }
      setReviews(response.items);
      setPage(response.page);
      setTotalItems(response.totalItems);
      setTotalPages(response.totalPages);
    } catch (caught) {
      setError(messageFrom(caught, 'Không thể tải đánh giá của shop.'));
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (isSeller) void loadReviews(page);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [isSeller, loadReviews, page]);

  const openReportDialog = (review: SellerShopReviewSummary) => {
    setSelectedReview(review);
    setReasonCode('ABUSIVE_CONTENT');
    setDetails('');
    setConfirming(false);
    setDialogError(null);
  };

  const visibleReviews = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('vi-VN');
    const filtered = reviews.filter((review) => {
      if (!term) return true;
      return [review.productName, review.productId, review.comment ?? '']
        .some((value) => value.toLocaleLowerCase('vi-VN').includes(term));
    });

    return [...filtered].sort((left, right) => {
      if (sort === 'highest-rating' || sort === 'lowest-rating') {
        const difference = right.rating - left.rating;
        return (sort === 'highest-rating' ? difference : -difference)
          || left.id.localeCompare(right.id);
      }
      const leftTime = Date.parse(left.updatedAt);
      const rightTime = Date.parse(right.updatedAt);
      return (sort === 'newest' ? rightTime - leftTime : leftTime - rightTime)
        || left.id.localeCompare(right.id);
    });
  }, [reviews, searchTerm, sort]);

  const closeDialog = () => {
    if (submitting) return;
    setSelectedReview(null);
    setConfirming(false);
    setDialogError(null);
  };

  const requestConfirmation = () => {
    if (details.length > 1000) {
      setDialogError('Phần mô tả không được dài quá 1.000 ký tự.');
      return;
    }
    setDialogError(null);
    setConfirming(true);
  };

  const submitReport = async () => {
    if (!selectedReview) return;
    setSubmitting(true);
    setDialogError(null);
    try {
      const receipt = await submitSellerReviewReport(
        selectedReview.id,
        { reasonCode, ...(details.trim() ? { details: details.trim() } : {}) },
        crypto.randomUUID(),
        authenticatedFetch,
      );
      setReviews((current) => current.map((review) => review.id === selectedReview.id ? { ...review, reportStatus: 'OPEN' } : review));
      setNotice(receipt.status === 'ALREADY_SUBMITTED'
        ? 'Đánh giá này đã có báo cáo đang chờ kiểm duyệt.'
        : 'Đã gửi báo cáo. Đánh giá vẫn hiển thị cho tới khi quản trị viên quyết định.');
      setSelectedReview(null);
      setConfirming(false);
    } catch (caught) {
      if (caught instanceof SellerReviewReportApiError && caught.status === 404) {
        setDialogError('Đánh giá không còn thuộc phạm vi shop của bạn hoặc không còn khả dụng.');
      } else if (caught instanceof SellerReviewReportApiError && caught.status === 409) {
        setDialogError('Báo cáo này đang được xử lý hoặc đã được gửi ở phiên khác. Hãy tải lại danh sách.');
      } else {
        setDialogError(messageFrom(caught, 'Không thể gửi báo cáo. Vui lòng thử lại.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authState.status === 'loading') {
    return <p className="seller-reviews__state" role="status">Đang kiểm tra tài khoản…</p>;
  }
  if (authState.status === 'guest') {
    return (
      <section className="seller-reviews__access" aria-labelledby="seller-reviews-auth-title">
        <h1 id="seller-reviews-auth-title">Cần đăng nhập</h1>
        <p>Đăng nhập bằng tài khoản người bán để xem đánh giá của shop.</p>
        <Link href="/login?returnTo=/seller/reviews">Đăng nhập</Link>
      </section>
    );
  }
  if (!isSeller) {
    return (
      <section className="seller-reviews__access" aria-labelledby="seller-reviews-forbidden-title">
        <h1 id="seller-reviews-forbidden-title">Bạn không có quyền truy cập</h1>
        <p>Khu vực này chỉ dành cho tài khoản người bán.</p>
      </section>
    );
  }

  return (
    <main className="seller-reviews" aria-labelledby="seller-reviews-title">
      <header className="seller-reviews__header">
        <p className="seller-reviews__eyebrow">Seller Center</p>
        <h1 id="seller-reviews-title">Đánh giá sản phẩm</h1>
        <p>Theo dõi đánh giá của sản phẩm thuộc shop bạn. Báo cáo chỉ gửi tín hiệu cho quản trị viên, không tự ẩn đánh giá.</p>
      </header>
      <p className="sr-only" role="status" aria-live="polite">{notice}</p>
      {notice ? <p className="seller-reviews__notice" role="status">{notice}</p> : null}
      {error ? (
        <p role="alert" className="seller-reviews__error">
          {error}{' '}
          <button type="button" onClick={() => void loadReviews(page)}>Thử lại</button>
        </p>
      ) : null}
      <div className="seller-pl-toolbar seller-pl-toolbar--labeled seller-reviews-toolbar">
        <div className="seller-pl-toolbar__filters">
          <div className="seller-pl-search seller-reviews-search">
            <Search className="seller-pl-search__icon" size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label="Tìm kiếm đánh giá"
              placeholder="Tên sản phẩm hoặc nội dung"
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }}
            />
          </div>
          <div className="seller-pl-field seller-reviews-sort">
            <label htmlFor="seller-reviews-sort">Sắp xếp</label>
            <div className="seller-pl-select-wrap">
              <select
                id="seller-reviews-sort"
                className="seller-pl-select"
                value={sort}
                onChange={(event) => { setSort(event.target.value as ReviewSort); setPage(1); }}
              >
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="highest-rating">Đánh giá cao đến thấp</option>
                <option value="lowest-rating">Đánh giá thấp đến cao</option>
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      {loading ? <p className="seller-reviews__state" role="status">Đang tải đánh giá…</p> : null}
      {!loading && !error && reviews.length === 0 ? (
        <p className="seller-reviews__empty">Shop của bạn chưa có đánh giá nào.</p>
      ) : null}
      {reviews.length > 0 ? (
        <>
          {visibleReviews.length > 0 ? (
            <section className="seller-reviews__list" aria-label="Danh sách đánh giá của shop">
              {visibleReviews.map((review) => {
                const reportStatus = reportStatusLabel(review.reportStatus);
                return (
                  <article key={review.id} className="seller-review-card">
                    <div className="seller-review-card__content">
                      <Link href={`/products/${review.productId}`} className="seller-review-card__product">
                        {review.productName}
                      </Link>
                      <p className="seller-review-card__rating" aria-label={`${review.rating} trên 5 sao`}>
                        {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                      </p>
                      <p className="seller-review-card__comment">
                        {review.comment ?? 'Người mua không để lại nội dung nhận xét.'}
                      </p>
                      <p className="seller-review-card__date">
                        Cập nhật {new Date(review.updatedAt).toLocaleString('vi-VN')}
                      </p>
                      {review.visibility === 'HIDDEN' ? (
                        <p className="seller-review-card__status seller-review-card__status--hidden">
                          Đánh giá này hiện đang bị ẩn công khai.
                        </p>
                      ) : null}
                      {reportStatus ? (
                        <p className="seller-review-card__status seller-review-card__status--reported">
                          {reportStatus}
                        </p>
                      ) : null}
                    </div>
                    {review.visibility !== 'HIDDEN' ? (
                      <button
                        type="button"
                        className="seller-review-card__report"
                        aria-label={`${review.reportStatus === 'OPEN' ? 'Đã báo cáo' : 'Báo cáo đánh giá'} ${review.productName}`}
                        title={review.reportStatus === 'OPEN' ? 'Đã báo cáo' : 'Báo cáo đánh giá'}
                        disabled={review.reportStatus === 'OPEN'}
                        onClick={() => openReportDialog(review)}
                      >
                        <Flag size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ) : (
            <p className="seller-reviews-filter-empty">Không tìm thấy đánh giá phù hợp với bộ lọc hiện tại.</p>
          )}
          <SellerPagination
            itemLabel="đánh giá"
            page={page}
            totalItems={totalItems}
            totalPages={totalPages}
            disabled={loading}
            onPageChange={setPage}
          />
        </>
      ) : null}
      {selectedReview ? (
        <div className="seller-review-report-dialog-backdrop" role="presentation">
          <section
            className="seller-review-report-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seller-review-report-title"
          >
            <header className="seller-review-report-dialog__header">
              <div>
                <h2 id="seller-review-report-title">Báo cáo đánh giá</h2>
                <p>{selectedReview.productName}</p>
              </div>
              <button
                type="button"
                aria-label="Đóng báo cáo đánh giá"
                onClick={closeDialog}
                disabled={submitting}
              >
                ×
              </button>
            </header>
            {dialogError ? <p role="alert" className="seller-review-report-dialog__error">{dialogError}</p> : null}
            {!confirming ? (
              <div className="seller-review-report-form">
                <div className="seller-pl-field">
                  <label htmlFor="seller-review-report-reason">Lý do báo cáo</label>
                  <div className="seller-pl-select-wrap">
                    <select
                      id="seller-review-report-reason"
                      className="seller-pl-select"
                      value={reasonCode}
                      onChange={(event) => setReasonCode(event.target.value as SellerReviewReportReasonCode)}
                    >
                      {REPORT_REASONS.map((reason) => (
                        <option key={reason.value} value={reason.value}>{reason.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
                  </div>
                </div>
                <label htmlFor="seller-review-report-details">
                  Mô tả thêm (không bắt buộc)
                  <textarea
                    id="seller-review-report-details"
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    maxLength={1000}
                    rows={4}
                  />
                </label>
                <p className="seller-review-report-form__hint">
                  {details.length}/1000 ký tự. Không đưa thông tin nhạy cảm của người mua vào đây.
                </p>
                <div className="seller-review-report-dialog__actions">
                  <button type="button" className="seller-review-button seller-review-button--secondary" onClick={closeDialog}>
                    Hủy
                  </button>
                  <button type="button" className="seller-review-button seller-review-button--primary" onClick={requestConfirmation}>
                    Tiếp tục
                  </button>
                </div>
              </div>
            ) : (
              <div className="seller-review-report-confirmation">
                <p>Xác nhận gửi báo cáo này cho quản trị viên? Đánh giá chưa bị ẩn cho tới khi quản trị viên ra quyết định.</p>
                <p className="seller-review-report-confirmation__reason">
                  <strong>Lý do:</strong> {REPORT_REASONS.find((reason) => reason.value === reasonCode)?.label}
                </p>
                <div className="seller-review-report-dialog__actions">
                  <button
                    type="button"
                    className="seller-review-button seller-review-button--secondary"
                    onClick={() => setConfirming(false)}
                    disabled={submitting}
                  >
                    Quay lại
                  </button>
                  <button
                    type="button"
                    className="seller-review-button seller-review-button--primary"
                    onClick={() => void submitReport()}
                    disabled={submitting}
                  >
                    {submitting ? 'Đang gửi…' : 'Xác nhận gửi báo cáo'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
