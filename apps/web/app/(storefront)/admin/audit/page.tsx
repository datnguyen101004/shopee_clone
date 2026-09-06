'use client';

import type {
  AdminPrivilegedAction,
  AdminPrivilegedAuditEventSummary,
  AdminPrivilegedTargetType,
} from '@shopee-clone/contracts';
import { Fragment, useCallback, useEffect, useState } from 'react';

import { AdminEntityLink } from '../../../../components/admin/admin-entity-link';
import { EyeIcon } from '../../../../components/admin/admin-icons';
import { useAuthSession } from '../../../../components/auth-session-provider';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_LABELS,
  formatAuditDate,
  getAuditSummaryChanges,
} from '../../../../lib/admin-audit-display';
import { fetchAdminAudit } from '../../../../lib/admin-api';

const TARGET_TYPE_OPTIONS = Object.entries(AUDIT_TARGET_LABELS) as Array<
  [AdminPrivilegedTargetType, string]
>;
const ACTION_OPTIONS = Object.entries(AUDIT_ACTION_LABELS) as Array<
  [AdminPrivilegedAction, string]
>;

function summaryText(event: AdminPrivilegedAuditEventSummary, key: string): string | undefined {
  const after = event.afterSummary?.[key];
  const before = event.beforeSummary?.[key];
  return typeof after === 'string' ? after : typeof before === 'string' ? before : undefined;
}

function auditTarget(event: AdminPrivilegedAuditEventSummary) {
  const href =
    event.targetType === 'USER'
      ? `/admin/users/${event.targetId}`
      : event.targetType === 'SHOP'
        ? `/admin/shops/${event.targetId}`
        : event.targetType === 'CATEGORY'
          ? `/admin/categories#admin-category-${event.targetId}`
          : event.targetType === 'BANNER'
            ? `/admin/homepage#admin-banner-${event.targetId}`
            : event.targetType === 'HOMEPAGE_MODULE'
              ? `/admin/homepage#admin-module-${event.targetId}`
              : event.targetType === 'PRODUCT'
                ? `/admin/products/${event.targetId}`
                : event.targetType === 'MODERATION_CASE'
                  ? `/admin/moderation/${event.targetId}`
                  : event.targetType === 'RETURN_REQUEST'
                    ? `/admin/returns/${event.targetId}`
                    : `/admin/moderation?reviewId=${encodeURIComponent(event.targetId)}`;
  const name =
    event.targetName ??
    summaryText(event, 'name') ??
    summaryText(event, 'title') ??
    summaryText(event, 'displayName') ??
    AUDIT_TARGET_LABELS[event.targetType];
  const imageUrl =
    event.targetImageUrl ??
    summaryText(event, 'imageUrl') ??
    summaryText(event, 'logoUrl') ??
    summaryText(event, 'primaryImageUrl') ??
    summaryText(event, 'avatarUrl');
  return { href, name, imageUrl };
}

