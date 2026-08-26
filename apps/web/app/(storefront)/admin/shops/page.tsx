'use client';

import type { AdminShopSummary } from '@shopee-clone/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useAuthSession } from '../../../../components/auth-session-provider';
import {
  adminErrorMessage,
  executeAdminShopAction,
  fetchAdminShops,
} from '../../../../lib/admin-api';
import { approveSellerShop } from '../../../../lib/seller-shop-api';

export default function AdminShopsPage() {
  const { authenticatedFetch } = useAuthSession();
  const [shops, setShops] = useState<AdminShopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>(
    'ALL',
  );
  const [onboardingFilter, setOnboardingFilter] = useState<
    'ALL' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  >('ALL');

  // Modal State
  const [selectedShop, setSelectedShop] = useState<AdminShopSummary | null>(null);
  const [actionType, setActionType] = useState<'SUSPEND' | 'RESTORE' | 'APPROVE' | 'REJECT' | null>(
    null,
  );
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadShops = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminShops(authenticatedFetch, {
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      onboardingStatus: onboardingFilter === 'ALL' ? undefined : onboardingFilter,
      q: search.trim() || undefined,
    })
      .then((res) => {
        setShops(res.items);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Không thể tải danh sách cửa hàng');
        setLoading(false);
      });
  }, [authenticatedFetch, onboardingFilter, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadShops(), 0);
    return () => window.clearTimeout(timer);
  }, [loadShops]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadShops();
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShop || !actionType) return;
    if (reason.trim().length < 8 || reason.trim().length > 240) {
      setActionError('Lý do phải có từ 8 đến 240 ký tự');
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      if (actionType === 'SUSPEND' || actionType === 'RESTORE') {
        const updated = await executeAdminShopAction(authenticatedFetch, selectedShop.id, {
          action: actionType,
          reason: reason.trim(),
        });
        setShops((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        // Refetch the authoritative list after the paired account transition commits.
        loadShops();
      } else if (actionType === 'APPROVE' || actionType === 'REJECT') {
        await approveSellerShop(authenticatedFetch, selectedShop.id, {
          decision: actionType === 'APPROVE' ? 'approve' : 'reject',
          reason: reason.trim(),
        });
        loadShops();
      }

      closeModal();
    } catch (error: unknown) {
      setActionError(adminErrorMessage(error, 'Thao tác thất bại'));
      setSubmitting(false);
    }
  };

  const openModal = (
    shop: AdminShopSummary,
    type: 'SUSPEND' | 'RESTORE' | 'APPROVE' | 'REJECT',
  ) => {
    setSelectedShop(shop);
    setActionType(type);
    setReason('');
    setActionError(null);
    setSubmitting(false);
  };

  const closeModal = () => {
    setSelectedShop(null);
    setActionType(null);
    setReason('');
    setActionError(null);
    setSubmitting(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
          Quản lý Cửa hàng (Shops)
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
          Xét duyệt hồ sơ đăng ký mở shop, quản lý trạng thái hoạt động và tạm khóa vi phạm.
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
        <form
          onSubmit={handleSearchSubmit}
          style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '280px' }}
        >
          <input
            type="text"
            placeholder="Tìm theo tên shop hoặc slug..."
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
            <label style={{ fontSize: '13px', color: '#4b5563', marginRight: '6px' }}>
              Trạng thái bán:
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED')
              }
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '13px',
              }}
            >
              <option value="ALL">Tất cả</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Tạm ngừng</option>
              <option value="SUSPENDED">Đang bị khóa</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '13px', color: '#4b5563', marginRight: '6px' }}>
              Xét duyệt:
            </label>
            <select
              value={onboardingFilter}
              onChange={(e) =>
                setOnboardingFilter(
                  e.target.value as 'ALL' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED',
                )
              }
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '13px',
              }}
            >
              <option value="ALL">Tất cả</option>
              <option value="PENDING_APPROVAL">Chờ duyệt</option>
              <option value="APPROVED">Đã phê duyệt</option>
              <option value="REJECTED">Bị từ chối</option>
            </select>
          </div>
        </div>
      </div>

      {/* Shops Table */}
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
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
            Đang tải danh sách shop...
          </div>
        ) : error ? (
          <div style={{ padding: '24px', color: '#ef4444' }}>{error}</div>
        ) : shops.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
            Không tìm thấy cửa hàng nào phù hợp.
          </div>
        ) : (
          <table
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
                <th style={{ padding: '12px 16px' }}>Tên shop & Slug</th>
                <th style={{ padding: '12px 16px' }}>Trạng thái bán</th>
                <th style={{ padding: '12px 16px' }}>Xét duyệt Onboarding</th>
                <th style={{ padding: '12px 16px' }}>Ghi chú duyệt</th>
                <th style={{ padding: '12px 16px' }}>Cập nhật</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{s.name}</div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>/shops/{s.slug}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background:
                          s.status === 'ACTIVE'
                            ? '#d1fae5'
                            : s.status === 'SUSPENDED'
                              ? '#fee2e2'
                              : '#f3f4f6',
                        color:
                          s.status === 'ACTIVE'
                            ? '#065f46'
                            : s.status === 'SUSPENDED'
                              ? '#991b1b'
                              : '#4b5563',
                      }}
                    >
                      {s.status === 'ACTIVE'
                        ? 'Hoạt động'
                        : s.status === 'SUSPENDED'
                          ? 'Tạm khóa'
                          : 'Tạm ngừng'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background:
                          s.onboardingStatus === 'APPROVED'
                            ? '#d1fae5'
                            : s.onboardingStatus === 'REJECTED'
                              ? '#fee2e2'
                              : '#fef3c7',
                        color:
                          s.onboardingStatus === 'APPROVED'
                            ? '#065f46'
                            : s.onboardingStatus === 'REJECTED'
                              ? '#991b1b'
                              : '#92400e',
                      }}
                    >
                      {s.onboardingStatus === 'APPROVED'
                        ? 'Đã duyệt'
                        : s.onboardingStatus === 'REJECTED'
                          ? 'Bị từ chối'
                          : 'Chờ duyệt'}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      color: '#6b7280',
                      fontSize: '13px',
                      maxWidth: '200px',
                    }}
                  >
                    {s.onboardingReason || '—'}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#6b7280', fontSize: '13px' }}>
                    {new Date(s.updatedAt).toLocaleDateString('vi-VN')}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      {s.onboardingStatus === 'PENDING_APPROVAL' && (
                        <>
                          <button
                            onClick={() => openModal(s, 'APPROVE')}
                            className="admin-btn-success-outline"
                            style={{
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            Duyệt
                          </button>
                          <button
                            onClick={() => openModal(s, 'REJECT')}
                            className="admin-btn-danger-outline"
                            style={{
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            Từ chối
                          </button>
                        </>
                      )}

                      {s.onboardingStatus === 'APPROVED' && (
                        <>
                          {s.status === 'ACTIVE' ? (
                            <button
                              onClick={() => openModal(s, 'SUSPEND')}
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
                              onClick={() => openModal(s, 'RESTORE')}
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
                        </>
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
      {actionType && selectedShop && (
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
            <h2
              style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}
            >
              {actionType === 'SUSPEND'
                ? `Tạm khóa shop: ${selectedShop.name}`
                : actionType === 'RESTORE'
                  ? `Mở khóa shop: ${selectedShop.name}`
                  : actionType === 'APPROVE'
                    ? `Phê duyệt mở shop: ${selectedShop.name}`
                    : `Từ chối duyệt shop: ${selectedShop.name}`}
            </h2>

            <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '16px' }}>
              {actionType === 'SUSPEND'
                ? 'Khi khóa shop, toàn bộ sản phẩm và trang storefront của shop sẽ bị ẩn khỏi người mua.'
                : actionType === 'RESTORE'
                  ? 'Khôi phục shop về trạng thái hoạt động bình thường.'
                  : actionType === 'APPROVE'
                    ? 'Chấp thuận đăng ký và tự động cấp quyền Seller cho chủ sở hữu shop.'
                    : 'Từ chối đơn đăng ký mở shop này.'}
            </p>

            {actionType === 'SUSPEND' || actionType === 'RESTORE' ? (
              <p role="note" style={{ fontSize: '13px', color: '#b45309', marginBottom: '16px' }}>
                Với shop seller đã duyệt, thao tác này cập nhật đồng thời tài khoản sở hữu và shop;
                khôi phục không tự mở lại các phiên đã bị thu hồi.
              </p>
            ) : null}

            <form onSubmit={handleActionSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Lý do quyết định (Bắt buộc, 8 - 240 ký tự):
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
                    background:
                      actionType === 'SUSPEND' || actionType === 'REJECT' ? '#dc2626' : '#ee4d2d',
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
