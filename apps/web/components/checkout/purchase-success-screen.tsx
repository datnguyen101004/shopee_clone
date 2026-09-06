'use client';

import type { PurchaseResult } from '@shopee-clone/contracts';
import { StorefrontContainer } from '@shopee-clone/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { CheckoutApiError, getCheckoutPurchase } from '../../lib/checkout-api';
import { useAuthSession } from '../auth-session-provider';

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
}

function paymentMethodLabel(method: PurchaseResult['paymentMethod']): string {
  if (method === 'VNPAY') return 'Thanh toán qua VNPAY';
  if (method === 'MOMO') return 'Thanh toán qua MoMo';
  return 'Thanh toán khi nhận hàng (COD)';
}

export function PurchaseSuccessScreen({ purchaseReference }: { purchaseReference: string }) {
  const auth = useAuthSession();
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');

  useEffect(() => {
    if (auth.state.status !== 'authenticated') return;
    const controller = new AbortController();
    void getCheckoutPurchase(purchaseReference, auth.authenticatedFetch, controller.signal)
      .then((result) => {
        setPurchase(result);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof CheckoutApiError && error.kind === 'aborted') return;
        setState(error instanceof CheckoutApiError && error.status === 404 ? 'not-found' : 'error');
      });
    return () => controller.abort();
  }, [auth.authenticatedFetch, auth.state.status, purchaseReference]);

  if (auth.state.status === 'guest') {
    return (
      <StorefrontContainer className="checkout-page">
        <section className="checkout-state">
          <h1>Đăng nhập để xem đơn hàng</h1>
          <Link
            href={`/login?returnTo=${encodeURIComponent(`/checkout/success/${purchaseReference}`)}`}
          >
            Đăng nhập
          </Link>
        </section>
      </StorefrontContainer>
    );
  }
  if (auth.state.status === 'loading' || state === 'loading') {
    return (
      <StorefrontContainer className="checkout-page" aria-busy="true">
        <section className="checkout-state" role="status">
          Đang tải đơn hàng…
        </section>
      </StorefrontContainer>
    );
  }
  if (!purchase || state !== 'ready') {
    return (
      <StorefrontContainer className="checkout-page">
        <section className="checkout-state is-error" role="alert">
          <h1>{state === 'not-found' ? 'Không tìm thấy đơn hàng' : 'Chưa thể tải đơn hàng'}</h1>
          <p>Đơn không tồn tại hoặc không thuộc tài khoản đang đăng nhập.</p>
          <Link href="/">Về trang chủ</Link>
        </section>
      </StorefrontContainer>
    );
  }

  return (
    <StorefrontContainer className="checkout-page purchase-success">
      <header className="purchase-success__hero">
        <span aria-hidden="true">✓</span>
        <div>
          <p>ĐẶT HÀNG THÀNH CÔNG</p>
          <h1>Cảm ơn bạn đã mua hàng</h1>
          <small>Mã giao dịch: {purchase.purchaseReference}</small>
        </div>
      </header>
      <section className="checkout-card">
        <h2>Thông tin nhận hàng</h2>
        <p>
          <span className="font-medium">
            {purchase.address.recipientName} · {purchase.address.phoneNumber}
          </span>
        </p>
        <p>
          {purchase.address.addressLine}, {purchase.address.ward}, {purchase.address.district},{' '}
          {purchase.address.province}
        </p>
      </section>
      {purchase.orders.map((order) => (
        <section className="checkout-card purchase-order" key={order.orderReference}>
          <header>
            <div>
              <span>Shop</span>
              <span className="font-medium">{order.shop.name}</span>
            </div>
            <em>Chờ xác nhận</em>
          </header>
          <small>Mã đơn shop: {order.orderReference}</small>
          <small>Phương thức: {paymentMethodLabel(purchase.paymentMethod)}</small>
          {order.lines.map((line) => (
            <article key={line.lineId}>
              {line.productImageUrl ? <img src={line.productImageUrl} alt="" /> : null}
              <div>
                <span className="font-medium">{line.productName}</span>
                <span>
                  {line.variantName} · x{line.quantity}
                </span>
              </div>
              <span className="font-medium">{money(line.payableMerchandiseMinor)}</span>
            </article>
          ))}
          <footer>
            <span>{paymentMethodLabel(purchase.paymentMethod)}</span>
            <strong>{money(order.payableTotalMinor)}</strong>
          </footer>
        </section>
      ))}
      <section className="checkout-card purchase-success__total">
        <span>Tổng thanh toán</span>
        <strong>{money(purchase.summary.payableTotalMinor)}</strong>
      </section>
      <div className="purchase-success__actions">
        <Link href="/">Tiếp tục mua sắm</Link>
        <Link href="/account/orders">Xem đơn mua</Link>
      </div>
    </StorefrontContainer>
  );
}
