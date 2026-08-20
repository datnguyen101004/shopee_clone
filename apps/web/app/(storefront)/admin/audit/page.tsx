'use client';

import type {
  AdminPrivilegedAction,
  AdminPrivilegedAuditEventSummary,
  AdminPrivilegedTargetType,
} from '@shopee-clone/contracts';
import { useEffect, useState } from 'react';

import { useAuthSession } from '../../../../components/auth-session-provider';
import { fetchAdminAudit } from '../../../../lib/admin-api';

export default function AdminAuditPage() {
  const { authenticatedFetch } = useAuthSession();
  const [events, setEvents] = useState<AdminPrivilegedAuditEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [targetTypeFilter, setTargetTypeFilter] = useState<'ALL' | AdminPrivilegedTargetType>('ALL');
  const [actionFilter, setActionFilter] = useState<'ALL' | AdminPrivilegedAction>('ALL');

  // Expanded payload
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadAudit = () => {
    setLoading(true);
    setError(null);
    fetchAdminAudit(authenticatedFetch, {
      targetType: targetTypeFilter === 'ALL' ? undefined : targetTypeFilter,
      action: actionFilter === 'ALL' ? undefined : actionFilter,
      limit: 50,
    })
      .then((res) => {
        setEvents(res.items);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Không thể tải nhật ký kiểm toán');
        setLoading(false);
      });
  };

  useEffect(() => {
    loadAudit();
  }, [targetTypeFilter, actionFilter]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getActionColor = (action: AdminPrivilegedAction) => {
    switch (action) {
      case 'SUSPEND':
      case 'DELETE':
      case 'REJECT':
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>Nhật ký Thao tác Đặc quyền (Audit Trail)</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
          Lưu vết bất biến (Append-only) mọi hành động can thiệp của Quản trị viên đối với User, Shop, Danh mục và Trang chủ.
        </p>
      </div>

      {/* Filter Bar */}
      <div
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
        <div>
          <label style={{ fontSize: '13px', color: '#4b5563', marginRight: '6px' }}>Đối tượng tác động:</label>
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value as any)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
          >
            <option value="ALL">Tất cả đối tượng</option>
            <option value="USER">Người dùng (USER)</option>
            <option value="SHOP">Cửa hàng (SHOP)</option>
            <option value="CATEGORY">Danh mục (CATEGORY)</option>
            <option value="BANNER">Banner (BANNER)</option>
            <option value="HOMEPAGE_MODULE">Module trang chủ (HOMEPAGE_MODULE)</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '13px', color: '#4b5563', marginRight: '6px' }}>Hành động:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as any)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
          >
            <option value="ALL">Tất cả hành động</option>
            <option value="SUSPEND">Khóa (SUSPEND)</option>
            <option value="RESTORE">Mở khóa (RESTORE)</option>
            <option value="APPROVE">Phê duyệt (APPROVE)</option>
            <option value="REJECT">Từ chối (REJECT)</option>
            <option value="CREATE">Tạo mới (CREATE)</option>
            <option value="UPDATE">Cập nhật (UPDATE)</option>
            <option value="DELETE">Xóa (DELETE)</option>
            <option value="REORDER">Sắp xếp lại (REORDER)</option>
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden',
          border: '1px solid #f3f4f6',
        }}
      >
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>Đang tải nhật ký kiểm toán...</div>
        ) : error ? (
          <div style={{ padding: '24px', color: '#ef4444' }}>{error}</div>
        ) : events.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>Chưa có bản ghi nhật ký nào.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', fontSize: '13px' }}>
                <th style={{ padding: '12px 16px' }}>Thời gian (UTC+7)</th>
                <th style={{ padding: '12px 16px' }}>Admin thực hiện</th>
                <th style={{ padding: '12px 16px' }}>Hành động</th>
                <th style={{ padding: '12px 16px' }}>Đối tượng tác động</th>
                <th style={{ padding: '12px 16px' }}>Lý do</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const actionBadge = getActionColor(ev.action);
                const isExpanded = expandedId === ev.id;
                return (
                  <tr key={ev.id} style={{ borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }}>
                    <td style={{ padding: '14px 16px', color: '#4b5563', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {new Date(ev.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{ev.actorDisplayName || 'Administrator'}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{ev.actorEmail || ev.actorUserId}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
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
                        {ev.action}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#374151' }}>{ev.targetType}</div>
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{ev.targetId}</div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#111827', maxWidth: '300px' }}>
                      {ev.reason}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {(ev.beforeSummary || ev.afterSummary) && (
                        <button
                          onClick={() => toggleExpand(ev.id)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            color: '#4f46e5',
                            background: '#eef2ff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          {isExpanded ? 'Ẩn Diff' : 'Xem Diff'}
                        </button>
                      )}

                      {isExpanded && (
                        <div
                          style={{
                            marginTop: '12px',
                            padding: '12px',
                            background: '#1e293b',
                            color: '#f8fafc',
                            borderRadius: '8px',
                            fontSize: '12px',
                            textAlign: 'left',
                            fontFamily: 'monospace',
                            overflowX: 'auto',
                          }}
                        >
                          {ev.beforeSummary && (
                            <div style={{ marginBottom: '8px' }}>
                              <div style={{ color: '#f87171', fontWeight: 600 }}>// Trước thay đổi:</div>
                              <pre style={{ margin: 0 }}>{JSON.stringify(ev.beforeSummary, null, 2)}</pre>
                            </div>
                          )}
                          {ev.afterSummary && (
                            <div>
                              <div style={{ color: '#4ade80', fontWeight: 600 }}>// Sau thay đổi:</div>
                              <pre style={{ margin: 0 }}>{JSON.stringify(ev.afterSummary, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
