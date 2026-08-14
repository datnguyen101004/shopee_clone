'use client';

import type { PurchaseResult } from '@shopee-clone/contracts';
import { Container } from '@shopee-clone/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { CheckoutApiError, getCheckoutPurchase } from '../../lib/checkout-api';
import { useAuthSession } from '../auth-session-provider';

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
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
      <Container className="checkout-page">
        <section className="checkout-state">
          <h1>Đăng nhập để xem đơn hàng</h1>
          <Link
            href={`/login?returnTo=${encodeURIComponent(`/checkout/success/${purchaseReference}`)}`}
          >
            Đăng nhập
          </Link>
        </section>
      </Container>
    );
  }
  if (auth.state.status === 'loading' || state === 'loading') {
    return (
      <Container className="checkout-page" aria-busy="true">
        <section className="checkout-state" role="status">
          Đang tải đơn hàng…
        </section>
      </Container>
    );
  }
  if (!purchase || state !== 'ready') {
    return (
      <Container className="checkout-page">
        <section className="checkout-state is-error" role="alert">
          <h1>{state === 'not-found' ? 'Không tìm thấy đơn hàng' : 'Chưa thể tải đơn hàng'}</h1>
          <p>Đơn không tồn tại hoặc không thuộc tài khoản đang đăng nhập.</p>
          <Link href="/">Về trang chủ</Link>
        </section>
      </Container>
    );
  }

  return (
    <Container className="checkout-page purchase-success">
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
          <strong>
            {purchase.address.recipientName} · {purchase.address.phoneNumber}
          </strong>
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
              <strong>{order.shop.name}</strong>
            </div>
            <em>Chờ xác nhận</em>
          </header>
          <small>Mã đơn shop: {order.orderReference}</small>
          {order.lines.map((line) => (
            <article key={line.lineId}>
              {line.productImageUrl ? <img src={line.productImageUrl} alt="" /> : null}
              <div>
                <strong>{line.productName}</strong>
                <span>
                  {line.variantName} · x{line.quantity}
                </span>
              </div>
              <b>{money(line.payableMerchandiseMinor)}</b>
            </article>
          ))}
          <footer>
            <span>COD khi nhận hàng</span>
            <strong>{money(order.payableTotalMinor)}</strong>
          </footer>
        </section>
      ))}
      <section className="checkout-card purchase-success__total">
        <span>Tổng COD</span>
        <strong>{money(purchase.summary.payableTotalMinor)}</strong>
      </section>
      <div className="purchase-success__actions">
        <Link href="/">Tiếp tục mua sắm</Link>
        <Link href="/cart">Xem giỏ hàng</Link>
      </div>
    </Container>
  );
}
