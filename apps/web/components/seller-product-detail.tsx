'use client';

import type { SellerProductCategory, SellerProductDetail as SellerProductData } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { RoleApiError } from '../lib/role-api';
import { fetchSellerProduct, fetchSellerProductCategories } from '../lib/seller-products-api';
import { useAuthSession } from './auth-session-provider';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

function mediaUrl(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new URL(value, apiBaseUrl).toString();
  } catch {
    return value;
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function lifecycleLabel(value: SellerProductData['lifecycle']): string {
  return value === 'published' ? 'Đang bán' : value === 'hidden' ? 'Đã ẩn' : value === 'archived' ? 'Đã lưu trữ' : 'Bản nháp';
}

function errorMessage(error: unknown): string {
  if (error instanceof RoleApiError && error.status === 404) return 'Không tìm thấy sản phẩm hoặc sản phẩm không còn khả dụng.';
  if (error instanceof RoleApiError && error.status === 403) return 'Tài khoản chưa có quyền seller hoặc shop chưa đủ điều kiện hoạt động.';
  return 'Không thể tải thông tin sản phẩm. Hãy thử lại.';
}

export function SellerProductDetailView({ productId }: { productId: string }) {
  const { authenticatedFetch, state } = useAuthSession();
  const [product, setProduct] = useState<SellerProductData | null>(null);
  const [categories, setCategories] = useState<SellerProductCategory[]>([]);
  const [message, setMessage] = useState('');
  const [selectedMedia, setSelectedMedia] = useState(0);

  const canManage = state.status === 'authenticated' && state.user.roles.includes('seller');
  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void fetchSellerProduct(authenticatedFetch, productId)
      .then((value) => {
        if (!cancelled) {
          setMessage('');
          setSelectedMedia(0);
          setProduct(value);
        }
      })
      .catch((error) => {
        if (!cancelled) setMessage(errorMessage(error));
      });
    void fetchSellerProductCategories(authenticatedFetch)
      .then((value) => {
        if (!cancelled) setCategories(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authenticatedFetch, canManage, productId]);

  const categoryName = useMemo(
    () => categories.find((category) => category.id === product?.categoryId)?.name ?? product?.categoryId ?? 'Chưa xác định',
    [categories, product?.categoryId],
  );

  if (state.status !== 'authenticated')
    return (
      <section className="operational-panel">
        <h1>Cần đăng nhập</h1>
        <Link href="/login">Đăng nhập</Link>
      </section>
    );
  if (!state.user.roles.includes('seller'))
    return (
      <section className="operational-panel">
        <h1>Chưa thể xem sản phẩm</h1>
        <p>Shop cần được duyệt và tài khoản phải có quyền seller.</p>
      </section>
    );
  if (message)
    return (
      <section className="operational-panel" role="alert">
        <h1>Không thể tải sản phẩm</h1>
        <p>{message}</p>
        <Link href="/seller/products">Quay lại danh sách</Link>
      </section>
    );
  if (!product)
    return (
      <section className="operational-panel seller-product-loading" aria-live="polite">
        <span className="operational-eyebrow">Seller Center</span>
        <h1>Đang tải sản phẩm</h1>
        <p>Đang lấy thông tin chi tiết...</p>
      </section>
    );

  const currentMedia = product.media[selectedMedia] ?? product.media[0];
  return (
    <section className="operational-panel seller-product-detail" data-testid="seller-product-detail">
      <div className="seller-product-detail__breadcrumbs">
        <Link href="/seller/products">← Sản phẩm của tôi</Link>
        <span aria-hidden="true">/</span>
        <span>Chi tiết sản phẩm</span>
      </div>
      <div className="seller-product-detail__heading">
        <div>
          <span className="operational-eyebrow">Seller Center</span>
          <h1>{product.name}</h1>
          <p className="seller-product-detail__slug">Slug: {product.slug}</p>
        </div>
        <div className="seller-product-detail__actions">
          <span className={`seller-product-status seller-product-status--${product.lifecycle}`}>{lifecycleLabel(product.lifecycle)}</span>
          <Link className="seller-product-primary" href={`/seller/products/${product.id}/edit`}>Cập nhật sản phẩm</Link>
        </div>
      </div>

      <div className="seller-product-detail__hero">
        <div className="seller-product-detail__gallery">
          <div className="seller-product-detail__main-media">
            {currentMedia ? <img src={mediaUrl(currentMedia.url)} alt={currentMedia.altText ?? product.name} /> : <span>Chưa có ảnh</span>}
          </div>
          {product.media.length > 1 ? (
            <div className="seller-product-detail__thumbnails" aria-label="Ảnh sản phẩm">
              {product.media.map((media, index) => (
                <button key={media.id} type="button" className={index === selectedMedia ? 'is-active' : ''} aria-label={`Xem ảnh ${index + 1}`} onClick={() => setSelectedMedia(index)}>
                  <img src={mediaUrl(media.url)} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <dl className="seller-product-detail__facts">
          <div><dt>Danh mục</dt><dd>{categoryName}</dd></div>
          <div><dt>Số biến thể</dt><dd>{formatNumber(product.variants.length)}</dd></div>
          <div><dt>Tồn kho</dt><dd>{formatNumber(product.variants.reduce((total, variant) => total + variant.stock, 0))}</dd></div>
          <div><dt>Cập nhật lần cuối</dt><dd>{new Date(product.updatedAt).toLocaleString('vi-VN')}</dd></div>
        </dl>
      </div>

      <div className="seller-product-detail__sections">
        <section>
          <h2>Mô tả sản phẩm</h2>
          <p className="seller-product-detail__description">{product.description || 'Chưa có mô tả.'}</p>
        </section>
        <section>
          <h2>Đóng gói</h2>
          <dl className="seller-product-detail__compact-facts">
            <div><dt>Dài</dt><dd>{product.packageLengthMm ?? '—'} mm</dd></div>
            <div><dt>Rộng</dt><dd>{product.packageWidthMm ?? '—'} mm</dd></div>
            <div><dt>Cao</dt><dd>{product.packageHeightMm ?? '—'} mm</dd></div>
          </dl>
        </section>
        {product.optionGroups.length ? (
          <section>
            <h2>Phân loại hàng</h2>
            <div className="seller-product-detail__options">
              {product.optionGroups.map((group) => <div key={group.name}><strong>{group.name}</strong><span>{group.values.join(', ')}</span></div>)}
            </div>
          </section>
        ) : null}
        <section className="seller-product-detail__variants-section">
          <h2>Biến thể và tồn kho</h2>
          <div className="seller-product-detail__table-wrap">
            <table className="seller-product-detail__table">
              <thead><tr><th>Biến thể</th><th>SKU</th><th>Giá bán</th><th>Tồn kho</th><th>Phiên bản</th><th>Khối lượng</th></tr></thead>
              <tbody>{product.variants.map((variant) => <tr key={variant.id}><td>{variant.combination.join(' · ') || 'Mặc định'}</td><td>{variant.sku}</td><td>₫{formatNumber(variant.priceMinor)}</td><td>{formatNumber(variant.stock)}</td><td>v{variant.inventoryVersion ?? 0}</td><td>{formatNumber(variant.weightGrams)} g</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
