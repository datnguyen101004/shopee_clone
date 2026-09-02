'use client';

import {
  ORDER_CANCELLATION_REASON_CODES,
  ORDER_LIST_FILTERS,
  type BuyerOrderDetailResponse,
  type BuyerOrderListFilter,
  type BuyerOrderSummary,
  type BuyerOrderTimelineEvent,
  type OrderCancellationReasonCode,
  type ShopOrderStatus,
} from '@shopee-clone/contracts';
import { Card } from '@shopee-clone/ui';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { buyerOrdersHref } from '../../lib/order-history-query';
import {
  cancelBuyerOrder,
  getBuyerOrderDetail,
  getBuyerOrders,
  OrderHistoryApiError,
} from '../../lib/order-history-api';
import { useAuthSession } from '../auth-session-provider';
import {
  createProductReview,
  getAuthorProductReview,
  stageReviewMedia,
  updateProductReview,
  ReviewsApiError,
} from '../../lib/reviews-api';
import {
  AccountLoadFailure,
  AccountWorkspace,
  ProtectedAccountState,
} from '../protected-account-state';
import { BuyerReturnForm } from '../returns/buyer-return-form';

const statusLabels: Record<ShopOrderStatus, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  AWAITING_PICKUP: 'Chờ lấy hàng',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
  RETURN_REQUESTED: 'Đang yêu cầu trả hàng',
  RETURNED: 'Đã trả hàng',
  REFUNDED: 'Đã hoàn tiền',
};

const filterLabels: Record<BuyerOrderListFilter, string> = {
  ALL: 'Tất cả',
  PENDING_PAYMENT: 'Chờ thanh toán',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  SHIPPING: 'Vận chuyển',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
  RETURN_REFUND: 'Trả hàng / Hoàn tiền',
};

const paymentStatusLabels: Record<BuyerOrderSummary['paymentStatus'], string> = {
  UNPAID: 'Chưa thanh toán',
  PENDING: 'Chờ thanh toán',
  PENDING_RECONCILIATION: 'Đang xác minh thanh toán',
  UNKNOWN: 'Đang xác minh thanh toán',
  PAID: 'Đã thanh toán',
  FAILED: 'Thanh toán thất bại',
  CANCELLED: 'Đã hủy thanh toán',
  EXPIRED: 'Phiên thanh toán hết hạn',
  REFUND_PENDING: 'Đang xử lý hoàn tiền',
  PARTIALLY_REFUNDED: 'Hoàn tiền một phần',
  REFUNDED: 'Đã hoàn tiền',
};

function buyerOrderStatusLabel(order: Pick<BuyerOrderSummary, 'status' | 'paymentStatus'>) {
  if (order.status === 'PENDING_PAYMENT' || order.status === 'CANCELLED') {
    return statusLabels[order.status];
  }
  const paymentIsUnsettled = !['UNPAID', 'PAID'].includes(order.paymentStatus);
  return paymentIsUnsettled ? paymentStatusLabels[order.paymentStatus] : statusLabels[order.status];
}

function buyerTimelineEventLabel(
  event: BuyerOrderTimelineEvent,
  timeline: BuyerOrderTimelineEvent[],
): string {
  const onlinePaymentWasConfirmed = timeline.some(
    (item) => item.reasonCode === 'VNPAY_PAYMENT_CONFIRMED',
  );
  const hasExplicitVnpayPendingStep = timeline.some(
    (item) => item.reasonCode === 'VNPAY_PAYMENT_PENDING' || item.status === 'PENDING_PAYMENT',
  );
  if (
    onlinePaymentWasConfirmed &&
    !hasExplicitVnpayPendingStep &&
    event.reasonCode === 'ORDER_CREATED' &&
    event.status === 'PENDING_CONFIRMATION'
  ) {
    return 'Chờ thanh toán';
  }
  return statusLabels[event.status];
}

function buyerVisibleTimeline(timeline: BuyerOrderTimelineEvent[]): BuyerOrderTimelineEvent[] {
  const first = timeline[0];
  const hasExplicitVnpayPendingStep = timeline.some(
    (event) => event.reasonCode === 'VNPAY_PAYMENT_PENDING' || event.status === 'PENDING_PAYMENT',
  );
  // The API keeps version 0 as PENDING_CONFIRMATION to satisfy the immutable
  // timeline contract. For VNPAY, that event is an internal contract anchor;
  // buyers should see the real payment-gated journey instead.
  if (
    hasExplicitVnpayPendingStep &&
    first?.reasonCode === 'ORDER_CREATED' &&
    first.status === 'PENDING_CONFIRMATION'
  ) {
    return timeline.slice(1);
  }
  return timeline;
}

