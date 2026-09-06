'use client';

import Link from 'next/link';
import type { SellerProductSummary } from '@shopee-clone/contracts';
import { Eye, EyeOff, ImageOff, SquarePen, Trash2 } from '@shopee-clone/ui';
import { formatMoney, sellerProductMediaUrl } from './seller-products-utils';

interface TableProps {
  items: SellerProductSummary[];
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  hasLocalFilters?: boolean;
  onClearFilters?: () => void;
  publishingId: string | null;
  deletingId: string | null;
  onRequestHide: (item: SellerProductSummary, trigger: HTMLElement) => void;
  onRequestDelete: (item: SellerProductSummary, trigger: HTMLElement) => void;
  onPublish: (productId: string) => void;
}

function lifecycleDisplay(lifecycle: SellerProductSummary['lifecycle']) {
  switch (lifecycle) {
    case 'published':
      return { label: 'Đang bán', className: 'seller-pl-badge--published' };
    case 'draft':
      return { label: 'Bản nháp', className: 'seller-pl-badge--draft' };
    case 'hidden':
      return { label: 'Đã ẩn', className: 'seller-pl-badge--hidden' };
    case 'archived':
      return { label: 'Đã lưu trữ', className: 'seller-pl-badge--archived' };
    default:
      return { label: lifecycle, className: 'seller-pl-badge--draft' };
  }
}

