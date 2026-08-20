'use client';

import type { ProductDetailResponse } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FavoriteButton } from '../engagement/favorite-button';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';
import { RecentlyViewedRecorder } from '../engagement/recently-viewed-recorder';
import { useAuthSession } from '../auth-session-provider';
import { useCart } from '../cart/cart-provider';
import { ProductReviews } from './product-reviews';
import { marketplaceMediaUrl } from '../../lib/marketplace-media-url';

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
  const auth = useAuthSession();
  const cart = useCart();
  const router = useRouter();
  const [selection, setSelection] = useState(() => initialProductDetailSelection(product));
  const [cartMessage, setCartMessage] = useState('');
  const selectedVariant = getVariant(product, selection.variantId);
  const image = activeProductImage(product, selection.activeImageId);
  const error = quantityError(selection.quantity, selectedVariant);
  const purchaseReady = canPurchase(selection.quantity, selectedVariant);
  const liveMessage =
    cartMessage ||
    error ||
    (selectedVariant ? `Đã chọn ${selectedVariant.name}.` : 'Chưa có biến thể để chọn.');
  const handoffs =
    selectedVariant && purchaseReady
      ? {
          add: productLoginHandoff(product, selectedVariant.id, selection.quantity, 'add-to-cart'),
          buy: productLoginHandoff(product, selectedVariant.id, selection.quantity, 'buy-now'),
        }
      : null;
  const canMutateCart =
    auth.state.status === 'authenticated' &&
    Boolean(selectedVariant) &&
    purchaseReady &&
    !cart.pending &&
    cart.state.status === 'ready';

  async function handleAddToCart() {
    if (!canMutateCart || !selectedVariant) return;
    setCartMessage('');
    try {
      const result = await cart.addItem(selectedVariant.id, Number(selection.quantity));
      setCartMessage(
        result.adjustments[0]?.message ?? `Đã thêm ${selection.quantity} sản phẩm vào giỏ hàng.`,
      );
    } catch {
      setCartMessage('Không thể thêm vào giỏ hàng. Vui lòng thử lại.');
    }
  }

  async function handleBuyNow() {
    if (!canMutateCart || !selectedVariant) return;
    setCartMessage('');
    try {
      await cart.addItem(selectedVariant.id, Number(selection.quantity));
      router.push('/cart');
    } catch {
      setCartMessage('Không thể mua ngay. Vui lòng thử lại.');
    }
  }

  return (
    <>
    <section className="product-detail-offer" aria-label="Lựa chọn sản phẩm">
      <div className="product-detail-gallery">
        <div className="product-detail-gallery__main" aria-live="polite">
          {image ? (
            <img
              src={marketplaceMediaUrl(image.url)}
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
                  src={marketplaceMediaUrl(thumbnail.url)}
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
          {selectedVariant?.scheduledPrice ? (
            <small aria-label={`Giảm giá sản phẩm ${Math.floor(selectedVariant.scheduledPrice.discountBasisPoints / 100)} phần trăm`}>
              Đang giảm {Math.floor(selectedVariant.scheduledPrice.discountBasisPoints / 100)}%
            </small>
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
          {handoffs && auth.state.status === 'guest' ? (
            <Link href={handoffs.add}>Thêm vào giỏ · Đăng nhập</Link>
          ) : (
            <button
              type="button"
              disabled={
                !handoffs ||
                auth.state.status !== 'authenticated' ||
                cart.pending ||
                cart.state.status !== 'ready'
              }
              onClick={() => void handleAddToCart()}
            >
              {auth.state.status === 'loading' || cart.state.status === 'loading'
                ? 'Đang kiểm tra đăng nhập…'
                : cart.pending
                  ? 'Đang thêm…'
                  : 'Thêm vào giỏ hàng'}
            </button>
          )}
          {handoffs && auth.state.status === 'guest' ? (
            <Link href={handoffs.buy}>Mua ngay · Đăng nhập</Link>
          ) : (
            <button
              type="button"
              disabled={!handoffs || !canMutateCart}
              onClick={() => void handleBuyNow()}
            >
              {auth.state.status === 'loading' || cart.state.status === 'loading'
                ? 'Đang kiểm tra đăng nhập…'
                : cart.pending
                  ? 'Đang mua…'
                  : 'Mua ngay'}
            </button>
          )}
        </div>
      </div>
    </section>
    <ProductReviews product={product} />
    </>
  );
}

export function ProductDetailExperience({ product }: { product: ProductDetailResponse }) {
  return (
    <FavoriteStateProvider productIds={[product.id]}>
      <ProductDetailInner product={product} />
    </FavoriteStateProvider>
  );
}
