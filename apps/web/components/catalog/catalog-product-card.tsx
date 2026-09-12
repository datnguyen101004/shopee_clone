'use client';

import { buyerDisplayProductPriceMinor, type CatalogProductCard } from '@shopee-clone/contracts';
import { ProductCard as UiProductCard } from '@shopee-clone/ui';
import Link from 'next/link';

import { FaStar } from './catalog-icons';
import { formatNumber } from './catalog-utils';
import { MarketplaceProductImage } from '../marketplace-product-image';
import { submitClickstreamEvent } from '../../lib/clickstream';
import { useAuthSession } from '../auth-session-provider';

export function ProductCard({
  product,
  tracking,
}: {
  product: CatalogProductCard;
  tracking?: { requestId: string; position: number; query?: string };
}) {
  const { clickstreamFetch } = useAuthSession();
  return (
    <UiProductCard
      className="catalog-card"
      onClick={
        tracking
          ? () =>
              submitClickstreamEvent(
                {
                  eventType: 'product_clicked',
                  surface: 'search',
                  productId: product.id,
                  placement: 'search_results',
                  position: tracking.position,
                  requestId: tracking.requestId,
                  query: tracking.query,
                  properties: {},
                },
                1_500,
                clickstreamFetch,
              )
          : undefined
      }
      data-testid="catalog-card"
      linkClassName="catalog-card__link"
      linkComponent={Link}
      href={product.href}
      linkAriaLabel={`Xem ${product.name}`}
      titleHeadingLevel="h2"
      image={
        product.imageUrl ? (
          <MarketplaceProductImage
            src={product.imageUrl}
            alt={product.imageAlt}
            fill
            sizes="(max-width: 599px) 50vw, (max-width: 899px) 33vw, 25vw"
          />
        ) : (
          <span role="img" aria-label={product.imageAlt} className="catalog-card__fallback">
            S
          </span>
        )
      }
      mediaClassName="catalog-card__media"
      discountPercent={product.discountPercent}
      discountBadgeClassName="shopee-discount-badge"
      name={product.name}
      shopName={product.shop.name}
      shopNameClassName="catalog-card__shop"
      price={`₫${formatNumber(buyerDisplayProductPriceMinor(product))}`}
      compareAtPrice={
        product.compareAtPriceMinor ? `₫${formatNumber(product.compareAtPriceMinor)}` : undefined
      }
      bestPriceBadge={
        product.buyerBestPrice?.merchandiseDiscountMinor ? (
          <small>Giá tốt nhất dự kiến · Voucher đã áp dụng</small>
        ) : null
      }
      scheduledDeal={
        product.scheduledPrice ? (
          <small
            className="shopee-scheduled-deal"
            aria-label={`Giảm giá sản phẩm ${Math.floor(product.scheduledPrice.discountBasisPoints / 100)} phần trăm`}
          >
            Đang giảm {Math.floor(product.scheduledPrice.discountBasisPoints / 100)}%
          </small>
        ) : null
      }
      rating={
        product.ratingCount === 0 ? (
          <span aria-label="Chưa có đánh giá">Chưa có đánh giá</span>
        ) : (
          <span
            className="shopee-card-rating"
            aria-label={`${(product.ratingAverageBasisPoints / 100).toFixed(1)} trên 5 sao`}
          >
            <FaStar className="shopee-star-icon" />{' '}
            {(product.ratingAverageBasisPoints / 100).toFixed(1)} (
            {formatNumber(product.ratingCount)})
          </span>
        )
      }
      soldCount={`Đã bán ${formatNumber(product.soldCount)}`}
      footerClassName="catalog-card__facts"
      location={product.shop.location}
      locationClassName="catalog-card__location"
    />
  );
}
