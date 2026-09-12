'use client';

import { useEffect, useRef } from 'react';
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
  onClose?: () => void;
}

export function ProductCartToast({ message, onClose }: ProductCartToastProps) {
  const toastRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!message) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose?.();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        toastRef.current &&
        !toastRef.current.contains(event.target as Node)
      ) {
        onClose?.();
      }
    }

    function handleWindowBlur() {
      onClose?.();
    }

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div
      className="product-detail-toast-overlay"
      role="status"
      aria-live="polite"
      tabIndex={-1}
    >
      <div
        ref={toastRef}
        className="product-detail-toast"
        role="dialog"
        aria-modal="true"
        aria-label="Thông báo thêm vào giỏ hàng"
        tabIndex={0}
        onBlur={(e) => {
          if (
            e.relatedTarget &&
            !toastRef.current?.contains(e.relatedTarget as Node)
          ) {
            onClose?.();
          }
        }}
      >
        {onClose && (
          <button
            type="button"
            className="product-detail-toast__close-btn"
            onClick={onClose}
            aria-label="Đóng thông báo"
            title="Đóng"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        <div className="product-detail-toast__icon" aria-hidden="true">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="product-detail-toast__message">{message}</p>
      </div>
    </div>
  );
}
