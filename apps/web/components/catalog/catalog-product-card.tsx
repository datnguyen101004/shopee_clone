'use client';

import {
  buyerDisplayProductPriceMinor,
  type CatalogProductCard,
} from '@shopee-clone/contracts';
import { ProductCard as UiProductCard } from '@shopee-clone/ui';
import Link from 'next/link';

import { FaStar } from './catalog-icons';
import { formatNumber } from './catalog-utils';
import { MarketplaceProductImage } from '../marketplace-product-image';

export function ProductCard({ product }: { product: CatalogProductCard }) {
  return (
    <UiProductCard
      className="catalog-card"
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
