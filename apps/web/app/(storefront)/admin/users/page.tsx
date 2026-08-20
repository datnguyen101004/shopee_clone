'use client';

import type { AdminUserSummary } from '@shopee-clone/contracts';
import { useEffect, useState } from 'react';

import { useAuthSession } from '../../../../components/auth-session-provider';
import { executeAdminUserAction, fetchAdminUsers } from '../../../../lib/admin-api';
import { grantRole, revokeRole } from '../../../../lib/role-api';

export default function AdminUsersPage() {
  const { authenticatedFetch } = useAuthSession();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'buyer' | 'seller' | 'admin'>('ALL');

  // Action Modal State
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [actionType, setActionType] = useState<'SUSPEND' | 'RESTORE' | 'GRANT_ROLE' | 'REVOKE_ROLE' | null>(null);
  const [targetRole, setTargetRole] = useState<'seller' | 'admin'>('seller');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadUsers = () => {
    setLoading(true);
    setError(null);
    fetchAdminUsers(authenticatedFetch, {
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      role: roleFilter === 'ALL' ? undefined : roleFilter,
      q: search.trim() || undefined,
    })
      .then((res) => {
        setUsers(res.items);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Không thể tải danh sách người dùng');
        setLoading(false);
      });
  };

  useEffect(() => {
    loadUsers();
  }, [statusFilter, roleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers();
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !actionType) return;
    if (reason.trim().length < 8 || reason.trim().length > 240) {
      setActionError('Lý do phải có từ 8 đến 240 ký tự');
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      if (actionType === 'SUSPEND' || actionType === 'RESTORE') {
        const updated = await executeAdminUserAction(authenticatedFetch, selectedUser.id, {
          action: actionType,
          reason: reason.trim(),
        });
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      } else if (actionType === 'GRANT_ROLE') {
        await grantRole(authenticatedFetch, selectedUser.id, targetRole, reason.trim());
        loadUsers();
      } else if (actionType === 'REVOKE_ROLE') {
        await revokeRole(authenticatedFetch, selectedUser.id, targetRole, reason.trim());
        loadUsers();
      }
      closeModal();
    } catch (err: any) {
      setActionError(err.problem?.detail || err.message || 'Thao tác thất bại');
      setSubmitting(false);
    }
  };

  const openModal = (user: AdminUserSummary, type: 'SUSPEND' | 'RESTORE' | 'GRANT_ROLE' | 'REVOKE_ROLE') => {
    setSelectedUser(user);
    setActionType(type);
    setReason('');
    setActionError(null);
    setSubmitting(false);
  };

  const closeModal = () => {
    setSelectedUser(null);
    setActionType(null);
    setReason('');
    setActionError(null);
    setSubmitting(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>Quản lý Người dùng</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
          Tra cứu thông tin tài khoản, thay đổi trạng thái khóa/mở và phân quyền vai trò.
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
          justifyContent: 'space-between',
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '280px' }}>
          <input
            type="text"
            placeholder="Tìm theo email hoặc tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            style={{
              padding: '8px 18px',
              fontSize: '14px',
            }}
          >
            Tìm kiếm
          </button>
        </form>


        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '13px', color: '#4b5563', marginRight: '6px' }}>Trạng thái:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
            >
              <option value="ALL">Tất cả</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="SUSPENDED">Đã tạm khóa</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '13px', color: '#4b5563', marginRight: '6px' }}>Vai trò:</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
            >
              <option value="ALL">Tất cả vai trò</option>
              <option value="buyer">Người mua (Buyer)</option>
              <option value="seller">Người bán (Seller)</option>
              <option value="admin">Quản trị viên (Admin)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
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
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>Đang tải danh sách người dùng...</div>
        ) : error ? (
          <div style={{ padding: '24px', color: '#ef4444' }}>{error}</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>Không tìm thấy người dùng nào phù hợp.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', fontSize: '13px' }}>
                <th style={{ padding: '12px 16px' }}>Họ tên & Email</th>
                <th style={{ padding: '12px 16px' }}>Số điện thoại</th>
                <th style={{ padding: '12px 16px' }}>Vai trò</th>
                <th style={{ padding: '12px 16px' }}>Trạng thái</th>
                <th style={{ padding: '12px 16px' }}>Ngày tạo</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{u.displayName}</div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>{u.email}</div>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#4b5563' }}>{u.phoneNumber || '—'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {u.roles.map((r) => (
                        <span
                          key={r}
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: r === 'admin' ? '#fef3c7' : r === 'seller' ? '#e0e7ff' : '#f3f4f6',
                            color: r === 'admin' ? '#92400e' : r === 'seller' ? '#3730a3' : '#4b5563',
                          }}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: u.status === 'ACTIVE' ? '#d1fae5' : '#fee2e2',
                        color: u.status === 'ACTIVE' ? '#065f46' : '#991b1b',
                      }}
                    >
                      {u.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#6b7280', fontSize: '13px' }}>
                    {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      {u.status === 'ACTIVE' ? (
                        <button
                          onClick={() => openModal(u, 'SUSPEND')}
                          className="admin-btn-danger-outline"
                          style={{
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Khóa
                        </button>
                      ) : (
                        <button
                          onClick={() => openModal(u, 'RESTORE')}
                          className="admin-btn-success-outline"
                          style={{
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Mở khóa
                        </button>
                      )}

                      {!u.roles.includes('admin') && (
                        <button
                          onClick={() => openModal(u, 'GRANT_ROLE')}
                          className="admin-btn admin-btn-secondary"
                          style={{
                            padding: '5px 12px',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          Phân quyền
                        </button>
                      )}

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirmation Modal */}
      {actionType && selectedUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
              {actionType === 'SUSPEND'
                ? `Tạm khóa tài khoản: ${selectedUser.displayName}`
                : actionType === 'RESTORE'
                  ? `Mở khóa tài khoản: ${selectedUser.displayName}`
                  : `Cấp vai trò cho: ${selectedUser.displayName}`}
            </h2>

            <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '16px' }}>
              {actionType === 'SUSPEND'
                ? 'Khi khóa, toàn bộ các phiên đăng nhập đang hoạt động của người dùng sẽ bị thu hồi ngay lập tức.'
                : actionType === 'RESTORE'
                  ? 'Khôi phục trạng thái hoạt động bình thường cho tài khoản này.'
                  : 'Chỉ cấp quyền khi có sự phê duyệt hợp lệ.'}
            </p>

            {actionType === 'GRANT_ROLE' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Vai trò cần cấp:
                </label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as any)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
                >
                  <option value="seller">Người bán (Seller)</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                </select>
              </div>
            )}

            <form onSubmit={handleActionSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Lý do thao tác (Bắt buộc, 8 - 240 ký tự):
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Nhập lý do chi tiết..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                  }}
                  required
                />
              </div>

              {actionError && (
                <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                  {actionError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  style={{
                    padding: '8px 16px',
                    background: '#f3f4f6',
                    color: '#4b5563',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '8px 16px',
                    background: actionType === 'SUSPEND' ? '#dc2626' : '#ee4d2d',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  {submitting ? 'Đang xử lý...' : 'Xác nhận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