export function SellerProductTable({
  items,
  loading,
  error = '',
  onRetry,
  hasLocalFilters = false,
  onClearFilters,
  publishingId,
  deletingId,
  onRequestHide,
  onRequestDelete,
  onPublish,
}: TableProps) {
  if (error && !loading) {
    return (
      <div className="seller-pl-table-card seller-products-table-state" role="alert">
        <p>Không thể tải sản phẩm.</p>
        <span>{error}</span>
        {onRetry ? (
          <button type="button" className="seller-pl-btn-loadmore" onClick={onRetry}>
            Thử lại
          </button>
        ) : null}
      </div>
    );
  }

  if (items.length === 0 && !loading) {
    return (
      <div className="seller-pl-table-card seller-products-table-state">
        <p>{hasLocalFilters ? 'Không có sản phẩm phù hợp trong dữ liệu đã tải.' : 'Chưa có sản phẩm'}</p>
        <span>
          {hasLocalFilters
            ? 'Xóa bộ lọc cục bộ hoặc tải thêm để tiếp tục.'
            : 'Tạo sản phẩm đầu tiên cho shop của bạn.'}
        </span>
        {hasLocalFilters ? (
          <button type="button" className="seller-pl-btn-loadmore" onClick={onClearFilters}>
            Xóa bộ lọc
          </button>
        ) : (
          <Link className="seller-pl-btn-add" href="/seller/products/new">
            Thêm sản phẩm
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="seller-pl-table-card" aria-busy={loading}>
      <div className="seller-pl-table-scroll">
        <table className="seller-pl-table" aria-label="Danh sách sản phẩm người bán">
          <thead>
            <tr>
              <th className="seller-pl-col-thumb">Hình ảnh</th>
              <th className="seller-pl-col-info">Thông tin sản phẩm</th>
              <th className="seller-pl-col-cat">Danh mục</th>
              <th className="seller-pl-col-price">Giá bán</th>
              <th className="seller-pl-col-stock">Kho hàng</th>
              <th className="seller-pl-col-status">Trạng thái</th>
              <th className="seller-pl-col-actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0
              ? Array.from({ length: 5 }, (_, index) => (
                  <tr key={`skeleton-${index}`} className="seller-pl-skeleton-row" aria-hidden="true">
                    <td colSpan={7}>
                      <span className="seller-pl-skeleton-line" />
                    </td>
                  </tr>
                ))
              : items.map((item) => {
              const statusInfo = lifecycleDisplay(item.lifecycle);
              const isPending = publishingId === item.id || deletingId === item.id;
              const imgUrl = sellerProductMediaUrl(item.primaryMediaUrl);

              return (
                <tr key={item.id} data-testid="seller-product-row">
                  {/* 1. Thumbnail */}
                  <td className="seller-pl-col-thumb">
                    <div className="seller-pl-thumb">
                      {imgUrl ? (
                        <img src={imgUrl} alt={item.name} loading="lazy" />
                      ) : (
                        <ImageOff className="seller-pl-thumb--fallback" size={20} aria-hidden="true" />
                      )}
                    </div>
                  </td>

                  {/* 2. Product Info & Code */}
                  <td className="seller-pl-col-info">
                    <h3 className="seller-pl-info__name">
                      <Link href={`/seller/products/${item.id}`}>{item.name}</Link>
                    </h3>
                    <p className="seller-pl-info__sku">Mã sản phẩm: {item.slug}</p>
                  </td>

                  {/* 3. Category */}
                  <td className="seller-pl-col-cat">{item.categoryName || 'Chưa phân loại'}</td>

                  {/* 4. Price */}
                  <td className="seller-pl-col-price">
                    {item.operationalPriceRange ? (
                      item.operationalPriceRange.minPriceMinor ===
                      item.operationalPriceRange.maxPriceMinor ? (
                        formatMoney(item.operationalPriceRange.minPriceMinor)
                      ) : (
                        `${formatMoney(item.operationalPriceRange.minPriceMinor)} - ${formatMoney(
                          item.operationalPriceRange.maxPriceMinor,
                        )}`
                      )
                    ) : (
                      'Chưa có giá'
                    )}
                  </td>

                  {/* 5. Stock */}
                  <td className="seller-pl-col-stock">
                    {item.stockQuantity === 0 ? (
                      <span className="seller-pl-stock--zero">0</span>
                    ) : (
                      item.stockQuantity ?? '—'
                    )}
                  </td>

                  {/* 6. Status Badge */}
                  <td className="seller-pl-col-status">
                    <span className={`seller-pl-badge ${statusInfo.className}`}>
                      <b>{statusInfo.label}</b>
                    </span>
                    {item.moderationStatus === 'suspended' ? (
                      <div>
                        <span className="seller-pl-badge seller-pl-badge--suspended">Bị hạn chế</span>
                      </div>
                    ) : null}
                  </td>

                  {/* 7. Actions */}
                  <td className="seller-pl-col-actions">
                    <div className="seller-pl-actions">
                      {/* View Link */}
                      <Link
                        href={`/seller/products/${item.id}`}
                        className="seller-pl-btn-icon"
                        aria-label="Xem chi tiết"
                        title="Xem chi tiết"
                      >
                        <Eye size={16} aria-hidden="true" />
                      </Link>

                      {/* Edit Link */}
                      {item.lifecycle !== 'archived' ? (
                        <Link
                          href={`/seller/products/${item.id}/edit`}
                          className="seller-pl-btn-icon"
                          aria-label="Cập nhật sản phẩm"
                          title={`Cập nhật sản phẩm ${item.name}`}
                        >
                          <SquarePen size={16} aria-hidden="true" />
                        </Link>
                      ) : null}

                      {/* Publish / Hide toggle */}
                      {item.lifecycle === 'published' ? (
                        <button
                          type="button"
                          className="seller-pl-btn-icon"
                          aria-label={`Ẩn sản phẩm ${item.name}`}
                          title={`Ẩn sản phẩm ${item.name}`}
                          disabled={isPending}
                          onClick={(e) => onRequestHide(item, e.currentTarget)}
                        >
                          <EyeOff size={16} aria-hidden="true" />
                        </button>
                      ) : item.lifecycle === 'hidden' || item.lifecycle === 'draft' ? (
                        <button
                          type="button"
                          className="seller-pl-btn-sm seller-pl-btn-sm--primary"
                          disabled={isPending || item.moderationStatus === 'suspended'}
                          onClick={() => onPublish(item.id)}
                        >
                          Đăng bán
                        </button>
                      ) : null}

                      {/* Delete button */}
                      <button
                        type="button"
                        className="seller-pl-btn-icon seller-pl-btn-icon--delete"
                        aria-label={
                          item.lifecycle === 'draft'
                            ? `Xóa sản phẩm nháp ${item.name}`
                            : item.lifecycle === 'published'
                              ? `Xóa sản phẩm đang bán ${item.name}`
                              : `Xóa sản phẩm ${item.name}`
                        }
                        title="Xóa sản phẩm"
                        disabled={isPending}
                        onClick={(e) => onRequestDelete(item, e.currentTarget)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
