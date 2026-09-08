'use client';

import type { AdminUserSummary } from '@shopee-clone/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useAuthSession } from '../../../../components/auth-session-provider';
import { AdminEntityLink } from '../../../../components/admin/admin-entity-link';
import { LockIcon, UnlockIcon } from '../../../../components/admin/admin-icons';
import { AdminPagination } from '../../../../components/admin/admin-pagination';
import {
  adminErrorMessage,
  executeAdminUserAction,
  fetchAdminUsers,
} from '../../../../lib/admin-api';

export default function AdminUsersPage() {
  const { authenticatedFetch } = useAuthSession();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'buyer' | 'seller' | 'admin'>('ALL');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Action Modal State
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [actionType, setActionType] = useState<'SUSPEND' | 'RESTORE' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAdminUsers(authenticatedFetch, {
        page,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        role: roleFilter === 'ALL' ? undefined : roleFilter,
        q: search || undefined,
      });
      const lastAvailablePage = Math.max(1, response.totalPages);
      if (page > lastAvailablePage) {
        setPage(lastAvailablePage);
        return;
      }
      setUsers(response.items);
      setTotalItems(response.totalItems);
      setTotalPages(response.totalPages);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, page, roleFilter, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextSearch = searchInput.trim();
    if (page === 1 && search === nextSearch) {
      void loadUsers();
      return;
    }
    setSearch(nextSearch);
    setPage(1);
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
        // Refetch the authoritative list so paired shop/account state is not left stale.
        void loadUsers();
      }
      closeModal();
    } catch (error: unknown) {
      setActionError(adminErrorMessage(error, 'Thao tác thất bại'));
      setSubmitting(false);
    }
  };

  const openModal = (user: AdminUserSummary, type: 'SUSPEND' | 'RESTORE') => {
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
    <div className="admin-page admin-users-page">
      {/* Filter Bar */}
      <div
        className="admin-toolbar admin-users-toolbar"
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
        <form
          className="admin-toolbar__search"
          onSubmit={handleSearchSubmit}
          style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '280px' }}
        >
          <input
            className="admin-control admin-toolbar__search-input"
            type="text"
            placeholder="Tìm theo email hoặc tên..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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

        <div className="admin-toolbar__filters">
          <div className="admin-field">
            <label htmlFor="admin-user-status">Trạng thái:</label>
            <select
              id="admin-user-status"
              className="admin-control"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'SUSPENDED');
                setPage(1);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '13px',
              }}
            >
              <option value="ALL">Tất cả</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="SUSPENDED">Đã tạm khóa</option>
            </select>
          </div>

          <div className="admin-field">
            <label htmlFor="admin-user-role">Vai trò:</label>
            <select
              id="admin-user-role"
              className="admin-control"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as 'ALL' | 'buyer' | 'seller' | 'admin');
                setPage(1);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '13px',
              }}
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
        className="admin-table-card admin-entity-list-card"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden',
          border: '1px solid #f3f4f6',
        }}
      >
        {loading ? (
          <div className="admin-state-card__message">Đang tải danh sách người dùng...</div>
        ) : error ? (
          <div className="admin-state-card__message admin-state-card__message--error">{error}</div>
        ) : users.length === 0 ? (
          <div className="admin-state-card__message">Không tìm thấy người dùng nào phù hợp.</div>
        ) : (
          <>
            <div className="admin-table-scroll admin-users-table-scroll">
              <table
                className="admin-data-table admin-management-table admin-users-table"
                style={{
                  width: '100%',
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
                    <th style={{ padding: '12px 16px' }} className="management-table-id-cell">ID</th>
                    <th style={{ padding: '12px 16px' }}>Họ tên & Email</th>
                    <th style={{ padding: '12px 16px' }}>Số điện thoại</th>
                    <th style={{ padding: '12px 16px' }}>Vai trò</th>
                    <th style={{ padding: '12px 16px' }}>Trạng thái</th>
                    <th style={{ padding: '12px 16px' }}>Ngày tạo</th>
                    <th className="admin-table-cell--actions admin-users-table__actions">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="management-table-id-cell" style={{ padding: '14px 16px' }}>{u.id}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <AdminEntityLink
                          href={`/admin/users/${u.id}`}
                          name={u.displayName}
                          imageUrl={u.avatarUrl}
                          meta={u.email}
                        />
                      </td>
                      <td style={{ padding: '14px 16px', color: '#4b5563' }}>
                        {u.phoneNumber || '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div className="admin-badge-list">
                          {u.roles.map((r) => (
                            <span
                              className={`admin-badge admin-badge--role-${r}`}
                              key={r}
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background:
                                  r === 'admin'
                                    ? '#fef3c7'
                                    : r === 'seller'
                                      ? '#e0e7ff'
                                      : '#f3f4f6',
                                color:
                                  r === 'admin'
                                    ? '#92400e'
                                    : r === 'seller'
                                      ? '#3730a3'
                                      : '#4b5563',
                              }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          className={`admin-badge admin-table-status ${u.status === 'ACTIVE' ? 'admin-badge--success' : 'admin-badge--danger'}`}
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
                      <td className="admin-table-cell--actions admin-users-table__actions">
                        <div className="admin-table-actions">
                          {u.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              onClick={() => openModal(u, 'SUSPEND')}
                              className="admin-icon-btn admin-icon-btn--danger"
                              aria-label={`Khóa tài khoản ${u.displayName}`}
                              title="Khóa tài khoản"
                            >
                              <LockIcon aria-hidden="true" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openModal(u, 'RESTORE')}
                              className="admin-icon-btn admin-icon-btn--success"
                              aria-label={`Mở khóa tài khoản ${u.displayName}`}
                              title="Mở khóa tài khoản"
                            >
                              <UnlockIcon aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination
              itemLabel="người dùng"
              page={page}
              totalItems={totalItems}
              totalPages={totalPages}
              disabled={loading}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {/* Confirmation Modal */}
      {actionType && selectedUser && (
        <div
          className="admin-dialog-backdrop"
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
            className="admin-dialog"
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h2
              style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}
            >
              {actionType === 'SUSPEND'
                ? `Tạm khóa tài khoản: ${selectedUser.displayName}`
                : `Mở khóa tài khoản: ${selectedUser.displayName}`}
            </h2>

            <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '16px' }}>
              {actionType === 'SUSPEND'
                ? 'Khi khóa, toàn bộ các phiên đăng nhập đang hoạt động của người dùng sẽ bị thu hồi ngay lập tức.'
                : 'Khôi phục trạng thái hoạt động bình thường cho tài khoản này.'}
            </p>

            {selectedUser.roles.includes('seller') ? (
              <p role="note" style={{ fontSize: '13px', color: '#b45309', marginBottom: '16px' }}>
                Thao tác này áp dụng đồng thời cho tài khoản seller và shop duy nhất của tài khoản;
                các phiên đăng nhập hiện tại sẽ bị thu hồi khi khóa.
              </p>
            ) : null}

            <form className="admin-dialog__form" onSubmit={handleActionSubmit}>
              <div className="admin-field">
                <label
                  htmlFor="admin-user-action-reason"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Lý do thao tác (Bắt buộc, 8 - 240 ký tự):
                </label>
                <textarea
                  id="admin-user-action-reason"
                  className="admin-control admin-control--textarea"
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
                <div
                  role="alert"
                  aria-live="assertive"
                  style={{
                    padding: '8px 12px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    borderRadius: '6px',
                    fontSize: '13px',
                    marginBottom: '16px',
                  }}
                >
                  {actionError}
                </div>
              )}

              <div className="admin-dialog__actions">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="admin-btn admin-btn-secondary"
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
                  className={`admin-btn ${actionType === 'SUSPEND' ? 'admin-btn-danger' : 'admin-btn-primary'}`}
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