const reasonLabels: Record<OrderCancellationReasonCode, string> = {
  CHANGE_ADDRESS: 'Muốn thay đổi địa chỉ nhận hàng',
  CHANGE_PRODUCT: 'Muốn thay đổi sản phẩm hoặc phân loại',
  FOUND_BETTER_PRICE: 'Tìm thấy mức giá tốt hơn',
  NO_LONGER_NEEDED: 'Không còn nhu cầu mua',
  OTHER: 'Lý do khác',
};

const actorLabels = {
  SYSTEM: 'Hệ thống',
  BUYER: 'Bạn',
  SELLER: 'Người bán',
  ADMIN: 'Quản trị viên',
} as const;
const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
const dateTime = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

function OrderCard({ order }: { order: BuyerOrderSummary }) {
  return (
    <Card className="buyer-order-card">
      <header>
        <Link href={`/shops/${order.shop.slug}`}>{order.shop.name}</Link>
        <strong className={`buyer-order-status is-${order.status.toLowerCase()}`}>
          {buyerOrderStatusLabel(order)}
        </strong>
        <span aria-label="Trạng thái thanh toán">
          Thanh toán: {paymentStatusLabels[order.paymentStatus]}
        </span>
      </header>
      <div className="buyer-order-card__lines">
        {order.lines.map((line) => (
          <article key={line.lineId}>
            <Link
              className="buyer-order-product-link"
              href={`/products/${line.productId}`}
              aria-label={`${line.productName}${line.productAvailable ? '' : ' (sản phẩm đã bị xóa)'}`}
            >
              {line.productImageUrl ? (
                <img src={line.productImageUrl} alt="" />
              ) : (
                <span aria-hidden="true">SP</span>
              )}
            </Link>
            <div>
              <strong>
                <Link href={`/products/${line.productId}`}>{line.productName}</Link>
              </strong>
              <small>
                {line.variantName} · x{line.quantity}
                {line.productAvailable ? '' : ' · Sản phẩm đã bị xóa'}
              </small>
            </div>
            <b>{money(line.payableMerchandiseMinor)}</b>
          </article>
        ))}
      </div>
      <footer>
        <span>Đặt lúc {dateTime(order.createdAt)}</span>
        <div>
          <span>Thành tiền</span>
          <strong>{money(order.payableTotalMinor)}</strong>
          <Link href={`/account/orders/${order.orderReference}`}>Xem chi tiết</Link>
        </div>
      </footer>
    </Card>
  );
}

