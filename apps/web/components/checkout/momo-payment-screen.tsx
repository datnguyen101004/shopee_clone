'use client';

import { isPaymentInstructions, type PaymentInstructions, type PaymentStatusResponse } from '@shopee-clone/contracts';
import { Container } from '@shopee-clone/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { CheckoutApiError, getPaymentStatus } from '../../lib/checkout-api';
import { useAuthSession } from '../auth-session-provider';

const uncertain = new Set(['PENDING', 'UNKNOWN', 'PENDING_RECONCILIATION', 'REFUND_PENDING']);

const statusCopy: Record<string, { title: string; body: string }> = {
  PENDING: { title: 'Đang chờ thanh toán MoMo', body: 'Mở MoMo Test hoặc quét QR để hoàn tất.' },
  UNKNOWN: { title: 'Đang kiểm tra giao dịch', body: 'Hệ thống chưa nhận được kết quả chắc chắn.' },
  PENDING_RECONCILIATION: { title: 'Đang đối soát với MoMo', body: 'Vui lòng giữ trang này, hệ thống sẽ tự kiểm tra lại.' },
  PAID: { title: 'Thanh toán thành công', body: 'Đơn hàng đã sẵn sàng cho shop xử lý.' },
  FAILED: { title: 'Thanh toán thất bại', body: 'Bạn có thể quay lại giỏ hàng và checkout lại.' },
  CANCELLED: { title: 'Thanh toán đã hủy', body: 'Giao dịch không được ghi nhận thanh toán.' },
  EXPIRED: { title: 'Giao dịch đã hết hạn', body: 'Hãy tạo một checkout mới từ giỏ hàng.' },
  REFUND_PENDING: { title: 'Đang hoàn tiền', body: 'Khoản thanh toán về muộn đang được hoàn tự động.' },
  REFUNDED: { title: 'Đã hoàn tiền', body: 'MoMo đã xác nhận hoàn tiền.' },
  PARTIALLY_REFUNDED: { title: 'Cần hỗ trợ', body: 'Vui lòng liên hệ hỗ trợ về khoản hoàn tiền.' },
};

export function MomoPaymentScreen({ paymentReference }: { paymentReference: string }) {
  const auth = useAuthSession();
  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null);
  const [instructions, setInstructions] = useState<PaymentInstructions | null>(null);
  const [message, setMessage] = useState('Đang tải trạng thái thanh toán…');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stored = window.sessionStorage.getItem(`momo:instructions:${paymentReference}`);
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored);
        if (isPaymentInstructions(parsed)) setInstructions(parsed);
      } catch {
        window.sessionStorage.removeItem(`momo:instructions:${paymentReference}`);
      }
    }
  }, [paymentReference]);

  useEffect(() => {
    if (auth.state.status !== 'authenticated') return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 2_000;
    const poll = async () => {
      try {
        const next = await getPaymentStatus(
          paymentReference,
          auth.authenticatedFetch,
          controller.signal,
        );
        setPayment(next);
        setMessage('');
        if (!uncertain.has(next.status)) {
          window.sessionStorage.removeItem(`momo:instructions:${paymentReference}`);
          setInstructions(null);
          return;
        }
        timer = setTimeout(poll, delay);
        delay = Math.min(delay * 1.5, 10_000);
      } catch (error) {
        if (!(error instanceof CheckoutApiError && error.kind === 'aborted')) {
          setMessage('Chưa thể tải trạng thái. Hệ thống sẽ thử lại.');
          timer = setTimeout(poll, delay);
        }
      }
    };
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [auth.state.status, auth.authenticatedFetch, paymentReference]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  if (auth.state.status === 'guest') {
    return (
      <Container className="checkout-page"><Link href={`/login?returnTo=${encodeURIComponent(`/checkout/payment/${paymentReference}`)}`}>Đăng nhập để xem thanh toán</Link></Container>
    );
  }
  const copy = statusCopy[payment?.status ?? 'PENDING']!;
  const seconds = payment?.expiresAt
    ? Math.max(0, Math.ceil((new Date(payment.expiresAt).getTime() - now) / 1_000))
    : null;
  return (
    <Container className="checkout-page momo-payment-page">
      <section className="checkout-card" aria-live="polite">
        <p>MOMO SANDBOX</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        {message ? <p role="status">{message}</p> : null}
        {seconds !== null && payment?.status === 'PENDING' ? <strong>Còn {seconds} giây</strong> : null}
      </section>
      {payment?.status === 'PENDING' && instructions ? (
        <section className="checkout-card momo-instructions" aria-label="Hướng dẫn thanh toán MoMo">
          {instructions.qrCodeValue?.startsWith('https://') ? <img src={instructions.qrCodeValue} alt="Mã QR MoMo sandbox" /> : null}
          {instructions.deeplink ? <a href={instructions.deeplink}>Mở MoMo Test</a> : null}
          {instructions.payUrl ? <a href={instructions.payUrl} target="_blank" rel="noreferrer">Mở trang thanh toán MoMo</a> : null}
        </section>
      ) : null}
      {payment && !uncertain.has(payment.status) && payment.status !== 'PAID' ? <Link href="/cart">Quay lại giỏ hàng</Link> : null}
      {payment?.status === 'PAID' ? <Link href={`/checkout/success/${payment.purchaseReference}`}>Xem đơn hàng</Link> : null}
    </Container>
  );
}
