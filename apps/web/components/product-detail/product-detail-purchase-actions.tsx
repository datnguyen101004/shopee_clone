'use client';

import Link from 'next/link';

export interface ProductPurchaseActionsProps {
  handoffs: { add: string; buy: string } | null;
  authStatus: 'guest' | 'authenticated' | 'loading';
  cartPending: boolean;
  cartStatus: 'ready' | 'loading' | 'unauthenticated' | 'error';
  canMutateCart: boolean;
  onAddToCart: () => void;
  onBuyNow: () => void;
}

export function ProductPurchaseActions({
  handoffs,
  authStatus,
  cartPending,
  cartStatus,
  canMutateCart,
  onAddToCart,
  onBuyNow,
}: ProductPurchaseActionsProps) {
  const isAuthChecking = authStatus === 'loading' || cartStatus === 'loading';

  return (
    <div className="product-detail-purchase">
      {handoffs && authStatus === 'guest' ? (
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
            authStatus !== 'authenticated' ||
            cartPending ||
            cartStatus !== 'ready'
          }
          onClick={onAddToCart}
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
            {isAuthChecking
              ? 'Đang kiểm tra đăng nhập…'
              : cartPending
                ? 'Đang thêm…'
                : 'Thêm vào giỏ hàng'}
          </span>
        </button>
      )}

      {handoffs && authStatus === 'guest' ? (
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
          onClick={onBuyNow}
        >
          <span>
            {isAuthChecking
              ? 'Đang kiểm tra đăng nhập…'
              : cartPending
                ? 'Đang mua…'
                : 'Mua ngay'}
          </span>
        </button>
      )}
    </div>
  );
}

export interface SelfPurchaseWarningModalProps {
  isOpen: boolean;
  onDismiss: () => void;
}

export function SelfPurchaseWarningModal({ isOpen, onDismiss }: SelfPurchaseWarningModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="self-purchase-warning-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDismiss();
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
        <button type="button" autoFocus onClick={onDismiss}>
          Đã hiểu
        </button>
      </section>
    </div>
  );
}

export interface ProductCartToastProps {
  message: string | null;
}

export function ProductCartToast({ message }: ProductCartToastProps) {
  if (!message) return null;

  return (
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
        <p className="product-detail-toast__message">{message}</p>
      </div>
    </div>
  );
}
