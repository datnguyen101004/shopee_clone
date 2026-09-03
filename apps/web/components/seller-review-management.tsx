'use client';

import type { SellerReviewReportReasonCode, SellerShopReviewSummary } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { useAuthSession } from './auth-session-provider';
import { listSellerShopReviews, SellerReviewReportApiError, submitSellerReviewReport } from '../lib/seller-review-report-api';

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

export function SellerReviewManagement() {
  const { authenticatedFetch, state: authState } = useAuthSession();
  const isSeller = authState.status === 'authenticated' && authState.user.roles.includes('seller');
  const [reviews, setReviews] = useState<SellerShopReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<SellerShopReviewSummary | null>(null);
  const [reasonCode, setReasonCode] = useState<SellerReviewReportReasonCode>('ABUSIVE_CONTENT');
  const [details, setDetails] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listSellerShopReviews(authenticatedFetch);
      setReviews(response.items);
    } catch (caught) {
      setError(messageFrom(caught, 'Không thể tải đánh giá của shop.'));
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (isSeller) void loadReviews();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [isSeller, loadReviews]);

  const openReportDialog = (review: SellerShopReviewSummary) => {
    setSelectedReview(review);
    setReasonCode('ABUSIVE_CONTENT');
    setDetails('');
    setConfirming(false);
    setDialogError(null);
  };

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
          <button type="button" onClick={() => void loadReviews()}>Thử lại</button>
        </p>
      ) : null}
      {loading ? <p className="seller-reviews__state" role="status">Đang tải đánh giá…</p> : null}
      {!loading && !error && reviews.length === 0 ? (
        <p className="seller-reviews__empty">Shop của bạn chưa có đánh giá nào.</p>
      ) : null}
      {reviews.length > 0 ? (
        <section className="seller-reviews__list" aria-label="Danh sách đánh giá của shop">
          {reviews.map((review) => {
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
                    disabled={review.reportStatus === 'OPEN'}
                    onClick={() => openReportDialog(review)}
                  >
                    {review.reportStatus === 'OPEN' ? 'Đã báo cáo' : 'Báo cáo đánh giá'}
                  </button>
                ) : null}
              </article>
            );
          })}
        </section>
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
                <label htmlFor="seller-review-report-reason">
                  Lý do báo cáo
                  <select
                    id="seller-review-report-reason"
                    value={reasonCode}
                    onChange={(event) => setReasonCode(event.target.value as SellerReviewReportReasonCode)}
                  >
                    {REPORT_REASONS.map((reason) => (
                      <option key={reason.value} value={reason.value}>{reason.label}</option>
                    ))}
                  </select>
                </label>
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
