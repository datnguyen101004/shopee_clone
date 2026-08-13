'use client';

import type { ProductDetailResponse } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { FavoriteButton } from '../engagement/favorite-button';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';
import { RecentlyViewedRecorder } from '../engagement/recently-viewed-recorder';

import {
  activeProductImage,
  canPurchase,
  getVariant,
  initialProductDetailSelection,
  productLoginHandoff,
  quantityError,
  selectProductVariant,
} from './product-detail-interactions';

function formatCurrency(value: number): string {
  return `₫${new Intl.NumberFormat('vi-VN').format(value)}`;
}

function ProductDetailInner({ product }: { product: ProductDetailResponse }) {
  const [selection, setSelection] = useState(() => initialProductDetailSelection(product));
  const selectedVariant = getVariant(product, selection.variantId);
  const image = activeProductImage(product, selection.activeImageId);
  const error = quantityError(selection.quantity, selectedVariant);
  const purchaseReady = canPurchase(selection.quantity, selectedVariant);
  const liveMessage =
    error ?? (selectedVariant ? `Đã chọn ${selectedVariant.name}.` : 'Chưa có biến thể để chọn.');
  const handoffs = useMemo(
    () =>
      selectedVariant && purchaseReady
        ? {
            add: productLoginHandoff(
              product,
              selectedVariant.id,
              selection.quantity,
              'add-to-cart',
            ),
            buy: productLoginHandoff(product, selectedVariant.id, selection.quantity, 'buy-now'),
          }
        : null,
    [product, purchaseReady, selectedVariant, selection.quantity],
  );

  return (
    <section className="product-detail-offer" aria-label="Lựa chọn sản phẩm">
      <div className="product-detail-gallery">
        <div className="product-detail-gallery__main" aria-live="polite">
          {image ? (
            <img
              src={image.url}
              alt={image.altText}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = '/media/products/product-placeholder.svg';
              }}
            />
          ) : (
            <span
              role="img"
              aria-label={`Chưa có ảnh cho ${product.name}`}
              className="product-detail-gallery__fallback"
            >
              S
            </span>
          )}
        </div>
        {product.gallery.length > 1 ? (
          <div className="product-detail-gallery__thumbnails" aria-label="Ảnh sản phẩm">
            {product.gallery.map((thumbnail) => (
              <button
                key={thumbnail.id}
                type="button"
                className={thumbnail.id === image?.id ? 'is-current' : undefined}
                aria-pressed={thumbnail.id === image?.id}
                aria-label={`Xem ${thumbnail.altText}`}
                onClick={() =>
                  setSelection((current) => ({ ...current, activeImageId: thumbnail.id }))
                }
              >
                <img
                  src={thumbnail.url}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = '/media/products/product-placeholder.svg';
                  }}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="product-detail-offer__selection">
        <RecentlyViewedRecorder productId={product.id} />
        <FavoriteButton productId={product.id} />
        <div className="product-detail-price" aria-label="Giá sản phẩm">
          <strong>
            {selectedVariant ? formatCurrency(selectedVariant.priceMinor) : 'Liên hệ shop'}
          </strong>
          {selectedVariant?.compareAtPriceMinor ? (
            <del>{formatCurrency(selectedVariant.compareAtPriceMinor)}</del>
          ) : null}
          {selectedVariant?.discountPercent ? (
            <span>-{selectedVariant.discountPercent}%</span>
          ) : null}
        </div>
        <div className="product-detail-variants" role="group" aria-label="Biến thể sản phẩm">
          <span>Biến thể</span>
          <div>
            {product.variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={variant.id === selectedVariant?.id ? 'is-selected' : undefined}
                aria-pressed={variant.id === selectedVariant?.id}
                onClick={() =>
                  setSelection((current) => selectProductVariant(product, current, variant.id))
                }
              >
                {variant.name}
                {variant.availability === 'unavailable' ? ' · Hết hàng' : ''}
              </button>
            ))}
          </div>
        </div>
        {selectedVariant ? (
          <dl className="product-detail-offer__facts">
            <div>
              <dt>SKU</dt>
              <dd>{selectedVariant.sku}</dd>
            </div>
            <div>
              <dt>Tồn kho</dt>
              <dd>
                {selectedVariant.availableQuantity > 0
                  ? `${selectedVariant.availableQuantity} sản phẩm`
                  : 'Hết hàng'}
              </dd>
            </div>
          </dl>
        ) : null}
        <div className="product-detail-quantity">
          <label htmlFor="product-quantity">Số lượng</label>
          <div>
            <button
              type="button"
              aria-label="Giảm số lượng"
              disabled={!selectedVariant || Number(selection.quantity) <= 1}
              onClick={() =>
                setSelection((current) => ({
                  ...current,
                  quantity: String(Math.max(1, Number(current.quantity) - 1)),
                }))
              }
            >
              −
            </button>
            <input
              id="product-quantity"
              inputMode="numeric"
              value={selection.quantity}
              aria-describedby="product-quantity-status"
              onChange={(event) =>
                setSelection((current) => ({ ...current, quantity: event.target.value }))
              }
            />
            <button
              type="button"
              aria-label="Tăng số lượng"
              disabled={
                !selectedVariant || Number(selection.quantity) >= selectedVariant.availableQuantity
              }
              onClick={() =>
                setSelection((current) => ({
                  ...current,
                  quantity: String(Number(current.quantity) + 1),
                }))
              }
            >
              +
            </button>
          </div>
        </div>
        <p
          id="product-quantity-status"
          className={error ? 'product-detail-status is-error' : 'product-detail-status'}
          aria-live="polite"
        >
          {liveMessage}
        </p>
        {!product.purchasable ? (
          <p className="product-detail-unavailable">
            Sản phẩm hiện tạm hết hàng. Bạn vẫn có thể xem thông tin và shop.
          </p>
        ) : null}
        <div className="product-detail-purchase">
          {handoffs ? (
            <Link href={handoffs.add}>Thêm vào giỏ hàng · Đăng nhập</Link>
          ) : (
            <button type="button" disabled>
              Thêm vào giỏ hàng
            </button>
          )}
          {handoffs ? (
            <Link href={handoffs.buy}>Mua ngay · Đăng nhập</Link>
          ) : (
            <button type="button" disabled>
              Mua ngay
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function ProductDetailExperience({ product }: { product: ProductDetailResponse }) {
  return (
    <FavoriteStateProvider productIds={[product.id]}>
      <ProductDetailInner product={product} />
    </FavoriteStateProvider>
  );
}