function ReviewAction({
  orderReference,
  line,
}: {
  orderReference: string;
  line: BuyerOrderSummary['lines'][number];
}) {
  const auth = useAuthSession();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [existing, setExisting] = useState<{ id: string; etag: string; mediaIds: string[] } | null>(
    null,
  );
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const key = useRef<string | null>(null);
  if (!line.review || line.review.state === 'INELIGIBLE') return null;
  async function submit() {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      const stagedMediaIds = await Promise.all(
        files.map((file) => stageReviewMedia(file, auth.authenticatedFetch)),
      );
      const mediaIds = existing ? [...existing.mediaIds, ...stagedMediaIds] : stagedMediaIds;
      if (existing) {
        await updateProductReview(
          existing.id,
          {
            rating: rating as 1 | 2 | 3 | 4 | 5,
            ...(text.trim() ? { text } : {}),
            ...(mediaIds.length ? { mediaIds } : {}),
          },
          existing.etag,
          auth.authenticatedFetch,
        );
        setMessage('Đánh giá đã được cập nhật.');
        setOpen(false);
        return;
      }
      key.current ??= crypto.randomUUID();
      await createProductReview(
        orderReference,
        line.lineId,
        {
          rating: rating as 1 | 2 | 3 | 4 | 5,
          ...(text.trim() ? { text } : {}),
          ...(mediaIds.length ? { mediaIds } : {}),
        },
        key.current,
        auth.authenticatedFetch,
      );
      key.current = null;
      setMessage('Đánh giá đã được lưu. Tải lại chi tiết đơn để xem trạng thái mới.');
      setOpen(false);
    } catch (error) {
      if (error instanceof ReviewsApiError && error.status === 409 && existing) {
        try {
          const latest = await getAuthorProductReview(existing.id, auth.authenticatedFetch);
          setExisting({
            id: latest.review.id,
            etag: latest.etag,
            mediaIds: latest.review.media.map((media) => media.id),
          });
          setMessage(
            'Đánh giá đã thay đổi ở phiên khác. Đã tải phiên bản mới; nội dung bạn nhập vẫn được giữ để gửi lại.',
          );
        } catch {
          setMessage('Đánh giá đã thay đổi. Vui lòng tải lại trang trước khi thử lại.');
        }
      } else
        setMessage(
          error instanceof ReviewsApiError && error.status === 409
            ? 'Đánh giá đã tồn tại. Tải lại chi tiết đơn.'
            : 'Chưa thể lưu đánh giá. Nội dung của bạn vẫn được giữ để thử lại.',
        );
    } finally {
      setPending(false);
    }
  }
  async function openEdit() {
    if (!line.review?.reviewId) return;
    try {
      const result = await getAuthorProductReview(line.review.reviewId, auth.authenticatedFetch);
      setExisting({
        id: result.review.id,
        etag: result.etag,
        mediaIds: result.review.media.map((media) => media.id),
      });
      setRating(result.review.rating);
      setText(result.review.text ?? '');
      setOpen(true);
      setMessage(
        result.review.visibility === 'HIDDEN'
          ? 'Đánh giá này hiện đang bị ẩn với người xem công khai.'
          : '',
      );
    } catch {
      setMessage('Không thể tải đánh giá hiện tại. Vui lòng thử lại.');
    }
  }
  const close = () => {
    if (!pending) setOpen(false);
  };
  return (
    <div className="buyer-review-action">
      {line.review.state === 'REVIEWED' ? (
        <button type="button" onClick={() => void openEdit()}>
          Sửa đánh giá
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Đánh giá
        </button>
      )}
      {open ? (
        <div
          className="review-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className="review-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`review-title-${line.lineId}`}
          >
            <header className="review-dialog__header">
              <h2 id={`review-title-${line.lineId}`}>Đánh giá sản phẩm</h2>
              <button type="button" aria-label="Đóng đánh giá" disabled={pending} onClick={close}>
                ×
              </button>
            </header>
            <div className="review-dialog__product">
              {line.productImageUrl ? (
                <img src={line.productImageUrl} alt="" />
              ) : (
                <span aria-hidden="true">SP</span>
              )}
              <div>
                <strong>{line.productName}</strong>
                <small>Phân loại: {line.variantName}</small>
              </div>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <fieldset className="review-dialog__rating">
                <legend>Chất lượng sản phẩm</legend>
                <div>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label
                      className={value <= rating ? 'is-active' : undefined}
                      key={value}
                      title={`${value} sao`}
                    >
                      <input
                        disabled={pending}
                        type="radio"
                        name={`rating-${line.lineId}`}
                        checked={rating === value}
                        onChange={() => setRating(value)}
                      />
                      <span aria-hidden="true">★</span>
                      <span className="sr-only">{value} sao</span>
                    </label>
                  ))}
                </div>
                <strong>
                  {rating === 5
                    ? 'Tuyệt vời'
                    : rating === 4
                      ? 'Hài lòng'
                      : rating === 3
                        ? 'Bình thường'
                        : rating === 2
                          ? 'Không hài lòng'
                          : 'Tệ'}
                </strong>
              </fieldset>
              <div className="review-dialog__comment">
                <label htmlFor={`review-text-${line.lineId}`}>Đúng với mô tả:</label>
                <textarea
                  id={`review-text-${line.lineId}`}
                  disabled={pending}
                  maxLength={1000}
                  placeholder="Hãy chia sẻ những điều bạn thích về sản phẩm này với những người mua khác nhé."
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <small>{text.length}/1000</small>
              </div>
              <div className="review-dialog__media">
                <span>Thêm hình ảnh</span>
                <label className="review-dialog__upload">
                  <input
                    aria-label="Ảnh đánh giá"
                    disabled={pending || files.length >= 6}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) =>
                      setFiles((current) =>
                        [...current, ...Array.from(event.target.files ?? [])].slice(
                          0,
                          Math.max(0, 6 - (existing?.mediaIds.length ?? 0)),
                        ),
                      )
                    }
                  />
                  <span aria-hidden="true">＋</span>
                  <strong>Thêm hình ảnh</strong>
                  <small>{files.length}/6</small>
                </label>
                {files.map((file, index) => (
                  <div className="review-dialog__file" key={`${file.name}-${index}`}>
                    <span>{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Xóa ${file.name}`}
                      onClick={() =>
                        setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <p className="review-dialog__notice">
                Đánh giá của bạn sẽ được hiển thị công khai với nhãn “Đã mua hàng”.
              </p>
              <footer>
                <button type="button" disabled={pending} onClick={close}>
                  Trở lại
                </button>
                <button className="review-dialog__submit" disabled={pending} type="submit">
                  {pending ? 'Đang gửi…' : 'Hoàn thành'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

export function BuyerOrderListScreen({ filter }: { filter: BuyerOrderListFilter | null }) {
  const auth = useAuthSession();
  const userId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const [items, setItems] = useState<BuyerOrderSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (cursor: string | null, append: boolean, signal?: AbortSignal) => {
      if (!userId || !filter) return;
      setLoading(true);
      setFailed(false);
      try {
        const result = await getBuyerOrders(filter, cursor, auth.authenticatedFetch, signal);
        setItems((current) => (append ? [...current, ...result.items] : result.items));
        setNextCursor(result.page.nextCursor);
      } catch (error) {
        if (error instanceof OrderHistoryApiError && error.kind === 'aborted') return;
        setFailed(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [auth.authenticatedFetch, filter, userId],
  );

  useEffect(() => {
    if (!userId || !filter) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(null, false, controller.signal);
    });
    return () => controller.abort();
  }, [filter, load, userId]);

  return (
    <AccountWorkspace
      title="Đơn mua"
      description="Theo dõi trạng thái và xem lại thông tin đã chốt khi đặt hàng."
    >
      <ProtectedAccountState account={auth.state} returnTo="/account/orders">
        {!filter ? (
          <section className="buyer-account-state">
            <h2>Đường dẫn chưa hợp lệ</h2>
            <p>Bộ lọc đơn hàng không được hỗ trợ.</p>
            <Link href="/account/orders">Xem tất cả đơn mua</Link>
          </section>
        ) : (
          <>
            <nav className="buyer-order-tabs" aria-label="Lọc trạng thái đơn hàng">
              {ORDER_LIST_FILTERS.map((item) => (
                <Link
                  key={item}
                  href={buyerOrdersHref(item)}
                  aria-current={filter === item ? 'page' : undefined}
                >
                  {filterLabels[item]}
                </Link>
              ))}
            </nav>
            {loading && items.length === 0 ? (
              <section className="buyer-account-state" aria-busy="true">
                <h2>Đang tải đơn mua…</h2>
              </section>
            ) : null}
            {failed && items.length === 0 ? (
              <AccountLoadFailure onRetry={() => void load(null, false)} />
            ) : null}
            {!loading && !failed && items.length === 0 ? (
              <section className="buyer-account-state">
                <h2>Chưa có đơn phù hợp</h2>
                <p>Đơn hàng mới sẽ xuất hiện tại đây sau khi đặt hàng thành công.</p>
                <Link href="/">Tiếp tục mua sắm</Link>
              </section>
            ) : null}
            {items.length > 0 ? (
              <div className="buyer-orders" aria-busy={loading}>
                {failed ? (
                  <p className="engagement-inline-error" role="alert">
                    Chưa thể tải thêm đơn. Vui lòng thử lại.
                  </p>
                ) : null}
                {items.map((order) => (
                  <OrderCard key={order.orderReference} order={order} />
                ))}
                {nextCursor ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void load(nextCursor, true)}
                  >
                    {loading ? 'Đang tải…' : 'Xem thêm'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </ProtectedAccountState>
    </AccountWorkspace>
  );
}

function CancellationModal({
  pending,
  onClose,
  onConfirm,
}: {
  pending: boolean;
  onClose(): void;
  onConfirm(reason: OrderCancellationReasonCode, note: string): void;
}) {
  const [reason, setReason] = useState<OrderCancellationReasonCode>('CHANGE_ADDRESS');
  const [note, setNote] = useState('');
  const invalid = reason === 'OTHER' && !note.trim();
  return (
    <div
      className="buyer-order-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="cancel-order-title">
        <h2 id="cancel-order-title">Hủy đơn hàng</h2>
        <p>Chọn lý do để xác nhận. Thao tác này không thể hoàn tác.</p>
        <label>
          Lý do
          <select
            value={reason}
            disabled={pending}
            onChange={(event) => setReason(event.target.value as OrderCancellationReasonCode)}
          >
            {ORDER_CANCELLATION_REASON_CODES.map((code) => (
              <option value={code} key={code}>
                {reasonLabels[code]}
              </option>
            ))}
          </select>
        </label>
        {reason === 'OTHER' ? (
          <label>
            Mô tả lý do
            <textarea
              maxLength={500}
              value={note}
              disabled={pending}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        ) : null}
        {invalid ? <p role="alert">Vui lòng nhập lý do hủy đơn.</p> : null}
        <footer>
          <button type="button" disabled={pending} onClick={onClose}>
            Giữ đơn hàng
          </button>
          <button
            type="button"
            disabled={pending || invalid}
            onClick={() => onConfirm(reason, note)}
          >
            {pending ? 'Đang hủy…' : 'Xác nhận hủy'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function BuyerOrderDetailScreen({ orderReference }: { orderReference: string }) {
  const auth = useAuthSession();
  const userId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const [detail, setDetail] = useState<BuyerOrderDetailResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [notice, setNotice] = useState('');
  const cancelKey = useRef<string | null>(null);
  const submitting = useRef(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!userId) return;
      setState('loading');
      try {
        const result = await getBuyerOrderDetail(orderReference, auth.authenticatedFetch, signal);
        setDetail(result);
        setState('ready');
      } catch (error) {
        if (error instanceof OrderHistoryApiError && error.kind === 'aborted') return;
        setState(
          error instanceof OrderHistoryApiError && error.status === 404 ? 'not-found' : 'error',
        );
      }
    },
    [auth.authenticatedFetch, orderReference, userId],
  );

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load, userId]);

  async function cancel(reasonCode: OrderCancellationReasonCode, reasonNote: string) {
    if (!detail || submitting.current) return;
    submitting.current = true;
    setCancelPending(true);
    setNotice('');
    cancelKey.current ??= crypto.randomUUID();
    try {
      const result = await cancelBuyerOrder(
        detail.order.orderReference,
        detail.order.version,
        cancelKey.current,
        { reasonCode, ...(reasonNote.trim() ? { reasonNote } : {}) },
        auth.authenticatedFetch,
      );
      setDetail(result);
      setCancelOpen(false);
      cancelKey.current = null;
      setNotice('Đơn hàng đã được hủy.');
    } catch (error) {
      if (error instanceof OrderHistoryApiError && error.status === 409) {
        setCancelOpen(false);
        cancelKey.current = null;
        await load();
        setNotice('Trạng thái đơn đã thay đổi. Thông tin mới nhất đã được tải lại.');
      } else {
        setNotice('Chưa thể hủy đơn. Vui lòng thử lại với cùng yêu cầu.');
      }
    } finally {
      submitting.current = false;
      setCancelPending(false);
    }
  }

  return (
    <AccountWorkspace
      title="Chi tiết đơn hàng"
      description="Thông tin được lưu tại thời điểm bạn xác nhận mua hàng."
    >
      <ProtectedAccountState account={auth.state} returnTo={`/account/orders/${orderReference}`}>
        {state === 'loading' ? (
          <section className="buyer-account-state" aria-busy="true">
            <h2>Đang tải chi tiết đơn…</h2>
          </section>
        ) : null}
        {state === 'error' ? <AccountLoadFailure onRetry={() => void load()} /> : null}
        {state === 'not-found' ? (
          <section className="buyer-account-state">
            <h2>Không tìm thấy đơn hàng</h2>
            <p>Đơn không tồn tại hoặc không thuộc tài khoản này.</p>
            <Link href="/account/orders">Về danh sách đơn mua</Link>
          </section>
        ) : null}
        {detail && state === 'ready' ? (
          <div className="buyer-order-detail">
            {notice ? (
              <p className="buyer-order-notice" role="status">
                {notice}
              </p>
            ) : null}
            <header className="buyer-order-detail__heading">
              <div>
                <small>Mã đơn</small>
                <strong>{detail.order.orderReference}</strong>
                <small>Mã giao dịch {detail.order.purchaseReference}</small>
              </div>
              <strong className={`buyer-order-status is-${detail.order.status.toLowerCase()}`}>
                {buyerOrderStatusLabel(detail.order)}
              </strong>
              <span aria-label="Trạng thái thanh toán">
                Thanh toán: {paymentStatusLabels[detail.order.paymentStatus]}
              </span>
            </header>
            <Card className="buyer-order-detail__card">
              <h2>Địa chỉ nhận hàng</h2>
              <strong>
                {detail.address.recipientName} · {detail.address.phoneNumber}
              </strong>
              <p>
                {detail.address.addressLine}, {detail.address.ward}, {detail.address.district},{' '}
                {detail.address.province}
              </p>
            </Card>
            <Card className="buyer-order-detail__card">
              <h2>{detail.order.shop.name}</h2>
              <strong className={`buyer-order-status is-${detail.order.status.toLowerCase()}`}>
                {buyerOrderStatusLabel(detail.order)}
              </strong>
              {detail.order.lines.map((line) => (
                <article className="buyer-order-detail__line" key={line.lineId}>
                  <Link
                    className="buyer-order-product-link"
                    href={`/products/${line.productId}`}
                    aria-label={`${line.productName}${line.productAvailable ? '' : ' (sản phẩm đã bị xóa)'}`}
                  >
                    {line.productImageUrl ? (
                      <img src={line.productImageUrl} alt="" />
                    ) : (
                      <span aria-hidden="true">SP</span>
                    )}
                  </Link>
                  <div>
                    <strong>
                      <Link href={`/products/${line.productId}`}>{line.productName}</Link>
                    </strong>
                    <small>
                      {line.variantName} · x{line.quantity}
                      {line.productAvailable ? '' : ' · Sản phẩm đã bị xóa'}
                    </small>
                  </div>
                  <b>{money(line.payableMerchandiseMinor)}</b>
                  <ReviewAction orderReference={detail.order.orderReference} line={line} />
                </article>
              ))}
              <dl className="buyer-order-totals">
                <div>
                  <dt>Tiền hàng</dt>
                  <dd>{money(detail.order.merchandiseSubtotalMinor)}</dd>
                </div>
                <div>
                  <dt>Phí vận chuyển</dt>
                  <dd>{money(detail.order.shipping.shippingFeeMinor)}</dd>
                </div>
                <div>
                  <dt>Giảm giá</dt>
                  <dd>-{money(detail.order.voucherDiscountMinor)}</dd>
                </div>
                <div>
                  <dt>Thành tiền</dt>
                  <dd>{money(detail.order.payableTotalMinor)}</dd>
                </div>
              </dl>
              {detail.order.returnCapability?.returnReference ? (
                <p className="buyer-order-notice">
                  <Link href={`/account/returns/${detail.order.returnCapability.returnReference}`}>
                    Xem yêu cầu trả hàng / hoàn tiền
                  </Link>
                </p>
              ) : null}
              {detail.order.returnCapability?.allowed ? (
                <BuyerReturnForm order={detail.order} />
              ) : null}
            </Card>
            <Card className="buyer-order-detail__card">
              <h2>Hành trình đơn hàng</h2>
              <ol className="buyer-order-timeline">
                {buyerVisibleTimeline(detail.timeline).map((event) => (
                  <li key={event.id}>
                    <span aria-hidden="true" />
                    <div>
                      <strong>{buyerTimelineEventLabel(event, detail.timeline)}</strong>
                      <small>
                        {actorLabels[event.actorType]} · {dateTime(event.occurredAt)}
                      </small>
                      {event.reasonNote ? <p>{event.reasonNote}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
            <div className="buyer-order-detail__actions">
              <Link href="/account/orders">Về đơn mua</Link>
              {detail.order.cancellation.allowed ? (
                <button type="button" onClick={() => setCancelOpen(true)}>
                  Hủy đơn hàng
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {cancelOpen ? (
          <CancellationModal
            pending={cancelPending}
            onClose={() => setCancelOpen(false)}
            onConfirm={(reason, note) => void cancel(reason, note)}
          />
        ) : null}
      </ProtectedAccountState>
    </AccountWorkspace>
  );
}
