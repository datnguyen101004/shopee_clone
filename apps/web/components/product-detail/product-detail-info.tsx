'use client';

import {
  buyerDisplayProductPriceMinor,
  type ProductDetailVariant,
} from '@shopee-clone/contracts';

import { FavoriteButton } from '../engagement/favorite-button';
import { RecentlyViewedRecorder } from '../engagement/recently-viewed-recorder';
import { ReportButton } from '../reporting/report-button';

export function formatCurrency(value: number): string {
  return `₫${new Intl.NumberFormat('vi-VN').format(value)}`;
}

export interface ProductPriceDisplayProps {
  selectedVariant: ProductDetailVariant | null;
}

export function ProductPriceDisplay({ selectedVariant }: ProductPriceDisplayProps) {
  return (
    <div className="product-detail-price" aria-label="Giá sản phẩm">
      <strong>
        {selectedVariant
          ? formatCurrency(buyerDisplayProductPriceMinor(selectedVariant))
          : 'Liên hệ shop'}
      </strong>
      {selectedVariant?.compareAtPriceMinor ? (
        <del>{formatCurrency(selectedVariant.compareAtPriceMinor)}</del>
      ) : null}
      {selectedVariant?.discountPercent ? (
        <span>-{selectedVariant.discountPercent}%</span>
      ) : null}
      {selectedVariant?.scheduledPrice ? (
        <small
          aria-label={`Giảm giá sản phẩm ${Math.floor(
            selectedVariant.scheduledPrice.discountBasisPoints / 100,
          )} phần trăm`}
        >
          Đang giảm {Math.floor(selectedVariant.scheduledPrice.discountBasisPoints / 100)}%
        </small>
      ) : null}
      {selectedVariant?.buyerBestPrice?.merchandiseDiscountMinor ? (
        <small>
          Giá tốt nhất dự kiến cho 1 sản phẩm · Tiết kiệm{' '}
          {formatCurrency(selectedVariant.buyerBestPrice.merchandiseDiscountMinor)} bằng voucher
        </small>
      ) : null}
      {selectedVariant?.buyerBestPrice?.shipping ? (
        <small>
          Phí giao STANDARD dự kiến:{' '}
          {formatCurrency(selectedVariant.buyerBestPrice.shipping.shippingPayableMinor)}
          {selectedVariant.buyerBestPrice.shipping.shippingVoucherDiscountMinor
            ? ` (đã giảm ${formatCurrency(selectedVariant.buyerBestPrice.shipping.shippingVoucherDiscountMinor)})`
            : ''}
        </small>
      ) : null}
    </div>
  );
}

export interface ProductDetailFactsProps {
  selectedVariant: ProductDetailVariant | null;
}

export function ProductDetailFacts({ selectedVariant }: ProductDetailFactsProps) {
  if (!selectedVariant) return null;

  return (
    <dl className="product-detail-offer__facts">
      <div className="product-detail-fact-pill">
        <dt>SKU</dt>
        <dd>{selectedVariant.sku}</dd>
      </div>
      <div className="product-detail-fact-pill">
        <dt>Tồn kho</dt>
        <dd>
          {selectedVariant.availableQuantity > 0
            ? `${selectedVariant.availableQuantity} sản phẩm`
            : 'Hết hàng'}
        </dd>
      </div>
    </dl>
  );
}

export interface ProductEngagementActionsProps {
  productId: string;
  productName: string;
}

export function ProductEngagementActions({ productId, productName }: ProductEngagementActionsProps) {
  return (
    <>
      <RecentlyViewedRecorder productId={productId} />
      <div className="product-detail-actions-row">
        <FavoriteButton productId={productId} />
        <ReportButton targetType="PRODUCT" targetId={productId} targetName={productName} />
      </div>
    </>
  );
}
