'use client';

import {
  isPaymentInstructions,
  type PaymentInstructions,
  type PaymentStatusResponse,
} from '@shopee-clone/contracts';
import { Container } from '@shopee-clone/ui';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CheckoutApiError, getPaymentStatus } from '../../lib/checkout-api';
import { useAuthSession } from '../auth-session-provider';

const uncertain = new Set(['PENDING', 'UNKNOWN', 'PENDING_RECONCILIATION', 'REFUND_PENDING']);

type PaymentProvider = PaymentStatusResponse['provider'];
type PaymentCopy = { title: string; body: string };

const statusCopyByProvider: Record<PaymentProvider, Record<string, PaymentCopy>> = {
  MOMO: {
    PENDING: {
      title: 'Đang chờ thanh toán MoMo',
      body: 'Mở MoMo Test hoặc quét QR để hoàn tất.',
    },
    UNKNOWN: {
      title: 'Đang kiểm tra giao dịch',
      body: 'Hệ thống chưa nhận được kết quả chắc chắn.',
    },
    PENDING_RECONCILIATION: {
      title: 'Đang đối soát với MoMo',
      body: 'Vui lòng giữ trang này, hệ thống sẽ tự kiểm tra lại.',
    },
    PAID: { title: 'Thanh toán thành công', body: 'Đơn hàng đã sẵn sàng cho shop xử lý.' },
    FAILED: {
      title: 'Thanh toán thất bại',
      body: 'Bạn có thể quay lại giỏ hàng và checkout lại.',
    },
    CANCELLED: {
      title: 'Thanh toán đã hủy',
      body: 'Giao dịch không được ghi nhận thanh toán.',
    },
    EXPIRED: { title: 'Giao dịch đã hết hạn', body: 'Hãy tạo một checkout mới từ giỏ hàng.' },
    REFUND_PENDING: {
      title: 'Đang hoàn tiền',
      body: 'Khoản thanh toán về muộn đang được hoàn tự động.',
    },
    REFUNDED: { title: 'Đã hoàn tiền', body: 'MoMo đã xác nhận hoàn tiền.' },
    PARTIALLY_REFUNDED: {
      title: 'Cần hỗ trợ',
      body: 'Vui lòng liên hệ hỗ trợ về khoản hoàn tiền.',
    },
  },
  VNPAY: {
    PENDING: {
      title: 'Đang chờ VNPAY xác nhận',
      body: 'Vui lòng hoàn tất thanh toán trên VNPAY sandbox.',
    },
    UNKNOWN: {
      title: 'Đang kiểm tra giao dịch VNPAY',
      body: 'Hệ thống chưa nhận được kết quả chắc chắn.',
    },
    PENDING_RECONCILIATION: {
      title: 'Đang đối soát với VNPAY',
      body: 'Vui lòng giữ trang này, hệ thống sẽ tự kiểm tra lại.',
    },
    PAID: { title: 'Thanh toán VNPAY thành công', body: 'Đơn hàng đã sẵn sàng cho shop xử lý.' },
    FAILED: {
      title: 'Thanh toán VNPAY thất bại',
      body: 'Bạn có thể quay lại giỏ hàng và checkout lại.',
    },
    CANCELLED: {
      title: 'Thanh toán VNPAY đã hủy',
      body: 'Giao dịch không được ghi nhận thanh toán.',
    },
    EXPIRED: { title: 'Giao dịch VNPAY đã hết hạn', body: 'Hãy tạo một checkout mới từ giỏ hàng.' },
    REFUND_PENDING: {
      title: 'Đang hoàn tiền VNPAY',
      body: 'Khoản thanh toán về muộn đang được hoàn tự động.',
    },
    REFUNDED: { title: 'Đã hoàn tiền VNPAY', body: 'VNPAY đã xác nhận hoàn tiền.' },
    PARTIALLY_REFUNDED: {
      title: 'Cần hỗ trợ về thanh toán VNPAY',
      body: 'Vui lòng liên hệ hỗ trợ về khoản hoàn tiền.',
    },
  },
};

