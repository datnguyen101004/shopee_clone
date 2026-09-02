'use client';

import type { PaymentStatusResponse } from '@shopee-clone/contracts';
import { Container } from '@shopee-clone/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CheckoutApiError,
  getPaymentStatus,
  resolveVnpayPayment,
  settleVnpayReturn,
} from '../../lib/checkout-api';
import { useAuthSession } from '../auth-session-provider';

const TERMINAL_PAYMENT_STATUSES = new Set<PaymentStatusResponse['status']>([
  'PAID',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUND_PENDING',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);
const POLL_DELAYS_MS = [1_000, 1_500, 2_000, 3_000, 5_000] as const;
const MAX_POLL_DURATION_MS = 10 * 60 * 1_000;
const EMPTY_CALLBACK_FIELDS: Readonly<Record<string, string>> = {};

const copy: Record<string, { title: string; body: string }> = {
  PENDING: {
    title: 'Đang chờ VNPAY xác nhận',
    body: 'VNPAY đang gửi kết quả thanh toán về hệ thống.',
  },
  PENDING_RECONCILIATION: {
    title: 'Đang đối soát thanh toán',
    body: 'Hệ thống đang kiểm tra lại giao dịch với VNPAY.',
  },
  UNKNOWN: {
    title: 'Đang kiểm tra trạng thái thanh toán',
    body: 'Chưa có kết quả chắc chắn từ VNPAY.',
  },
  PAID: {
    title: 'Thanh toán thành công',
    body: 'Đơn hàng đã được ghi nhận và chuyển cho shop xử lý.',
  },
  FAILED: { title: 'Thanh toán thất bại', body: 'Giao dịch chưa được ghi nhận.' },
  CANCELLED: { title: 'Bạn đã hủy thanh toán', body: 'Bạn có thể quay lại giỏ hàng để thử lại.' },
  EXPIRED: {
    title: 'Giao dịch đã hết hạn',
    body: 'Vui lòng tạo lại đơn hàng nếu bạn vẫn muốn mua.',
  },
  REFUND_PENDING: {
    title: 'Thanh toán cần được hỗ trợ',
    body: 'Giao dịch về muộn đang được xử lý thủ công. Vui lòng liên hệ hỗ trợ.',
  },
  PARTIALLY_REFUNDED: {
    title: 'Thanh toán đang được hoàn một phần',
    body: 'Vui lòng liên hệ hỗ trợ để theo dõi khoản hoàn tiền.',
  },
  REFUNDED: { title: 'Đã hoàn tiền', body: 'Khoản thanh toán đã được ghi nhận hoàn tiền.' },
};

export function VnpayCallbackScreen({
  transactionReference,
  callbackFields = EMPTY_CALLBACK_FIELDS,
}: {
  transactionReference: string | null;
  callbackFields?: Readonly<Record<string, string>>;
}) {
  const auth = useAuthSession();
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null);
  const [message, setMessage] = useState('Đang tải trạng thái thanh toán…');
  const [pending, setPending] = useState(false);
  const [screenState, setScreenState] = useState<'loading' | 'ready' | 'not-found' | 'error'>(
    'loading',
  );
  const pendingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pollTimerRef = useRef<number | null>(null);
  const pollRef = useRef<() => void>(() => undefined);
  const resolvedPaymentReferenceRef = useRef<string | null>(null);
  const returnSettledRef = useRef(false);
  const pollIndexRef = useRef(0);
  const pollStartedAtRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (auth.state.status === 'authenticated' && transactionReference && window.location.search) {
      window.history.replaceState(null, '', '/payment/callback');
    }
  }, [auth.state.status, transactionReference]);

  const readStatus = useCallback(async (): Promise<{
    payment: PaymentStatusResponse | null;
    shouldContinue: boolean;
  }> => {
    if (auth.state.status !== 'authenticated' || !transactionReference || pendingRef.current) {
      return { payment: null, shouldContinue: false };
    }
    pendingRef.current = true;
    setPending(true);
    try {
      const paymentReference =
        resolvedPaymentReferenceRef.current ??
        (await resolveVnpayPayment(transactionReference, auth.authenticatedFetch)).paymentReference;
      resolvedPaymentReferenceRef.current = paymentReference;
      const responseCode = callbackFields.vnp_ResponseCode;
      const transactionStatus = callbackFields.vnp_TransactionStatus;
      const terminalReturn =
        Boolean(responseCode) && (responseCode !== '00' || transactionStatus !== '00');
      if (terminalReturn && !returnSettledRef.current) {
        returnSettledRef.current = true;
        setMessage('Đang ghi nhận kết quả hủy/thất bại…');
        try {
          const settled = await settleVnpayReturn(callbackFields, auth.authenticatedFetch);
          setPayment(settled);
          setMessage('');
          setScreenState('ready');
          return {
            payment: settled,
            shouldContinue: !TERMINAL_PAYMENT_STATUSES.has(settled.status),
          };
        } catch {
          setMessage('Chưa thể ghi nhận kết quả từ VNPAY. Hệ thống sẽ tiếp tục đối soát.');
        }
      }
      const result = await getPaymentStatus(paymentReference, auth.authenticatedFetch);
      setPayment(result);
      setMessage('');
      setScreenState('ready');
      return { payment: result, shouldContinue: !TERMINAL_PAYMENT_STATUSES.has(result.status) };
    } catch (error) {
      if (error instanceof CheckoutApiError && error.status === 404) {
        setScreenState('not-found');
        setMessage('');
        return { payment: null, shouldContinue: false };
      } else if (!(error instanceof CheckoutApiError && error.kind === 'aborted')) {
        setScreenState('error');
        setMessage('Chưa thể tải trạng thái. Vui lòng thử lại.');
      }
      return { payment: null, shouldContinue: true };
    } finally {
      setPending(false);
      pendingRef.current = false;
    }
  }, [auth.authenticatedFetch, auth.state.status, callbackFields, transactionReference]);

  const redirectToOrder = useCallback(
    async (result: PaymentStatusResponse) => {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      setMessage('Đã nhận kết quả thanh toán. Đang mở đơn hàng…');
      try {
        const navigation = result.navigation;
        if (navigation?.kind === 'ORDER' && navigation.orderReference) {
          router.replace(`/account/orders/${encodeURIComponent(navigation.orderReference)}`);
        } else {
          router.replace('/account/orders');
        }
      } catch {
        redirectingRef.current = false;
        setScreenState('error');
        setMessage('Đã nhận kết quả nhưng chưa thể mở đơn hàng. Vui lòng thử lại.');
      }
    },
    [auth.authenticatedFetch, router],
  );

  const poll = useCallback(async () => {
    if (disposedRef.current || redirectingRef.current) return;
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const read = await readStatus();
    if (disposedRef.current || redirectingRef.current) return;
    if (read.payment && TERMINAL_PAYMENT_STATUSES.has(read.payment.status)) {
      await redirectToOrder(read.payment);
      return;
    }
    if (!read.shouldContinue) return;
    const startedAt = pollStartedAtRef.current ?? Date.now();
    pollStartedAtRef.current = startedAt;
    if (Date.now() - startedAt >= MAX_POLL_DURATION_MS) {
      setMessage('VNPAY chưa trả kết quả cuối cùng. Vui lòng kiểm tra lại sau.');
      return;
    }
    const delay = POLL_DELAYS_MS[Math.min(pollIndexRef.current, POLL_DELAYS_MS.length - 1)]!;
    pollIndexRef.current += 1;
    pollTimerRef.current = window.setTimeout(() => pollRef.current(), delay);
  }, [readStatus, redirectToOrder]);

  useEffect(() => {
    pollRef.current = () => void poll();
  }, [poll]);

  useEffect(() => {
    if (auth.state.status !== 'authenticated' || !transactionReference) return;
    disposedRef.current = false;
    resolvedPaymentReferenceRef.current = null;
    returnSettledRef.current = false;
    pollStartedAtRef.current = Date.now();
    pollIndexRef.current = 0;
    queueMicrotask(() => void poll());
    return () => {
      disposedRef.current = true;
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [auth.state.status, poll, transactionReference]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [poll]);

  useEffect(() => {
    if (screenState !== 'loading') headingRef.current?.focus();
  }, [payment?.status, screenState]);

  if (auth.state.status === 'guest') {
    return (
      <Container className="checkout-page">
        <section className="checkout-state">
          <h1>Đăng nhập để xem thanh toán</h1>
          <Link
            href={`/login?returnTo=${encodeURIComponent(
              transactionReference
                ? `/payment/callback?vnp_TxnRef=${encodeURIComponent(transactionReference)}`
                : '/payment/callback',
            )}`}
          >
            Đăng nhập
          </Link>
        </section>
      </Container>
    );
  }
  if (!transactionReference) {
    return (
      <Container className="checkout-page">
        <section className="checkout-state is-error">
          <h1>Thiếu mã giao dịch</h1>
          <p>Không thể xác định giao dịch VNPAY.</p>
          <Link href="/account/orders">Xem đơn mua</Link>
        </section>
      </Container>
    );
  }
  if (screenState === 'not-found') {
    return (
      <Container className="checkout-page">
        <section className="checkout-state is-error" role="alert">
          <h1>Không thể mở giao dịch này</h1>
          <p>Vui lòng kiểm tra lại tài khoản hoặc xem danh sách đơn mua.</p>
          <Link href="/account/orders">Về đơn mua</Link>
        </section>
      </Container>
    );
  }
  const state = payment?.status ?? 'PENDING';
  const current =
    screenState === 'loading'
      ? { title: 'Đang kiểm tra kết quả thanh toán', body: 'Vui lòng chờ trong giây lát.' }
      : (copy[state] ?? copy.UNKNOWN!);
  return (
    <Container className="checkout-page">
      <section className="checkout-state" role="status" aria-live="polite">
        <p>VNPAY SANDBOX</p>
        <h1 ref={headingRef} tabIndex={-1}>
          {current.title}
        </h1>
        <p>{current.body}</p>
        {message ? <p>{message}</p> : null}
        {state === 'PENDING' || state === 'UNKNOWN' || state === 'PENDING_RECONCILIATION' ? (
          <button type="button" disabled={pending} onClick={() => void poll()}>
            {pending ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
          </button>
        ) : null}
        {state === 'PAID' && payment ? <Link href="/account/orders">Xem đơn hàng</Link> : null}
        {state !== 'PAID' &&
        state !== 'PENDING' &&
        state !== 'UNKNOWN' &&
        state !== 'PENDING_RECONCILIATION' ? (
          <Link href="/cart">Quay lại giỏ hàng</Link>
        ) : null}
        {state === 'FAILED' || state === 'CANCELLED' || state === 'EXPIRED' ? (
          <Link href="/cart">Tạo đơn mới từ giỏ hàng</Link>
        ) : null}
      </section>
    </Container>
  );
}
