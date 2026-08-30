'use client';

import { CHECKOUT_NOTE_MAX_LENGTH, SHIPPING_SERVICES } from '@shopee-clone/contracts';
import { Container } from '@shopee-clone/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { CheckoutApiError, confirmCodCheckout, confirmMomoCheckout } from '../../lib/checkout-api';
import { clearCheckoutDraft } from '../../lib/checkout-draft';
import { CheckoutSubmitIntent } from '../../lib/checkout-intent';
import { AddressCreationDialog } from '../address-creation-dialog';
import { useAuthSession } from '../auth-session-provider';
import { useCart } from '../cart/cart-provider';
import { useCheckoutPreview } from './use-checkout-preview';
import { ChatNowButton } from '../chat/chat-now-button';

const serviceLabels = {
  ECONOMY: 'Tiết kiệm',
  STANDARD: 'Nhanh',
  EXPRESS: 'Hỏa tốc',
} as const;

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
}

export function CheckoutScreen() {
  const auth = useAuthSession();
  const cart = useCart();
  const router = useRouter();
  const currentCart = cart.state.cart;
  const checkout = useCheckoutPreview(currentCart, cart.refresh);
  const intent = useRef(new CheckoutSubmitIntent());
  const submitLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'MOMO'>('COD');

  if (auth.state.status === 'guest' || cart.state.status === 'unauthenticated') {
    return (
      <Container className="checkout-page">
        <section className="checkout-state">
          <h1>Đăng nhập để thanh toán</h1>
          <p>Đơn hàng chỉ được tạo cho tài khoản đã đăng nhập.</p>
          <Link href="/login?returnTo=%2Fcheckout">Đăng nhập</Link>
        </section>
      </Container>
    );
  }

  if (auth.state.status === 'loading' || cart.state.status === 'loading') {
    return (
      <Container className="checkout-page" aria-busy="true">
        <section className="checkout-state" role="status">
          Đang tải thông tin thanh toán…
        </section>
      </Container>
    );
  }

  if (!currentCart || currentCart.summary.selectedValidLineCount === 0) {
    return (
      <Container className="checkout-page">
        <section className="checkout-state">
          <h1>Không có sản phẩm để thanh toán</h1>
          <p>Hãy chọn ít nhất một sản phẩm hợp lệ trong giỏ hàng.</p>
          <Link href="/cart">Quay lại giỏ hàng</Link>
        </section>
      </Container>
    );
  }

  const preview = checkout.preview;
  const canSubmit =
    checkout.status === 'ready' &&
    preview?.ready === true &&
    preview.checkoutFingerprint !== null &&
    checkout.request !== null &&
    preview.cartVersion === currentCart.version;

  async function submit() {
    if (!canSubmit || !preview?.checkoutFingerprint || !checkout.request || submitLock.current) {
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setSubmitMessage(
      paymentMethod === 'MOMO' ? 'Đang tạo giao dịch MoMo sandbox…' : 'Đang tạo đơn hàng COD…',
    );
    const request = { ...checkout.request, checkoutFingerprint: preview.checkoutFingerprint };
    const signature = JSON.stringify({ cartVersion: currentCart!.version, request, paymentMethod });
    try {
      const idempotencyKey = intent.current.keyFor(signature);
      if (paymentMethod === 'MOMO') {
        const result = await confirmMomoCheckout(
          { ...request, provider: 'MOMO' },
          currentCart!.version,
          idempotencyKey,
          auth.authenticatedFetch,
        );
        clearCheckoutDraft(window.sessionStorage);
        intent.current.clear();
        await cart.refresh();
        if (result.payment.instructions) {
          window.sessionStorage.setItem(
            `momo:instructions:${result.payment.paymentReference}`,
            JSON.stringify(result.payment.instructions),
          );
        }
        router.replace(`/checkout/payment/${result.payment.paymentReference}`);
      } else {
        const result = await confirmCodCheckout(
          request,
          currentCart!.version,
          idempotencyKey,
          auth.authenticatedFetch,
        );
        clearCheckoutDraft(window.sessionStorage);
        intent.current.clear();
        await cart.refresh();
        router.replace(`/checkout/success/${result.purchase.purchaseReference}`);
      }
    } catch (error) {
      if (error instanceof CheckoutApiError && error.status === 401) {
        router.replace('/login?returnTo=%2Fcheckout');
      } else if (error instanceof CheckoutApiError && error.status === 409) {
        if (error.problem?.type.endsWith('/checkout-idempotency-conflict')) intent.current.rotate();
        setSubmitMessage(
          error.problem?.type.endsWith('/checkout-preview-changed')
            ? 'Giá hoặc ưu đãi đã thay đổi. Hãy xem lại tổng mới rồi đặt hàng lại.'
            : 'Giỏ hàng hoặc thông tin thanh toán đã thay đổi. Đang xác nhận lại…',
        );
        checkout.retry();
      } else if (error instanceof CheckoutApiError && error.kind === 'transport') {
        setSubmitMessage(
          'Chưa nhận được kết quả. Bấm đặt hàng lại để kiểm tra bằng cùng mã an toàn.',
        );
      } else {
        setSubmitMessage('Chưa thể tạo đơn hàng. Vui lòng thử lại.');
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Container className="checkout-page">
      <header className="checkout-heading">
        <div>
          <p>THANH TOÁN AN TOÀN</p>
          <h1>Thanh toán</h1>
        </div>
        <Link href="/cart">Quay lại giỏ hàng</Link>
      </header>

      <section className="checkout-card checkout-address" aria-labelledby="checkout-address-title">
        <div>
          <p>ĐỊA CHỈ NHẬN HÀNG</p>
          <h2 id="checkout-address-title">Thông tin giao hàng</h2>
        </div>
        {checkout.addresses.length ? (
          <>
            <label>
              Chọn địa chỉ
              <select
                value={checkout.addressId}
                onChange={(event) => checkout.setAddress(event.target.value)}
              >
                {checkout.addresses.map((address) => (
                  <option value={address.id} key={address.id}>
                    {address.label ? `${address.label} · ` : ''}
                    {address.recipientName} · {address.district}
                  </option>
                ))}
              </select>
            </label>
            {preview ? (
              <address>
                <strong>
                  {preview.address.recipientName} · {preview.address.phoneNumber}
                </strong>
                <span>
                  {preview.address.addressLine}, {preview.address.ward}, {preview.address.district},{' '}
                  {preview.address.province}
                </span>
                {preview.address.label ? <em>{preview.address.label}</em> : null}
              </address>
            ) : null}
          </>
        ) : (
          <>
            <div className="checkout-required">
              <p>Bạn chưa có địa chỉ nhận hàng.</p>
              <button type="button" onClick={() => setAddressDialogOpen(true)}>
                Thêm địa chỉ nhận hàng
              </button>
            </div>
            <AddressCreationDialog
              open={addressDialogOpen}
              onOpenChange={setAddressDialogOpen}
              onCreated={() => checkout.retry()}
            />
          </>
        )}
      </section>

      <div className="checkout-orders">
        {(preview?.shops ?? []).map((shop) => (
          <section className="checkout-card checkout-shop" key={shop.shop.id}>
            <header>
              <span>Shop</span>
              <strong>{shop.shop.name}</strong>
              <ChatNowButton shopId={shop.shop.id} ownerUserId={shop.shop.ownerUserId} />
            </header>
            <div className="checkout-lines">
              {shop.lines.map((line) => (
                <article key={line.lineId}>
                  {line.productImageUrl ? (
                    <img src={line.productImageUrl} alt="" />
                  ) : (
                    <span className="checkout-line-placeholder">S</span>
                  )}
                  <div>
                    <strong>{line.productName}</strong>
                    <small>
                      Phân loại: {line.variantName} · x{line.quantity}
                    </small>
                  </div>
                  <div>
                    <del>
                      {line.listUnitPriceMinor > line.sellingUnitPriceMinor
                        ? money(line.listUnitPriceMinor)
                        : ''}
                    </del>
                    <strong>{money(line.payableMerchandiseMinor)}</strong>
                  </div>
                </article>
              ))}
            </div>
            <div className="checkout-shop-controls">
              <label>
                Phương thức vận chuyển
                <select
                  value={checkout.services[shop.shop.id] ?? 'STANDARD'}
                  onChange={(event) =>
                    checkout.setService(
                      shop.shop.id,
                      event.target.value as keyof typeof serviceLabels,
                    )
                  }
                >
                  {SHIPPING_SERVICES.map((service) => (
                    <option key={service} value={service}>
                      {serviceLabels[service]}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                Nhận sau {shop.shipping.estimatedDaysMin}–{shop.shipping.estimatedDaysMax} ngày ·{' '}
                {money(shop.shippingPayableMinor)}
              </span>
              <label>
                Lời nhắn cho shop
                <textarea
                  value={checkout.notes[shop.shop.id] ?? ''}
                  maxLength={CHECKOUT_NOTE_MAX_LENGTH}
                  onChange={(event) => checkout.setNote(shop.shop.id, event.target.value)}
                  placeholder="Ví dụ: Giao trong giờ hành chính"
                />
                <small>
                  {(checkout.notes[shop.shop.id] ?? '').length}/{CHECKOUT_NOTE_MAX_LENGTH}
                </small>
              </label>
            </div>
            <footer>
              <span>Tổng shop</span>
              <strong>{money(shop.payableTotalMinor)}</strong>
            </footer>
          </section>
        ))}
      </div>

      {preview?.vouchers.length ? (
        <section
          className="checkout-card checkout-vouchers"
          aria-labelledby="checkout-vouchers-title"
        >
          <h2 id="checkout-vouchers-title">Shopee Voucher</h2>
          {preview.vouchers.map((voucher) => (
            <p
              key={`${voucher.slot}-${voucher.shopId ?? 'platform'}`}
              className={voucher.status === 'APPLIED' ? 'is-applied' : 'is-rejected'}
            >
              <strong>{voucher.code}</strong> ·{' '}
              {voucher.status === 'APPLIED'
                ? `Đã giảm ${money(voucher.discountMinor)}`
                : 'Không còn đủ điều kiện'}
            </p>
          ))}
        </section>
      ) : null}

      <section className="checkout-card checkout-payment">
        <h2>Phương thức thanh toán</h2>
        <label>
          <input
            type="radio"
            name="payment-method"
            checked={paymentMethod === 'COD'}
            onChange={() => setPaymentMethod('COD')}
          />{' '}
          Thanh toán khi nhận hàng (COD)
        </label>
        <label>
          <input
            type="radio"
            name="payment-method"
            checked={paymentMethod === 'MOMO'}
            onChange={() => setPaymentMethod('MOMO')}
          />{' '}
          Ví MoMo (sandbox)
        </label>
        {paymentMethod === 'MOMO' ? (
          <p>Bạn sẽ dùng QR hoặc ứng dụng MoMo Test để thanh toán tổng tiền đã xác nhận.</p>
        ) : null}
      </section>

      <div
        className={`checkout-feedback${checkout.status === 'error' ? ' is-error' : ''}`}
        role={checkout.status === 'error' ? 'alert' : 'status'}
        aria-live="polite"
      >
        <span>{submitMessage || checkout.message}</span>
        {checkout.status === 'error' ? (
          <button type="button" onClick={checkout.retry}>
            Thử lại
          </button>
        ) : null}
      </div>
      {preview?.blockers.length ? (
        <section className="checkout-blockers" role="alert">
          <h2>Chưa thể đặt hàng</h2>
          <ul>
            {preview.blockers.map((blocker, index) => (
              <li key={`${blocker.code}-${index}`}>{blocker.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <aside className="checkout-total" aria-label="Tổng thanh toán">
        <div>
          <span>Tổng tiền hàng</span>
          <strong>{preview ? money(preview.summary.merchandiseSubtotalMinor) : '—'}</strong>
          <span>Phí vận chuyển</span>
          <strong>{preview ? money(preview.summary.shippingPayableMinor) : '—'}</strong>
          <span>Voucher giảm</span>
          <strong>{preview ? `−${money(preview.summary.voucherDiscountMinor)}` : '—'}</strong>
          <span>Tổng thanh toán</span>
          <b>{preview ? money(preview.summary.payableTotalMinor) : 'Đang tính…'}</b>
        </div>
        <button type="button" disabled={!canSubmit || submitting} onClick={() => void submit()}>
          {submitting ? 'Đang đặt hàng…' : 'Đặt hàng'}
        </button>
      </aside>
    </Container>
  );
}