export function MomoPaymentScreen({ paymentReference }: { paymentReference: string }) {
  const auth = useAuthSession();
  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null);
  const [instructions, setInstructions] = useState<PaymentInstructions | null>(null);
  const [message, setMessage] = useState('Đang tải trạng thái thanh toán…');
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stored = window.sessionStorage.getItem(`momo:instructions:${paymentReference}`);
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored);
        if (isPaymentInstructions(parsed)) {
          queueMicrotask(() => setInstructions(parsed));
        }
      } catch {
        window.sessionStorage.removeItem(`momo:instructions:${paymentReference}`);
      }
    }
  }, [paymentReference]);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (auth.state.status !== 'authenticated' || refreshingRef.current) return;
      refreshingRef.current = true;
      setRefreshing(true);
      try {
        const next = await getPaymentStatus(paymentReference, auth.authenticatedFetch, signal);
        setPayment(next);
        setMessage('');
        if (!uncertain.has(next.status)) {
          window.sessionStorage.removeItem(`momo:instructions:${paymentReference}`);
          setInstructions(null);
        }
      } catch (error) {
        if (!(error instanceof CheckoutApiError && error.kind === 'aborted')) {
          setMessage('Chưa thể tải trạng thái. Vui lòng thử lại.');
        }
      } finally {
        if (!signal?.aborted) setRefreshing(false);
        refreshingRef.current = false;
      }
    },
    [auth.authenticatedFetch, auth.state.status, paymentReference],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void refresh(controller.signal));
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  if (auth.state.status === 'guest') {
    return (
      <Container className="checkout-page">
        <Link
          href={`/login?returnTo=${encodeURIComponent(`/checkout/payment/${paymentReference}`)}`}
        >
          Đăng nhập để xem thanh toán
        </Link>
      </Container>
    );
  }
  const provider = payment?.provider ?? null;
  const providerLabel = provider === 'VNPAY' ? 'VNPAY' : provider === 'MOMO' ? 'MoMo' : 'Thanh toán';
  const copy = payment
    ? (statusCopyByProvider[payment.provider][payment.status] ??
      statusCopyByProvider[payment.provider].UNKNOWN!)
    : { title: 'Đang tải trạng thái thanh toán', body: 'Vui lòng chờ trong giây lát.' };
  const seconds = payment?.expiresAt
    ? Math.max(0, Math.ceil((new Date(payment.expiresAt).getTime() - now) / 1_000))
    : null;
  return (
    <Container className="checkout-page momo-payment-page">
      <section className="checkout-card" aria-live="polite">
        <p>{provider ? `${providerLabel} SANDBOX` : 'PAYMENT SANDBOX'}</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        {message ? <p role="status">{message}</p> : null}
        {uncertain.has(payment?.status ?? 'PENDING') ? (
          <button type="button" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
          </button>
        ) : null}
        {seconds !== null && payment?.status === 'PENDING' ? (
          <strong>Còn {seconds} giây</strong>
        ) : null}
      </section>
      {payment?.status === 'PENDING' && instructions ? (
        <section
          className="checkout-card momo-instructions"
          aria-label={`Hướng dẫn thanh toán ${providerLabel}`}
        >
          {instructions.qrCodeValue?.startsWith('https://') ? (
            <img src={instructions.qrCodeValue} alt={`Mã QR ${providerLabel} sandbox`} />
          ) : null}
          {provider === 'MOMO' && instructions.deeplink ? (
            <a href={instructions.deeplink}>Mở MoMo Test</a>
          ) : null}
          {instructions.payUrl ? (
            <a href={instructions.payUrl} target="_blank" rel="noreferrer">
              Mở trang thanh toán {providerLabel}
            </a>
          ) : null}
        </section>
      ) : null}
      {payment && !uncertain.has(payment.status) && payment.status !== 'PAID' ? (
        <Link href="/cart">Quay lại giỏ hàng</Link>
      ) : null}
      {payment?.status === 'PAID' ? (
        <Link href={`/checkout/success/${payment.purchaseReference}`}>Xem đơn hàng</Link>
      ) : null}
    </Container>
  );
}
