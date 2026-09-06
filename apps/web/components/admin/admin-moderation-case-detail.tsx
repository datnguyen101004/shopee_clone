'use client';

import type { ModerationCaseDetail } from '@shopee-clone/contracts';
import Link from 'next/link';

import { AdminEntityLink } from './admin-entity-link';

export interface AdminModerationCaseDetailProps {
  detail: ModerationCaseDetail | null;
  isLoading: boolean;
  actionError: string | null;
  isMutating: boolean;
  reasonLabels: Record<string, string>;
  onOpenAction: () => void;
  onClose?: () => void;
  backHref?: string;
}

function safeHttpsHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function AdminModerationCaseDetail({
  detail,
  isLoading,
  actionError,
  isMutating,
  reasonLabels,
  onOpenAction,
  onClose,
  backHref,
}: AdminModerationCaseDetailProps) {
  if (isLoading)
    return (
      <p role="status" className="admin-empty-state">
        Đang tải chi tiết report…
      </p>
    );
  if (!detail)
    return (
      <p className="admin-empty-state">Không tìm thấy report hoặc report không còn tồn tại.</p>
    );

  return (
    <article className="admin-detail-panel" aria-labelledby="case-detail-title">
      <header className="admin-detail-header">
        <div>
          <AdminEntityLink
            href={
              detail.targetType === 'PRODUCT'
                ? `/admin/products/${detail.targetId}`
                : detail.targetType === 'SHOP'
                  ? `/admin/shops/${detail.targetId}`
                  : `/admin/moderation/${detail.id}`
            }
            name={detail.targetName}
            imageUrl={detail.targetImageUrl ?? detail.targetDetails.imageUrl}
            meta="Mở trong Admin"
          />
        </div>
        <div className="admin-detail-header-actions">
          <span className="admin-badge">
            {detail.status === 'RESOLVED'
              ? 'Đã giải quyết'
              : detail.status === 'IN_REVIEW'
                ? 'Đang xem xét'
                : 'Chờ xử lý'}
          </span>
          {backHref ? (
            <Link href={backHref} className="admin-btn admin-btn-secondary">
              ← Danh sách report
            </Link>
          ) : onClose ? (
            <button
              type="button"
              className="admin-detail-close"
              onClick={onClose}
              disabled={isMutating}
            >
              Đóng chi tiết
            </button>
          ) : null}
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={onOpenAction}
            disabled={isMutating}
          >
            Xử lý report
          </button>
        </div>
      </header>

      {actionError ? (
        <p className="admin-inline-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <section aria-labelledby="reports-title">
        <h3 id="reports-title" className="admin-section-title">
          Báo cáo đính kèm ({detail.reports.length})
        </h3>
        <div className="admin-reports-container">
          {detail.reports.map((report) => (
            <article key={report.id} className="admin-report-card">
              <p className="admin-report-card__header">
                Người gửi ẩn danh · {new Date(report.createdAt).toLocaleString('vi-VN')}
              </p>
              <p className="admin-report-card__reason">
                {reasonLabels[report.reasonCode] ?? report.reasonCode}
              </p>
              <p className="admin-report-card__details">{report.details}</p>
              {report.evidenceUrls.length > 0 ? (
                <ul className="admin-evidence-list" aria-label="Liên kết bằng chứng">
                  {report.evidenceUrls.map((url, index) => {
                    const href = safeHttpsHref(url);
                    return (
                      <li key={`${report.id}-${index}`}>
                        <code>{url}</code>
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            Mở bằng chứng {index + 1}
                          </a>
                        ) : (
                          <span>Liên kết không hợp lệ</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {detail.targetDetails.chat ? (
        <section aria-labelledby="chat-evidence-title" className="admin-chat-evidence">
          <h3 id="chat-evidence-title" className="admin-section-title">
            Ngữ cảnh chat giới hạn
          </h3>
          <p>Chỉ hiển thị tối đa 20 tin nhắn gần nhất để phục vụ quyết định.</p>
          <ol>
            {detail.targetDetails.chat.messages.map((message) => (
              <li key={`${message.senderUserId}-${message.sequence}`}>
                <span className="font-medium">{message.senderLabel}</span>
                <span>{message.content}</span>
                <time dateTime={message.createdAt}>
                  {new Date(message.createdAt).toLocaleString('vi-VN')}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section aria-labelledby="events-title">
        <h3 id="events-title" className="admin-section-title">
          Nhật ký hoạt động
        </h3>
        {detail.events.length === 0 ? (
          <p>Chưa có hoạt động nào.</p>
        ) : (
          <ol className="admin-events-list">
            {detail.events.map((event) => (
              <li key={event.id} className="admin-event-item">
                {event.eventType} · {event.actorName ?? 'Hệ thống'} ·{' '}
                {new Date(event.createdAt).toLocaleString('vi-VN')}
                {event.note ? `: ${event.note}` : ''}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="admin-decision-box" aria-label="Xử lý report">
        <div className="admin-detail-action-row">
          <div>
            <h3>Ra quyết định kiểm duyệt</h3>
            <p>Form xử lý mở trong popup để admin chọn hành động và ghi lý do.</p>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={onOpenAction}
            disabled={isMutating}
          >
            Xử lý report
          </button>
        </div>
      </section>
    </article>
  );
}
