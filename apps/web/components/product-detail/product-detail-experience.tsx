'use client';

import {
  buyerDisplayProductPriceMinor,
  parseProductDetailResponse,
  type ProductDetailResponse,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FavoriteButton } from '../engagement/favorite-button';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';
import { RecentlyViewedRecorder } from '../engagement/recently-viewed-recorder';
import { ReportButton } from '../reporting/report-button';
import { useAuthSession } from '../auth-session-provider';
import { useCart } from '../cart/cart-provider';
import { ProductReviews } from './product-reviews';
import { marketplaceMediaUrl } from '../../lib/marketplace-media-url';
import { CartApiError } from '../../lib/cart-api';

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

function isSelfPurchaseError(error: unknown): boolean {
  return (
    error instanceof CartApiError &&
    error.problem?.type === 'https://shopee-clone.local/problems/self-purchase-forbidden'
  );
}

function ProductDetailInner({ product }: { product: ProductDetailResponse }) {
  const auth = useAuthSession();
  const cart = useCart();
  const router = useRouter();
  const [selection, setSelection] = useState(() => initialProductDetailSelection(product));
  const [cartMessage, setCartMessage] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selfPurchaseWarningOpen, setSelfPurchaseWarningOpen] = useState(false);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const selectedVariant = getVariant(product, selection.variantId);
  const image = activeProductImage(product, selection.activeImageId);
  const error = quantityError(selection.quantity, selectedVariant);
  const purchaseReady = canPurchase(selection.quantity, selectedVariant);
  const ownsShop =
    auth.state.status === 'authenticated' && auth.state.user.id === product.shop.ownerUserId;
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
    if (ownsShop) {
      setSelfPurchaseWarningOpen(true);
      return;
    }
    setCartMessage('');
    try {
      const result = await cart.addItem(selectedVariant.id, Number(selection.quantity));
      const message =
        result.adjustments[0]?.message ?? `Đã thêm ${selection.quantity} sản phẩm vào giỏ hàng.`;
      setCartMessage(message);
      setToastMessage(message);
    } catch (caught: unknown) {
      if (isSelfPurchaseError(caught)) {
        setSelfPurchaseWarningOpen(true);
        return;
      }
      setCartMessage('Không thể thêm vào giỏ hàng. Vui lòng thử lại.');
      setToastMessage('Không thể thêm vào giỏ hàng. Vui lòng thử lại.');
    }
  }

  async function handleBuyNow() {
    if (!canMutateCart || !selectedVariant) return;
    if (ownsShop) {
      setSelfPurchaseWarningOpen(true);
      return;
    }
    setCartMessage('');
    try {
      await cart.addItem(selectedVariant.id, Number(selection.quantity));
      router.push('/cart');
    } catch (caught: unknown) {
      if (isSelfPurchaseError(caught)) {
        setSelfPurchaseWarningOpen(true);
        return;
      }
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
          <div className="product-detail-actions-row">
            <FavoriteButton productId={product.id} />
            <ReportButton targetType="PRODUCT" targetId={product.id} targetName={product.name} />
          </div>
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
                {formatCurrency(selectedVariant.buyerBestPrice.merchandiseDiscountMinor)} bằng
                voucher
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
          ) : null}
          <div className="product-detail-quantity">
            <label htmlFor="product-quantity">Số lượng</label>
            <div className="product-detail-quantity__stepper">
              <button
                type="button"
                className="product-detail-quantity__btn"
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
                className="product-detail-quantity__input"
                inputMode="numeric"
                value={selection.quantity}
                aria-describedby="product-quantity-status"
                onChange={(event) =>
                  setSelection((current) => ({ ...current, quantity: event.target.value }))
                }
              />
              <button
                type="button"
                className="product-detail-quantity__btn"
                aria-label="Tăng số lượng"
                disabled={
                  !selectedVariant ||
                  Number(selection.quantity) >= selectedVariant.availableQuantity
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
              <Link
                href={handoffs.add}
                className="product-detail-purchase__btn product-detail-purchase__btn--cart"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="21" r="1" />
                  <circle cx="19" cy="21" r="1" />
                  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                </svg>
                <span>Thêm vào giỏ · Đăng nhập</span>
              </Link>
            ) : (
              <button
                type="button"
                className="product-detail-purchase__btn product-detail-purchase__btn--cart"
                disabled={
                  !handoffs ||
                  auth.state.status !== 'authenticated' ||
                  cart.pending ||
                  cart.state.status !== 'ready'
                }
                onClick={() => void handleAddToCart()}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="21" r="1" />
                  <circle cx="19" cy="21" r="1" />
                  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                </svg>
                <span>
                  {auth.state.status === 'loading' || cart.state.status === 'loading'
                    ? 'Đang kiểm tra đăng nhập…'
                    : cart.pending
                      ? 'Đang thêm…'
                      : 'Thêm vào giỏ hàng'}
                </span>
              </button>
            )}
            {handoffs && auth.state.status === 'guest' ? (
              <Link
                href={handoffs.buy}
                className="product-detail-purchase__btn product-detail-purchase__btn--buy"
              >
                <span>Mua ngay · Đăng nhập</span>
              </Link>
            ) : (
              <button
                type="button"
                className="product-detail-purchase__btn product-detail-purchase__btn--buy"
                disabled={!handoffs || !canMutateCart}
                onClick={() => void handleBuyNow()}
              >
                <span>
                  {auth.state.status === 'loading' || cart.state.status === 'loading'
                    ? 'Đang kiểm tra đăng nhập…'
                    : cart.pending
                      ? 'Đang mua…'
                      : 'Mua ngay'}
                </span>
              </button>
            )}
          </div>
        </div>
      </section>

      {selfPurchaseWarningOpen ? (
        <div
          className="self-purchase-warning-backdrop"
          role="presentation"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSelfPurchaseWarningOpen(false);
          }}
        >
          <section
            className="self-purchase-warning"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="self-purchase-warning-title"
            aria-describedby="self-purchase-warning-description"
          >
            <div className="self-purchase-warning__icon" aria-hidden="true">
              !
            </div>
            <h2 id="self-purchase-warning-title">Không thể mua sản phẩm này</h2>
            <p id="self-purchase-warning-description">
              Bạn không thể mua sản phẩm từ cửa hàng của chính mình.
            </p>
            <button type="button" autoFocus onClick={() => setSelfPurchaseWarningOpen(false)}>
              Đã hiểu
            </button>
          </section>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="product-detail-toast-overlay" role="status" aria-live="polite">
          <div className="product-detail-toast">
            <div className="product-detail-toast__icon" aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <p className="product-detail-toast__message">{toastMessage}</p>
          </div>
        </div>
      ) : null}

      <ProductReviews product={product} />
    </>
  );
}

export function ProductDetailExperience({ product }: { product: ProductDetailResponse }) {
  const { state: authState, authenticatedFetch } = useAuthSession();
  const [personalizedProduct, setPersonalizedProduct] = useState<{
    source: ProductDetailResponse;
    product: ProductDetailResponse;
  } | null>(null);
  const displayProduct =
    personalizedProduct?.source === product ? personalizedProduct.product : product;
  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    const controller = new AbortController();
    const endpoint = new URL(
      `/api/v1/catalog/products/${encodeURIComponent(product.slug ?? product.id)}`,
      process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
    );
    void authenticatedFetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) return;
        const parsed = parseProductDetailResponse(await result.json());
        if (parsed) setPersonalizedProduct({ source: product, product: parsed });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [authState.status, authenticatedFetch, product]);

  return (
    <FavoriteStateProvider
      productIds={[displayProduct.id, ...displayProduct.relatedProducts.map(({ id }) => id)]}
    >
      <ProductDetailInner product={displayProduct} />
    </FavoriteStateProvider>
  );
}
