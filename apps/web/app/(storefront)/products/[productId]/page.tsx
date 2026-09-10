import { isCanonicalProductId } from '@shopee-clone/contracts';
import { Badge, StorefrontContainer } from '@shopee-clone/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';

import { ProductDetailExperience } from '../../../../components/product-detail/product-detail-experience';
import { ChatNowButton } from '../../../../components/chat/chat-now-button';
import { fetchProductDetail, ProductDetailApiError } from '../../../../lib/product-detail-api';
import { ProductDetailRelatedCard } from '../../../../components/product-detail/product-detail-related-card';

export const dynamic = 'force-dynamic';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  if (!isCanonicalProductId(productId)) notFound();

  let product;
  try {
    product = await fetchProductDetail(productId);
  } catch (error) {
    if (
      error instanceof ProductDetailApiError &&
      (error.kind === 'not-found' || error.kind === 'invalid-id')
    ) {
      notFound();
    }
    if (error instanceof ProductDetailApiError && error.kind === 'deleted') {
      return (
        <StorefrontContainer className="product-detail-page product-detail-state">
          <Badge variant="danger">SẢN PHẨM ĐÃ XÓA</Badge>
          <h1>Sản phẩm đã bị xóa</h1>
          <p>Sản phẩm này không còn được bán. Bạn vẫn có thể xem lại lịch sử đánh giá từ đơn hàng của mình.</p>
          <Link href="/search">Quay lại khám phá sản phẩm</Link>
        </StorefrontContainer>
      );
    }
    return (
      <StorefrontContainer className="product-detail-page product-detail-state">
        <Badge variant="danger">TẠM THỜI GIÁN ĐOẠN</Badge>
        <h1>Chưa thể tải sản phẩm</h1>
        <p>Dịch vụ sản phẩm đang gặp sự cố. Thông tin mua sắm khác vẫn hoạt động bình thường.</p>
        <div>
          <Link href={`/products/${productId}`}>Thử lại</Link>
          <Link href="/search">Quay lại khám phá sản phẩm</Link>
        </div>
      </StorefrontContainer>
    );
  }

  const relatedRequestId = randomUUID();
  return (
    <StorefrontContainer className="product-detail-page">
      <nav className="product-detail-breadcrumb" aria-label="Điều hướng sản phẩm">
        <Link href="/search" className="product-detail-breadcrumb__link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Khám phá</span>
        </Link>
        <span className="product-detail-breadcrumb__separator" aria-hidden="true">›</span>
        <span className="product-detail-breadcrumb__current">{product.category.name}</span>
      </nav>
      <div className="product-detail-layout">
        <article className="product-detail-information">
          <div className="product-detail-header-meta">
            <Badge variant="brand">{product.category.name}</Badge>
            <h1 className="product-detail-title">{product.name}</h1>
            <div className="product-detail-rating">
              {product.ratingCount === 0 ? (
                <span className="product-detail-rating__zero" aria-label="Chưa có đánh giá">Chưa có đánh giá</span>
              ) : (
                <>
                  <strong className="product-detail-rating__score" aria-label={`${(product.ratingAverageBasisPoints / 100).toFixed(1)} trên 5 sao`}>
                    <span className="product-detail-rating__star" aria-hidden="true">★</span> {(product.ratingAverageBasisPoints / 100).toFixed(1)}
                  </strong>
                  <span className="product-detail-rating__divider" aria-hidden="true">|</span>
                  <span className="product-detail-rating__count">{formatNumber(product.ratingCount)} đánh giá</span>
                </>
              )}
              <span className="product-detail-rating__divider" aria-hidden="true">|</span>
              <span className="product-detail-rating__sold">{formatNumber(product.soldCount)} đã bán</span>
            </div>
          </div>
          <ProductDetailExperience product={product} />
          <section
            className="product-detail-description"
            aria-labelledby="product-description-title"
          >
            <div className="product-detail-section-heading">
              <span className="product-detail-section-heading__bar" aria-hidden="true"></span>
              <h2 id="product-description-title">Mô tả sản phẩm</h2>
            </div>
            <div className="product-detail-description__content">
              <p>{product.description}</p>
            </div>
          </section>
        </article>
      </div>
      <section className="product-detail-context" aria-label="Thông tin cửa hàng và giao hàng">
        <article className="product-detail-context__card product-detail-context__shop">
          <div className="product-detail-context__badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>SHOP</span>
          </div>
          <div className="product-detail-context__shop-body">
            <div className="product-detail-context__shop-avatar" aria-hidden="true">
              {product.shop.name.charAt(0).toUpperCase()}
            </div>
            <div className="product-detail-context__shop-info">
              <h2>
                <Link href={`/shops/${encodeURIComponent(product.shop.slug)}`}>
                  {product.shop.name}
                </Link>
              </h2>
              <p>
                <span>📍 {product.shop.location}</span>
              </p>
            </div>
          </div>
          <div className="product-detail-context__shop-actions">
            <ChatNowButton shopId={product.shop.id} ownerUserId={product.shop.ownerUserId} />
            <Link
              href={`/shops/${encodeURIComponent(product.shop.slug)}`}
              className="product-detail-shop-link"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Xem Shop
            </Link>
          </div>
        </article>
        <article className="product-detail-context__card product-detail-context__shipping">
          <div className="product-detail-context__badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="1" y="3" width="15" height="13" />
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
            <span>VẬN CHUYỂN</span>
          </div>
          <div className="product-detail-context__shipping-body">
            <h2>Từ {product.shippingPreview.origin}</h2>
            <p className="product-detail-context__shipping-dest">
              Giao đến <span className="font-medium">{product.shippingPreview.destinationLabel}</span>
            </p>
            <div className="product-detail-context__shipping-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
              <span>{product.shippingPreview.message}</span>
            </div>
          </div>
        </article>
      </section>
      {product.relatedProducts.length ? (
        <section className="product-detail-related" aria-labelledby="related-products-title">
          <div className="product-detail-section-heading">
            <span className="product-detail-section-heading__bar" aria-hidden="true"></span>
            <h2 id="related-products-title">Sản phẩm tương tự</h2>
          </div>
          <div className="product-detail-related__grid">
            {product.relatedProducts.map((related, position) => (
              <ProductDetailRelatedCard
                key={related.id}
                product={related}
                position={position}
                requestId={relatedRequestId}
              />
            ))}
          </div>
        </section>
      ) : null}
    </StorefrontContainer>
  );
}
