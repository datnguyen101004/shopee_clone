import { isCanonicalProductId } from '@shopee-clone/contracts';
import { Badge, Container } from '@shopee-clone/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProductDetailExperience } from '../../../../components/product-detail/product-detail-experience';
import { fetchProductDetail, ProductDetailApiError } from '../../../../lib/product-detail-api';
import { marketplaceMediaUrl } from '../../../../lib/marketplace-media-url';

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
    return (
      <Container className="product-detail-page product-detail-state">
        <Badge variant="danger">TẠM THỜI GIÁN ĐOẠN</Badge>
        <h1>Chưa thể tải sản phẩm</h1>
        <p>Dịch vụ sản phẩm đang gặp sự cố. Thông tin mua sắm khác vẫn hoạt động bình thường.</p>
        <div>
          <Link href={`/products/${productId}`}>Thử lại</Link>
          <Link href="/search">Quay lại khám phá sản phẩm</Link>
        </div>
      </Container>
    );
  }

  return (
    <Container className="product-detail-page">
      <nav className="product-detail-breadcrumb" aria-label="Điều hướng sản phẩm">
        <Link href="/search">Khám phá</Link>
        <span>/</span>
        <span>{product.category.name}</span>
      </nav>
      <div className="product-detail-layout">
        <article className="product-detail-information">
          <Badge variant="brand">{product.category.name}</Badge>
          <h1>{product.name}</h1>
          <div className="product-detail-rating">
            {product.ratingCount === 0 ? (
              <span aria-label="Chưa có đánh giá">Chưa có đánh giá</span>
            ) : (
              <><strong aria-label={`${(product.ratingAverageBasisPoints / 100).toFixed(1)} trên 5 sao`}>★ {(product.ratingAverageBasisPoints / 100).toFixed(1)}</strong><span>{formatNumber(product.ratingCount)} đánh giá</span></>
            )}
            <span>{formatNumber(product.soldCount)} đã bán</span>
          </div>
          <ProductDetailExperience product={product} />
          <section
            className="product-detail-description"
            aria-labelledby="product-description-title"
          >
            <h2 id="product-description-title">Mô tả sản phẩm</h2>
            <p>{product.description}</p>
          </section>
        </article>
      </div>
      <section className="product-detail-context" aria-label="Thông tin cửa hàng và giao hàng">
        <article>
          <span>SHOP</span>
          <h2>
            <Link href={`/shops/${encodeURIComponent(product.shop.slug)}`}>
              {product.shop.name}
            </Link>
          </h2>
          <p>
            {product.shop.location} · {formatNumber(product.shop.activeProductCount)} sản phẩm đang
            hoạt động
          </p>
        </article>
        <article>
          <span>VẬN CHUYỂN</span>
          <h2>Từ {product.shippingPreview.origin}</h2>
          <p>
            Giao đến {product.shippingPreview.destinationLabel}. {product.shippingPreview.message}
          </p>
        </article>
      </section>
      {product.relatedProducts.length ? (
        <section className="product-detail-related" aria-labelledby="related-products-title">
          <h2 id="related-products-title">Sản phẩm liên quan</h2>
          <div>
            {product.relatedProducts.map((related) => (
              <Link key={related.id} href={related.href} className="product-detail-related__card">
                {related.imageUrl ? (
                    <img src={marketplaceMediaUrl(related.imageUrl)} alt={related.imageAlt} />
                ) : (
                  <span aria-hidden="true">S</span>
                )}
                <strong>{related.name}</strong>
                <b>₫{formatNumber(related.priceMinor)}</b>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </Container>
  );
}