export default function AdminAuditPage() {
  const { authenticatedFetch } = useAuthSession();
  const [events, setEvents] = useState<AdminPrivilegedAuditEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetTypeFilter, setTargetTypeFilter] = useState<'ALL' | AdminPrivilegedTargetType>(
    'ALL',
  );
  const [actionFilter, setActionFilter] = useState<'ALL' | AdminPrivilegedAction>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchAdminAudit(authenticatedFetch, {
        targetType: targetTypeFilter === 'ALL' ? undefined : targetTypeFilter,
        action: actionFilter === 'ALL' ? undefined : actionFilter,
        limit: 50,
      });
      setEvents(response.items);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Không thể tải nhật ký kiểm toán',
      );
    } finally {
      setLoading(false);
    }
  }, [actionFilter, authenticatedFetch, targetTypeFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAudit(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAudit]);

  const toggleExpand = (id: string) => {
    setExpandedId((previous) => (previous === id ? null : id));
  };

  const getActionColor = (action: AdminPrivilegedAction) => {
    switch (action) {
      case 'SUSPEND':
      case 'DELETE':
      case 'REJECT':
      case 'HIDE':
        return { bg: '#fee2e2', color: '#991b1b' };
      case 'RESTORE':
      case 'CREATE':
      case 'APPROVE':
        return { bg: '#d1fae5', color: '#065f46' };
      case 'UPDATE':
      case 'REORDER':
        return { bg: '#e0e7ff', color: '#3730a3' };
      default:
        return { bg: '#f3f4f6', color: '#4b5563' };
    }
  };

  return (
    <div className="admin-page admin-audit-page">
      <div
        className="admin-toolbar admin-audit-toolbar"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div className="admin-field">
          <label
            htmlFor="audit-target-type"
            style={{ fontSize: '13px', color: '#4b5563', marginRight: '6px' }}
          >
            Đối tượng tác động:
          </label>
          <select
            className="admin-control"
            id="audit-target-type"
            aria-label="Lọc theo đối tượng tác động"
            value={targetTypeFilter}
            onChange={(event) =>
              setTargetTypeFilter(event.target.value as 'ALL' | AdminPrivilegedTargetType)
            }
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '13px',
            }}
          >
            <option value="ALL">Tất cả đối tượng</option>
            {TARGET_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-field">
          <label
            htmlFor="audit-action"
            style={{ fontSize: '13px', color: '#4b5563', marginRight: '6px' }}
          >
            Hành động:
          </label>
          <select
            className="admin-control"
            id="audit-action"
            aria-label="Lọc theo hành động"
            value={actionFilter}
            onChange={(event) =>
              setActionFilter(event.target.value as 'ALL' | AdminPrivilegedAction)
            }
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '13px',
            }}
          >
            <option value="ALL">Tất cả hành động</option>
            {ACTION_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="admin-table-card"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden',
          border: '1px solid #f3f4f6',
        }}
      >
        {loading ? (
          <div className="admin-state-card__message">Đang tải nhật ký kiểm toán...</div>
        ) : error ? (
          <div className="admin-state-card__message admin-state-card__message--error">{error}</div>
        ) : events.length === 0 ? (
          <div className="admin-state-card__message">Chưa có bản ghi nhật ký nào.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              className="admin-data-table admin-audit-table"
              style={{
                width: '100%',
                minWidth: '960px',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '14px',
              }}
            >
              <thead>
                <tr
                  style={{
                    background: '#f9fafb',
                    borderBottom: '1px solid #e5e7eb',
                    color: '#4b5563',
                    fontSize: '13px',
                  }}
                >
                  <th style={{ padding: '12px 16px' }}>Thời gian (UTC+7)</th>
                  <th style={{ padding: '12px 16px' }}>Admin thực hiện</th>
                  <th style={{ padding: '12px 16px' }}>Hành động</th>
                  <th style={{ padding: '12px 16px' }}>Đối tượng tác động</th>
                  <th style={{ padding: '12px 16px' }}>Lý do</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const actionBadge = getActionColor(event.action);
                  const changes = getAuditSummaryChanges(event.beforeSummary, event.afterSummary);
                  const isExpanded = expandedId === event.id;
                  const detailId = `audit-change-${event.id}`;

                  return (
                    <Fragment key={event.id}>
                      <tr
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid #f3f4f6',
                          verticalAlign: 'top',
                        }}
                      >
                        <td
                          style={{
                            padding: '14px 16px',
                            color: '#4b5563',
                            fontSize: '13px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatAuditDate(event.createdAt)}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <AdminEntityLink
                            href={`/admin/users/${event.actorUserId}`}
                            name={event.actorDisplayName || 'Quản trị viên'}
                            meta={event.actorEmail}
                          />
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span
                            title={event.action}
                            style={{
                              display: 'inline-block',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: actionBadge.bg,
                              color: actionBadge.color,
                            }}
                          >
                            {AUDIT_ACTION_LABELS[event.action]}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', minWidth: '230px' }}>
                          {(() => {
                            const target = auditTarget(event);
                            return (
                              <AdminEntityLink
                                href={target.href}
                                name={target.name}
                                imageUrl={target.imageUrl}
                                meta={AUDIT_TARGET_LABELS[event.targetType]}
                              />
                            );
                          })()}
                        </td>
                        <td style={{ padding: '14px 16px', color: '#111827', maxWidth: '300px' }}>
                          {event.reason}
                        </td>
                        <td className="admin-table-cell--actions admin-audit-actions-cell">
                          {changes.length > 0 ? (
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn--secondary"
                              aria-label={isExpanded ? 'Ẩn thay đổi' : 'Xem thay đổi'}
                              aria-controls={detailId}
                              aria-expanded={isExpanded}
                              title={isExpanded ? 'Ẩn thay đổi' : 'Xem thay đổi'}
                              onClick={() => toggleExpand(event.id)}
                            >
                              <EyeIcon aria-hidden="true" />
                            </button>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                              Không có thay đổi trạng thái
                            </span>
                          )}
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td colSpan={6} style={{ padding: '0 16px 16px' }}>
                            <section
                              id={detailId}
                              aria-label={`Chi tiết thay đổi của ${AUDIT_TARGET_LABELS[event.targetType]}`}
                              style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '14px 16px',
                              }}
                            >
                              <div
                                style={{
                                  color: '#334155',
                                  fontWeight: 700,
                                  fontSize: '13px',
                                  marginBottom: '10px',
                                }}
                              >
                                Thay đổi đã ghi nhận
                              </div>
                              <dl
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns:
                                    'minmax(150px, 0.8fr) minmax(180px, 1fr) minmax(180px, 1fr)',
                                  gap: '8px 16px',
                                  margin: 0,
                                }}
                              >
                                <dt style={{ color: '#475569', fontWeight: 600 }}>Trường</dt>
                                <dt style={{ color: '#991b1b', fontWeight: 600 }}>Trước</dt>
                                <dt style={{ color: '#166534', fontWeight: 600 }}>Sau</dt>
                                {changes.map((change) => (
                                  <Fragment key={change.key}>
                                    <dd style={{ margin: 0, color: '#334155', fontWeight: 600 }}>
                                      {change.label}
                                    </dd>
                                    <dd style={{ margin: 0, color: '#7f1d1d' }}>
                                      {change.before ?? '—'}
                                    </dd>
                                    <dd style={{ margin: 0, color: '#166534' }}>
                                      {change.after ?? '—'}
                                    </dd>
                                  </Fragment>
                                ))}
                              </dl>
                            </section>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
