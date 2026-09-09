'use client';

import { useEffect, useState, useRef } from 'react';
import { StorefrontContainer } from '@shopee-clone/ui';
import type { CheckoutAdmissionState } from '../../lib/flash-sale-types';

export interface CheckoutWaitingRoomProps {
  status: CheckoutAdmissionState;
  retryAfterSeconds: number;
  leaseExpiresAt?: string | null;
  message?: string;
  onPollStatus: () => Promise<void>;
  onLeaveQueue: () => Promise<void>;
  onLeaveAdmission: () => Promise<void>;
  onRejoinQueue: () => Promise<void>;
  onProceedToCheckout: () => void;
}

export function CheckoutWaitingRoom({
  status,
  retryAfterSeconds,
  leaseExpiresAt,
  message,
  onPollStatus,
  onLeaveQueue,
  onLeaveAdmission,
  onRejoinQueue,
  onProceedToCheckout,
}: CheckoutWaitingRoomProps) {
  const [countdown, setCountdown] = useState(retryAfterSeconds || 5);
  const [leaving, setLeaving] = useState(false);
  const pollLock = useRef(false);
  const pollStatusRef = useRef(onPollStatus);

  useEffect(() => {
    pollStatusRef.current = onPollStatus;
  }, [onPollStatus]);

  useEffect(() => {
    // The server may change the retry window on every poll; mirror that value in the local countdown.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCountdown(retryAfterSeconds || 5);
  }, [retryAfterSeconds]);

  const [leaseCountdown, setLeaseCountdown] = useState<number | null>(null);

  // Local timer counting down to the next poll and the fixed five-minute lease.
  useEffect(() => {
    if (status !== 'WAITING' && status !== 'ADMITTED') return;

    const interval = setInterval(() => {
      if (status === 'ADMITTED' && leaseExpiresAt) {
        const remaining = Math.max(0, Math.ceil((Date.parse(leaseExpiresAt) - Date.now()) / 1000));
        setLeaseCountdown(remaining);
        if (remaining === 0 && !pollLock.current && !document.hidden) {
          pollLock.current = true;
          void pollStatusRef.current().finally(() => { pollLock.current = false; });
        }
      }
      if (status !== 'WAITING') return;
      setCountdown((curr) => {
        if (curr <= 1) {
          if (!pollLock.current && !document.hidden) {
            pollLock.current = true;
            void pollStatusRef.current().finally(() => {
              pollLock.current = false;
            });
          }
          return retryAfterSeconds || 5;
        }
        return curr - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status, retryAfterSeconds, leaseExpiresAt]);

  useEffect(() => {
    if (status !== 'ADMITTED' || !leaseExpiresAt) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeaseCountdown(Math.max(0, Math.ceil((Date.parse(leaseExpiresAt) - Date.now()) / 1000)));
  }, [status, leaseExpiresAt]);

  // Tab hidden pause / resume polling
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && (status === 'WAITING' || status === 'ADMITTED') && !pollLock.current) {
        pollLock.current = true;
        void pollStatusRef.current().finally(() => {
          pollLock.current = false;
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [status]);

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await onLeaveQueue();
    } finally {
      setLeaving(false);
    }
  };

  const handleLeaveAdmission = async () => {
    setLeaving(true);
    try {
      await onLeaveAdmission();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <StorefrontContainer className="checkout-page">
      <div className="checkout-waiting-room" role="region" aria-labelledby="waiting-room-title">
        {status === 'WAITING' && (
          <div className="checkout-waiting-card checkout-waiting-card--waiting">
            <div className="checkout-waiting-spinner" aria-hidden="true" />
            <h1 id="waiting-room-title">Phòng chờ thanh toán</h1>
            <p className="checkout-waiting-msg">
              {message || 'Có nhiều người đang mua sắm. Bạn đang chờ đến lượt vào thanh toán.'}
            </p>
            <p className="checkout-waiting-hint">
              Giỏ hàng và lựa chọn của bạn được giữ nguyên. Hệ thống không cam kết vị trí FIFO và không giữ quota/tồn kho cho bạn.
            </p>
            <p className="checkout-waiting-poll-info" aria-live="polite">
              Tự kiểm tra lại sau {countdown}s...
            </p>
            <div className="checkout-waiting-actions">
              <button
                type="button"
                className="checkout-waiting-btn checkout-waiting-btn--secondary"
                disabled={leaving}
                onClick={() => void handleLeave()}
              >
                {leaving ? 'Đang rời...' : 'Rời hàng đợi'}
              </button>
            </div>
          </div>
        )}

        {status === 'ADMITTED' && (
          <div className="checkout-waiting-card checkout-waiting-card--admitted" role="status">
            <span className="checkout-waiting-icon" aria-hidden="true">
              ✅
            </span>
            <h1 id="waiting-room-title">Đã đến lượt thanh toán của bạn!</h1>
            <div className="checkout-waiting-callout">
              <p>
                <strong>Lưu ý quan trọng:</strong> Đến lượt thanh toán <em>không có nghĩa sản phẩm đã được giữ</em>.
                Suất mua chỉ được bảo đảm khi bạn bấm &quot;Đặt hàng&quot; và đơn hàng được ghi nhận thành công.
              </p>
              <p>Thời gian truy cập còn lại: <strong>{Math.floor((leaseCountdown ?? 300) / 60)} phút {(leaseCountdown ?? 300) % 60}s</strong>. Bạn cần tự bấm đặt hàng; hệ thống không tự gửi đơn.</p>
            </div>
            <div className="checkout-waiting-actions">
              <button
                type="button"
                className="checkout-waiting-btn checkout-waiting-btn--secondary"
                disabled={leaving}
                onClick={() => void handleLeaveAdmission()}
              >
                {leaving ? 'Đang rời...' : 'Rời lượt thanh toán'}
              </button>
              <button
                type="button"
                className="checkout-waiting-btn checkout-waiting-btn--primary"
                onClick={onProceedToCheckout}
              >
                Tiếp tục vào thanh toán ngay
              </button>
            </div>
          </div>
        )}

        {status === 'EXPIRED' && (
          <div className="checkout-waiting-card checkout-waiting-card--expired" role="alert">
            <span className="checkout-waiting-icon" aria-hidden="true">
              ⏰
            </span>
            <h1 id="waiting-room-title">Hết thời gian truy cập lượt thanh toán</h1>
            <p className="checkout-waiting-msg">
              Lượt thanh toán trước đó đã hết hạn do thời gian chờ quá lâu. Giỏ hàng của bạn vẫn được lưu nguyên vẹn.
            </p>
            <div className="checkout-waiting-actions">
              <button
                type="button"
                className="checkout-waiting-btn checkout-waiting-btn--primary"
                onClick={() => void onRejoinQueue()}
              >
                Xếp hàng lại
              </button>
            </div>
          </div>
        )}

        {status === 'CLOSED' && (
          <div className="checkout-waiting-card checkout-waiting-card--closed" role="alert">
            <span className="checkout-waiting-icon" aria-hidden="true">
              ⚠️
            </span>
            <h1 id="waiting-room-title">Phiên truy cập đã đóng</h1>
            <p className="checkout-waiting-msg">
              {message || 'Phiên waiting room đã đóng. Vui lòng quay lại giỏ hàng để xem lại điều kiện trước khi tiếp tục đặt hàng.'}
            </p>
            <div className="checkout-waiting-actions">
              <button
                type="button"
                className="checkout-waiting-btn checkout-waiting-btn--secondary"
                onClick={() => window.location.assign('/cart')}
              >
                Quay lại giỏ hàng
              </button>
            </div>
          </div>
        )}
      </div>
    </StorefrontContainer>
  );
}
