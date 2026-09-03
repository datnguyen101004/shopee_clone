'use client';

import {
  PRODUCT_REPORT_REASON_CODES,
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_DETAILS_MIN_LENGTH,
  REPORT_MAX_EVIDENCE_URLS,
  SHOP_REPORT_REASON_CODES,
  type CreateReportRequest,
  type CreateReportResponse,
  type ReportReasonCode,
  type ReportTargetType,
} from '@shopee-clone/contracts';
import React, { useEffect, useRef, useState } from 'react';
import { ReportingApiError, submitReport, type AuthenticatedFetcher } from '../../lib/reporting-api';

export interface ReportTargetDialogProps {
  targetType: ReportTargetType;
  targetId: string;
  targetName: string;
  isOpen: boolean;
  onClose: () => void;
  fetcher: AuthenticatedFetcher;
  isAuthenticated: boolean;
  onRequireAuth?: () => void;
}

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

export const ReportTargetDialog: React.FC<ReportTargetDialogProps> = ({
  targetType,
  targetId,
  targetName,
  isOpen,
  onClose,
  fetcher,
  isAuthenticated,
  onRequireAuth,
}) => {
  const reasonOptions =
    targetType === 'PRODUCT' ? PRODUCT_REPORT_REASON_CODES : SHOP_REPORT_REASON_CODES;

  const [reasonCode, setReasonCode] = useState<ReportReasonCode>(reasonOptions[0]);
  const [details, setDetails] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<CreateReportResponse | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmittingRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )];
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleEvidenceChange = (index: number, val: string) => {
    const next = [...evidenceUrls];
    next[index] = val;
    setEvidenceUrls(next);
  };

  const addEvidenceField = () => {
    if (evidenceUrls.length < REPORT_MAX_EVIDENCE_URLS) {
      setEvidenceUrls([...evidenceUrls, '']);
    }
  };

  const removeEvidenceField = (index: number) => {
    setEvidenceUrls(evidenceUrls.filter((_, i) => i !== index));
  };

  const trimmedLen = details.trim().length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isAuthenticated) {
      if (onRequireAuth) {
        onRequireAuth();
      } else {
        setErrorMsg('Vui lòng đăng nhập tài khoản để gửi báo cáo.');
      }
      return;
    }

    const trimmedDetails = details.trim();
    if (trimmedDetails.length < REPORT_DETAILS_MIN_LENGTH) {
      setErrorMsg(
        `Nội dung mô tả quá ngắn. Vui lòng nhập tối thiểu ${REPORT_DETAILS_MIN_LENGTH} ký tự (hiện có ${trimmedDetails.length} ký tự).`,
      );
      return;
    }

    if (trimmedDetails.length > REPORT_DETAILS_MAX_LENGTH) {
      setErrorMsg(
        `Nội dung mô tả vượt quá giới hạn ${REPORT_DETAILS_MAX_LENGTH} ký tự (hiện có ${trimmedDetails.length} ký tự).`,
      );
      return;
    }

    const filteredEvidence = evidenceUrls.map((u) => u.trim()).filter((u) => u.length > 0);

    for (const url of filteredEvidence) {
      let isHttps = false;
      try {
        isHttps = new URL(url).protocol === 'https:';
      } catch {
        isHttps = false;
      }
      if (!isHttps) {
        setErrorMsg(`Link bằng chứng "${url}" không hợp lệ. Vui lòng dùng liên kết https://.`);
        return;
      }
    }

    const payload: CreateReportRequest = {
      targetType,
      targetId,
      reasonCode,
      details: trimmedDetails,
      evidenceUrls: filteredEvidence.length > 0 ? filteredEvidence : undefined,
    };

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await submitReport(fetcher, payload, idempotencyKey);
      setSuccessResult(res);
    } catch (err: unknown) {
      if (err instanceof ReportingApiError) {
        if (err.status === 429) {
          setErrorMsg(
            `Bạn đã đạt giới hạn gửi báo cáo. Vui lòng thử lại sau ${err.problem?.retryAfterSeconds ?? 3600} giây.`,
          );
        } else if (err.status === 409) {
          setErrorMsg('Bạn đã có một báo cáo đang chờ xử lý cho mục này.');
        } else {
          setErrorMsg(err.problem?.detail || err.message);
        }
      } else {
        setErrorMsg('Đã có lỗi xảy ra khi gửi báo cáo. Vui lòng thử lại.');
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      aria-describedby="report-dialog-description"
      className="report-dialog-overlay"
    >
      <div className="report-dialog-card">
        <div className="report-dialog-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="report-dialog-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </span>
            <div>
              <h2 id="report-dialog-title">
                Báo cáo {targetType === 'PRODUCT' ? 'Sản phẩm' : 'Cửa hàng'}
              </h2>
              <p id="report-dialog-description">Giúp Shopee giữ môi trường mua sắm an toàn</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="report-dialog-close"
          >
            ✕
          </button>
        </div>

        {successResult ? (
          <div className="report-dialog-success">
            <div className="report-dialog-success-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3>Đã gửi báo cáo thành công</h3>
            <p>
              Cảm ơn bạn đã đóng góp thông tin. Đội ngũ kiểm duyệt sẽ xem xét báo cáo của bạn trong thời gian sớm nhất.
            </p>
            <div className="report-dialog-ref-code">
              Mã báo cáo: {successResult.reportId}
            </div>
            <div>
              <button
                type="button"
                onClick={onClose}
                className="report-dialog-submit"
                style={{ width: '100%' }}
              >
                Hoàn tất
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="report-dialog-form">
            <div className="report-dialog-target-info">
              <span>Đối tượng báo cáo: </span>
              <strong>{targetName}</strong>
            </div>

            <div className="report-dialog-field">
              <label htmlFor="report-reason">
                Lý do báo cáo vi phạm <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                id="report-reason"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value as ReportReasonCode)}
              >
                {reasonOptions.map((r) => (
                  <option key={r} value={r}>
                    {REASON_LABELS[r] ?? r.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div className="report-dialog-field">
              <label htmlFor="report-details">
                <span>Mô tả chi tiết <span style={{ color: '#ef4444' }}>*</span></span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: trimmedLen < REPORT_DETAILS_MIN_LENGTH ? '#c2410c' : '#166534',
                    fontWeight: 600,
                  }}
                >
                  {trimmedLen < REPORT_DETAILS_MIN_LENGTH
                    ? `(cần thêm ${REPORT_DETAILS_MIN_LENGTH - trimmedLen} ký tự)`
                    : `(${trimmedLen}/${REPORT_DETAILS_MAX_LENGTH} ký tự)`}
                </span>
              </label>
              <textarea
                id="report-details"
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Mô tả cụ thể hành vi vi phạm hoặc các điểm đáng ngờ (tối thiểu 20 ký tự)..."
              />
            </div>

            <div className="report-dialog-field">
              <label>
                <span>Link bằng chứng bổ sung</span>
                <span style={{ fontSize: '0.75rem', color: '#52525b', fontWeight: 'normal' }}>
                  (Tối đa {REPORT_MAX_EVIDENCE_URLS} link)
                </span>
              </label>
              {evidenceUrls.map((url, idx) => (
                <div key={idx} className="report-dialog-evidence-row">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => handleEvidenceChange(idx, e.target.value)}
                    placeholder="https://example.com/anh-bang-chung.jpg"
                    aria-label={`Link bằng chứng ${idx + 1}`}
                  />
                  {evidenceUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEvidenceField(idx)}
                      className="report-dialog-evidence-remove"
                    >
                      Xóa
                    </button>
                  )}
                </div>
              ))}
              {evidenceUrls.length < REPORT_MAX_EVIDENCE_URLS && (
                <button
                  type="button"
                  onClick={addEvidenceField}
                  className="report-dialog-add-btn"
                >
                  + Thêm link bằng chứng khác
                </button>
              )}
            </div>

            {errorMsg && (
              <div className="report-dialog-error" role="alert">
                {errorMsg}
              </div>
            )}

            <div className="report-dialog-actions">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="report-dialog-cancel"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="report-dialog-submit"
              >
                {isSubmitting ? 'Đang gửi...' : 'Gửi báo cáo'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
