'use client';

import type { AdminProductDetail } from '@shopee-clone/contracts';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { ProductIcon, ShopIcon } from '../../../../components/admin/admin-icons';
import { useAuthSession } from '../../../../components/auth-session-provider';
import { applyAdminProductAction, lookupAdminProduct } from '../../../../lib/admin-api';

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export default function AdminProductsPage() {
  const { authenticatedFetch } = useAuthSession();
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [searched, setSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Action modal state
  const [modalAction, setModalAction] = useState<'SUSPEND' | 'RESTORE' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSearch = async (searchTerm?: string) => {
    const term = (searchTerm ?? query).trim();
    if (!term) return;

    setLoading(true);
    setErrorMessage(null);
    setSearched(true);
    setSearchedQuery(term);

    try {
      const res = await lookupAdminProduct(authenticatedFetch, { slug: term, id: term });
      setProduct(res.product);
    } catch (err: any) {
      setErrorMessage(err.problem?.detail || err.message || 'Lỗi khi tra cứu sản phẩm');
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (!product || !modalAction) return;
    if (reason.trim().length < 8) {
      setActionError('Lý do phải có ít nhất 8 ký tự.');
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      const result = await applyAdminProductAction(authenticatedFetch, product.id, {
        action: modalAction,
        reason: reason.trim(),
      });

      setProduct((prev) => (prev ? { ...prev, moderationStatus: result.moderationStatus } : null));
      setModalAction(null);
      setReason('');
    } catch (err: any) {
      setActionError(err.problem?.detail || err.message || 'Lỗi thực hiện hành động');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>Kiểm soát Sản phẩm</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
          Tra cứu nhanh chi tiết sản phẩm theo Slug hoặc UUID để kiểm duyệt, khóa hoặc mở khóa sản phẩm vi phạm.
        </p>
      </div>

      {/* Search Input Bar */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          border: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSearch();
          }}
          style={{ display: 'flex', gap: '12px' }}
        >
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập slug (ví dụ: ao-thun-nam-cotton) hoặc UUID sản phẩm..."
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="admin-btn admin-btn-primary"
            style={{
              padding: '12px 24px',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Đang tìm...' : 'Tra cứu'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#6b7280', flexWrap: 'wrap' }}>
          <span>Gợi ý thử nhanh:</span>
          {['ao-thun-nam', 'tai-nghe-bluetooth', 'kem-chong-nang'].map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => {
                setQuery(sample);
                void handleSearch(sample);
              }}
              className="admin-chip-btn"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>


      {/* Error Message */}
      {errorMessage && (
        <div
          style={{
            padding: '14px 18px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Empty State when searched and not found */}
      {searched && !loading && !product && !errorMessage && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '48px 24px',
            textAlign: 'center',
            border: '1px solid #e5e7eb',
            color: '#6b7280',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔍</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
            Không tìm thấy sản phẩm nào
          </div>
          <p style={{ fontSize: '14px', marginTop: '4px' }}>
            Không có sản phẩm nào khớp với từ khóa &ldquo;<strong>{searchedQuery}</strong>&rdquo;. Vui lòng kiểm tra lại slug hoặc ID.
          </p>
        </div>
      )}

      {/* Product Detail Card */}
      {product && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Main Info Card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              {/* Product Primary Image */}
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '10px',
                  background: '#f3f4f6',
                  overflow: 'hidden',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #e5e7eb',
                }}
              >
                {product.images.length > 0 && product.images[0] ? (
                  <Image
                    src={product.images[0].url}
                    alt={product.name}
                    width={120}
                    height={120}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    unoptimized
                  />
                ) : (

                  <ProductIcon size={40} color="#9ca3af" />
                )}
              </div>

              {/* Basic Info */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: product.moderationStatus === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                      color: product.moderationStatus === 'ACTIVE' ? '#166534' : '#991b1b',
                    }}
                  >
                    Kiểm duyệt: {product.moderationStatus === 'ACTIVE' ? 'Đang hoạt động' : 'ĐÃ BỊ KHÓA'}
                  </span>

                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: '#f3f4f6',
                      color: '#4b5563',
                    }}
                  >
                    Trạng thái: {product.status}
                  </span>

                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                    }}
                  >
                    {product.categoryName}
                  </span>
                </div>

                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '4px 0 0 0' }}>
                  {product.name}
                </h2>

                <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span>
                    Slug: <code>{product.slug}</code>
                  </span>
                  <span>UUID: {product.id}</span>
                </div>

                <div style={{ fontSize: '13px', color: '#374151', display: 'flex', gap: '20px', marginTop: '4px' }}>
                  <span>⭐ {(product.ratingAverageBasisPoints / 100).toFixed(1)} / 5.0 ({product.ratingCount} đánh giá)</span>
                  <span>Đã bán: <strong>{product.soldCount}</strong></span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                <Link
                  href={`/products/${product.slug}`}
                  target="_blank"
                  className="admin-btn admin-btn-secondary"
                  style={{
                    fontSize: '13px',
                    padding: '8px 14px',
                    color: '#2563eb',
                  }}
                >
                  Xem trên Storefront ↗
                </Link>

                {product.moderationStatus === 'ACTIVE' ? (
                  <button
                    onClick={() => {
                      setModalAction('SUSPEND');
                      setActionError(null);
                      setReason('');
                    }}
                    className="admin-btn admin-btn-danger"
                    style={{
                      fontSize: '13px',
                      padding: '8px 16px',
                    }}
                  >
                    Khóa sản phẩm (Suspend)
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setModalAction('RESTORE');
                      setActionError(null);
                      setReason('');
                    }}
                    className="admin-btn admin-btn-success"
                    style={{
                      fontSize: '13px',
                      padding: '8px 16px',
                    }}
                  >
                    Mở khóa sản phẩm (Restore)
                  </button>
                )}
              </div>
            </div>


            {/* Shop Info Subsection */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#f9fafb',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShopIcon size={18} color="#ee4d2d" />
                <span>
                  Gian hàng: <strong>{product.shopName}</strong> (<code>{product.shopSlug}</code>)
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: product.shopStatus === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                    color: product.shopStatus === 'ACTIVE' ? '#15803d' : '#b91c1c',
                  }}
                >
                  {product.shopStatus}
                </span>
              </div>
              <Link
                href={`/admin/shops?q=${product.shopSlug}`}
                style={{ color: '#ee4d2d', textDecoration: 'none', fontWeight: 500 }}
              >
                Quản lý shop này →
              </Link>
            </div>
          </div>

          {/* Variants Table */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>
              Danh sách Biến thể & Tồn kho ({product.variants.length} phân loại)
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', color: '#4b5563' }}>SKU</th>
                    <th style={{ padding: '10px 12px', color: '#4b5563' }}>Phân loại / Thuộc tính</th>
                    <th style={{ padding: '10px 12px', color: '#4b5563' }}>Giá niêm yết</th>
                    <th style={{ padding: '10px 12px', color: '#4b5563' }}>Tồn kho</th>
                    <th style={{ padding: '10px 12px', color: '#4b5563' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((variant) => {
                    const attrText = Object.entries(variant.attributes)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' • ');

                    return (
                      <tr key={variant.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{variant.sku}</td>
                        <td style={{ padding: '10px 12px', color: '#111827' }}>
                          {attrText || 'Mặc định (Default)'}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#ee4d2d' }}>
                          {formatVnd(variant.price)}
                        </td>
                        <td style={{ padding: '10px 12px' }}>{variant.stock}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              background: variant.isActive ? '#dcfce7' : '#f3f4f6',
                              color: variant.isActive ? '#15803d' : '#6b7280',
                            }}
                          >
                            {variant.isActive ? 'Kích hoạt' : 'Tắt'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Moderation Reason Modal */}
      {modalAction && product && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '500px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: 0 }}>
              {modalAction === 'SUSPEND' ? 'Khóa sản phẩm vi phạm' : 'Mở khóa sản phẩm'}
            </h3>

            <p style={{ fontSize: '14px', color: '#4b5563', margin: 0 }}>
              Bạn đang thực hiện {modalAction === 'SUSPEND' ? 'khóa' : 'mở khóa'} sản phẩm{' '}
              <strong>{product.name}</strong> (<code>{product.slug}</code>). Hành động này sẽ được ghi vết vào
              Nhật ký kiểm toán đặc quyền.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                Lý do thực hiện (tối thiểu 8 ký tự):
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ví dụ: Sản phẩm vi phạm chính sách hàng cấm / Shop đã cung cấp chứng từ hợp lệ..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'right' }}>
                {reason.trim().length}/240 ký tự
              </div>
            </div>

            {actionError && (
              <div style={{ fontSize: '13px', color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px' }}>
                {actionError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setModalAction(null)}
                disabled={submitting}
                className="admin-btn admin-btn-secondary"
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleAction()}
                disabled={submitting || reason.trim().length < 8}
                className={`admin-btn ${modalAction === 'SUSPEND' ? 'admin-btn-danger' : 'admin-btn-success'}`}
                style={{
                  padding: '8px 18px',
                  fontSize: '13px',
                }}
              >
                {submitting ? 'Đang xử lý...' : 'Xác nhận'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
