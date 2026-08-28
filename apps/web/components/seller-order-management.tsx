'use client';

import type {
  SellerOrderAction,
  SellerOrderActionRequest,
  SellerOrderAvailableAction,
  SellerOrderDetailResponse,
  SellerOrderFulfillmentFilter,
  SellerOrderListResponse,
  SellerOrderQueueFilter,
  SellerOrderRejectionReason,
  SellerOrderSummary,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  executeSellerOrderAction,
  fetchSellerOrder,
  fetchSellerOrders,
} from '../lib/seller-orders-api';
import { RoleApiError } from '../lib/role-api';
import { marketplaceMediaUrl } from '../lib/marketplace-media-url';
import { useAuthSession } from './auth-session-provider';

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
const statusLabels: Record<string, string> = {
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  AWAITING_PICKUP: 'Chờ đơn vị vận chuyển lấy hàng',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
  RETURN_REQUESTED: 'Yêu cầu trả hàng',
  RETURNED: 'Đã trả hàng',
  REFUNDED: 'Đã hoàn tiền',
};
const fulfillmentLabels: Record<string, string> = {
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  PREPARING: 'Đang chuẩn bị',
  READY_FOR_PICKUP: 'Chờ đơn vị vận chuyển lấy hàng',
  HANDED_OFF: 'Đơn vị vận chuyển đã lấy hàng',
  REJECTED: 'Shop từ chối',
  CANCELLED: 'Đã hủy',
};
const actionLabels: Record<SellerOrderAction, string> = {
  CONFIRM: 'Xác nhận đơn',
  START_PREPARING: 'Bắt đầu chuẩn bị',
  MARK_READY_FOR_PICKUP: 'Sẵn sàng lấy hàng',
  HAND_OFF: 'Bàn giao vận chuyển',
  REJECT: 'Từ chối đơn',
};
const reasonLabels: Record<SellerOrderRejectionReason, string> = {
  OUT_OF_STOCK: 'Hết hàng',
  DAMAGED_OR_DEFECTIVE: 'Hàng hỏng/không đạt',
  PRICE_OR_LISTING_ERROR: 'Sai giá hoặc thông tin',
  CANNOT_FULFILL: 'Không thể xử lý',
  OTHER: 'Lý do khác',
};

function ErrorState({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="seller-orders-state seller-orders-state--error">
      <p>{error}</p>
      <button type="button" onClick={retry}>
        Thử lại
      </button>
    </div>
  );
}
function OrderCard({ item }: { item: SellerOrderSummary }) {
  return (
    <Link className="seller-order-card" href={`/seller/orders/${item.orderReference}`}>
      <div className="seller-order-card__top">
        <strong>Đơn #{item.orderReference.slice(0, 8).toUpperCase()}</strong>
        <span>{statusLabels[item.status] ?? item.status}</span>
      </div>
      <div className="seller-order-card__body">
        <div className="seller-order-card__items">
          {item.lines.slice(0, 3).map((line) => (
            <div className="seller-order-line" key={line.lineId}>
              {line.productImageUrl ? (
                <img src={marketplaceMediaUrl(line.productImageUrl)} alt="" />
              ) : (
                <span className="seller-order-line__fallback">Ảnh</span>
              )}
              <span>
                <b>{line.productName}</b>
                <small>
                  {line.variantName} · x{line.quantity}
                </small>
              </span>
            </div>
          ))}
        </div>
        <div className="seller-order-card__total">
          <small>{fulfillmentLabels[item.fulfillmentState]}</small>
          <b>{money(item.payableTotalMinor)}</b>
          <span>{item.itemQuantity} sản phẩm</span>
        </div>
      </div>
      <div className="seller-order-card__bottom">
        {item.deadline.confirmationOverdue || item.deadline.handoffOverdue ? (
          <em>Quá hạn xử lý</em>
        ) : (
          <span>{new Date(item.createdAt).toLocaleString('vi-VN')}</span>
        )}
        <span>{item.availableActions.length} thao tác khả dụng</span>
      </div>
    </Link>
  );
}

export function SellerOrderQueueScreen() {
  const { state, authenticatedFetch } = useAuthSession();
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<SellerOrderQueueFilter>(
    (params.get('status') as SellerOrderQueueFilter) || 'ALL',
  );
  const [fulfillment, setFulfillment] = useState<SellerOrderFulfillmentFilter>(
    (params.get('fulfillment') as SellerOrderFulfillmentFilter) || 'ALL',
  );
  const [page, setPage] = useState<SellerOrderListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (state.status !== 'authenticated') return;
      setLoading(true);
      setError(null);
      try {
        const next = await fetchSellerOrders(authenticatedFetch, { status, fulfillment, cursor });
        setPage((previous) => append && previous ? { ...next, items: [...previous.items, ...next.items] } : next);
      } catch (cause) {
        setError(
          cause instanceof RoleApiError
            ? (cause.problem?.detail ??
                (cause.status === 403
                  ? 'Bạn không có quyền quản lý đơn hàng.'
                  : 'Không thể tải đơn hàng.'))
            : 'Không thể tải đơn hàng.',
        );
      } finally {
        setLoading(false);
      }
    },
    [authenticatedFetch, fulfillment, state.status, status],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const changeFilter = (nextStatus: SellerOrderQueueFilter) => {
    setStatus(nextStatus);
    setPage(null);
    router.replace(`/seller/orders?status=${nextStatus}&fulfillment=${fulfillment}`);
  };
  if (state.status !== 'authenticated')
    return (
      <section className="seller-orders-state">
        <h1>Đơn hàng</h1>
        <p>Vui lòng đăng nhập tài khoản seller để quản lý đơn hàng.</p>
      </section>
    );
  const tabs: Array<[SellerOrderQueueFilter, string]> = [
    ['ALL', 'Tất cả'],
    ['PENDING_CONFIRMATION', 'Chờ xác nhận'],
    ['AWAITING_PICKUP', 'Chờ lấy hàng'],
    ['SHIPPING', 'Đang giao'],
    ['DELIVERED', 'Hoàn tất'],
    ['CANCELLED', 'Đã hủy'],
  ];
  return (
    <section className="seller-orders-page">
      <header className="seller-orders-heading">
        <div>
          <p className="seller-orders-eyebrow">SELLER CENTER</p>
          <h1>Đơn hàng</h1>
          <p>Shop xác nhận đơn và theo dõi quá trình lấy hàng của đơn vị vận chuyển.</p>
        </div>
        <span className="seller-orders-count">{page?.items.length ?? 0} đơn</span>
      </header>
      <div className="seller-orders-tabs" role="tablist">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => changeFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="seller-orders-filters">
        <label>
          Trạng thái chuẩn bị
          <select
            value={fulfillment}
            onChange={(event) => {
              const next = event.target.value as SellerOrderFulfillmentFilter;
              setFulfillment(next);
              setPage(null);
              router.replace(`/seller/orders?status=${status}&fulfillment=${next}`);
            }}
          >
            <option value="ALL">Tất cả</option>
            {Object.entries(fulfillmentLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <p className="seller-orders-state">Đang tải đơn hàng…</p>
      ) : error ? (
        <ErrorState error={error} retry={() => void load()} />
      ) : !page?.items.length ? (
        <p className="seller-orders-state">Chưa có đơn hàng phù hợp.</p>
      ) : (
        <>
          <div className="seller-orders-list">
            {page.items.map((item) => (
              <OrderCard key={item.orderReference} item={item} />
            ))}
          </div>
          {page.page.nextCursor ? (
            <button
              className="seller-orders-more"
              type="button"
              onClick={() => void load(page.page.nextCursor!, true)}
            >
              Tải thêm
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function ActionDialog({
  action,
  available,
  pending,
  onCancel,
  onSubmit,
}: {
  action: SellerOrderAction;
  available: SellerOrderAvailableAction;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: SellerOrderActionRequest) => void;
}) {
  const [reasonCode, setReasonCode] = useState<SellerOrderRejectionReason>(
    available.reasonCodes[0] ?? 'OTHER',
  );
  const [reasonNote, setReasonNote] = useState('');
  const reject = action === 'REJECT';
  return (
    <div className="seller-order-dialog-backdrop" role="presentation">
      <div
        className="seller-order-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seller-order-dialog-title"
      >
        <h2 id="seller-order-dialog-title">{actionLabels[action]}</h2>
        <p>
          {reject
            ? 'Đơn sẽ bị hủy và tồn kho đã tiêu thụ sẽ được hoàn trả một lần.'
            : 'Xác nhận thao tác này cho đơn hàng?'}
        </p>
        {reject ? (
          <>
            <label>
              Lý do
              <select
                value={reasonCode}
                onChange={(event) =>
                  setReasonCode(event.target.value as SellerOrderRejectionReason)
                }
              >
                {available.reasonCodes.map((code) => (
                  <option key={code} value={code}>
                    {reasonLabels[code]}
                  </option>
                ))}
              </select>
            </label>
            {reasonCode === 'OTHER' ? (
              <label>
                Mô tả lý do
                <textarea
                  autoFocus
                  value={reasonNote}
                  onChange={(event) => setReasonNote(event.target.value)}
                  maxLength={500}
                  required
                />
              </label>
            ) : null}
          </>
        ) : null}
        <div className="seller-order-dialog__actions">
          <button type="button" onClick={onCancel} disabled={pending}>
            Hủy
          </button>
          <button
            type="button"
            className={
              reject ? 'seller-order-button seller-order-button--danger' : 'seller-order-button'
            }
          disabled={pending || (reject && reasonCode === 'OTHER' && !reasonNote.trim())}
            onClick={() =>
              onSubmit({
                action,
                ...(reject
                  ? { reasonCode, ...(reasonNote.trim() ? { reasonNote: reasonNote.trim() } : {}) }
                  : {}),
              })
            }
          >
            {pending ? 'Đang xử lý…' : 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SellerOrderDetailScreen({
  orderReference,
  printOnly = false,
}: {
  orderReference: string;
  printOnly?: boolean;
}) {
  const { state, authenticatedFetch } = useAuthSession();
  const [result, setResult] = useState<{ data: SellerOrderDetailResponse; etag: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SellerOrderAvailableAction | null>(null);
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    if (state.status !== 'authenticated') return;
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchSellerOrder(authenticatedFetch, orderReference));
    } catch (cause) {
      setError(
        cause instanceof RoleApiError
          ? (cause.problem?.detail ??
              (cause.status === 404 ? 'Đơn hàng không tồn tại.' : 'Không thể tải đơn hàng.'))
          : 'Không thể tải đơn hàng.',
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, orderReference, state.status]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const submit = async (input: SellerOrderActionRequest) => {
    if (!result) return;
    setPending(true);
    try {
      setResult(
        await executeSellerOrderAction(authenticatedFetch, orderReference, result.etag, input),
      );
      setSelected(null);
    } catch (cause) {
      setError(
        cause instanceof RoleApiError
          ? (cause.problem?.detail ??
              (cause.status === 409
                ? 'Đơn đã thay đổi, dữ liệu đã được làm mới.'
                : 'Không thể thực hiện thao tác.'))
          : 'Không thể thực hiện thao tác.',
      );
      if (cause instanceof RoleApiError && cause.status === 409) void load();
    } finally {
      setPending(false);
    }
  };
  if (state.status !== 'authenticated')
    return (
      <section className="seller-orders-state">
        <p>Vui lòng đăng nhập tài khoản seller.</p>
      </section>
    );
  if (loading) return <section className="seller-orders-state">Đang tải chi tiết đơn…</section>;
  if (error || !result)
    return (
      <section className="seller-orders-state">
        <ErrorState error={error ?? 'Không thể tải đơn hàng.'} retry={() => void load()} />
      </section>
    );
  const { order } = result.data;
  const actions = order.summary.availableActions;
  return (
    <section className={`seller-order-detail ${printOnly ? 'seller-order-detail--print' : ''}`}>
      <header className="seller-order-detail__heading">
        <div>
          <Link className="seller-orders-back" href="/seller/orders">
            ← Đơn hàng
          </Link>
          <p className="seller-orders-eyebrow">ĐƠN HÀNG SHOP</p>
          <h1>#{order.summary.orderReference.slice(0, 8).toUpperCase()}</h1>
          <p>
            {statusLabels[order.summary.status]} ·{' '}
            {fulfillmentLabels[order.summary.fulfillmentState]}
          </p>
        </div>
        {!printOnly ? (
          <div className="seller-order-detail__tools">
            <Link href={`/seller/orders/${orderReference}/print`}>In phiếu</Link>
            <button type="button" onClick={() => window.print()}>
              In
            </button>
          </div>
        ) : null}
      </header>
      {error ? (
        <div className="seller-orders-inline-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Đóng
          </button>
        </div>
      ) : null}
      <div className="seller-order-progress">
        {['PENDING_CONFIRMATION', 'READY_FOR_PICKUP', 'HANDED_OFF'].map(
          (stateName) => (
            <span
              className={
                order.summary.fulfillmentState === stateName
                  ? 'is-current'
                  : order.fulfillmentTimeline.some((event) => event.state === stateName)
                    ? 'is-done'
                    : ''
              }
              key={stateName}
            >
              {fulfillmentLabels[stateName]}
            </span>
          ),
        )}
      </div>
      <div className="seller-order-detail__grid">
        <div className="seller-order-detail__main">
          <section className="seller-order-panel">
            <h2>Sản phẩm</h2>
            {order.summary.lines.map((line) => (
              <div className="seller-order-detail-line" key={line.lineId}>
                {line.productImageUrl ? (
                  <img src={marketplaceMediaUrl(line.productImageUrl)} alt="" />
                ) : (
                  <span className="seller-order-line__fallback">Ảnh</span>
                )}
                <div>
                  <strong>{line.productName}</strong>
                  <span>
                    {line.variantName} · SKU {line.variantSku}
                  </span>
                  <span>
                    x{line.quantity} · {money(line.unitPriceMinor)}
                  </span>
                </div>
                <b>{money(line.payableLineMinor)}</b>
              </div>
            ))}
          </section>
          <section className="seller-order-panel">
            <h2>Địa chỉ giao hàng</h2>
            <p>
              <strong>{order.address.recipientName}</strong> · {order.address.phoneNumber}
            </p>
            <p>
              {order.address.addressLine}, {order.address.ward}, {order.address.district},{' '}
              {order.address.province}
            </p>
              <p>
                Dịch vụ: {order.shipping.service} · {order.shipping.provider}
              </p>
            {order.buyerNote ? <p>Ghi chú: {order.buyerNote}</p> : null}
          </section>
          <section className="seller-order-panel">
            <h2>Lịch sử xử lý</h2>
            <ol className="seller-order-timeline">
              {order.fulfillmentTimeline.map((event) => (
                <li key={event.id}>
                  <strong>{fulfillmentLabels[event.state]}</strong>
                  <span>
                    {new Date(event.occurredAt).toLocaleString('vi-VN')} ·{' '}
                    {event.actorType === 'SELLER' ? 'Shop' : event.actorType}
                  </span>
                  {event.late ? <em>Thao tác muộn</em> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="seller-order-detail__aside">
          <section className="seller-order-panel">
            <h2>Tổng thanh toán</h2>
            <dl>
              <dt>Tiền hàng</dt>
              <dd>{money(order.merchandiseSubtotalMinor)}</dd>
              <dt>Phí vận chuyển</dt>
              <dd>{money(order.shippingPayableMinor)}</dd>
              <dt>Giảm giá</dt>
              <dd>-{money(order.voucherDiscountMinor)}</dd>
              <dt className="seller-order-total">
                <b>Tổng cộng</b>
                <b>{money(order.payableTotalMinor)}</b>
              </dt>
            </dl>
          </section>
          <section className="seller-order-panel">
            <h2>Hạn xử lý</h2>
            <p>
              {order.summary.deadline.confirmationOverdue ||
              order.summary.deadline.handoffOverdue ? (
                <strong className="seller-order-overdue">Đã quá hạn</strong>
              ) : (
                'Trong hạn'
              )}
            </p>
            <p>
              Xác nhận: {new Date(order.summary.deadline.confirmationAt).toLocaleString('vi-VN')}
            </p>
          </section>
          {order.shipment ? (
            <section className="seller-order-panel">
              <h2>Vận chuyển</h2>
              <p>
                Mã vận đơn: <strong>{order.shipment.trackingCode}</strong>
              </p>
              <p>Trạng thái: {order.shipment.status === 'OUT_FOR_DELIVERY' ? 'Đang giao' : order.shipment.status === 'DELIVERED' ? 'Đã giao' : 'Chờ lấy hàng'}</p>
            </section>
          ) : null}
          {!printOnly && actions.length ? (
            <section className="seller-order-panel seller-order-actions">
              <h2>Thao tác</h2>
              {actions.map((available) => (
                <button
                  type="button"
                  key={available.action}
                  className={
                    available.action === 'REJECT'
                      ? 'seller-order-button seller-order-button--danger'
                      : 'seller-order-button'
                  }
                  onClick={() => setSelected(available)}
                >
                  {actionLabels[available.action]}
                </button>
              ))}
            </section>
          ) : null}
        </aside>
      </div>
      {selected ? (
        <ActionDialog
          action={selected.action}
          available={selected}
          pending={pending}
          onCancel={() => setSelected(null)}
          onSubmit={(input) => void submit(input)}
        />
      ) : null}
    </section>
  );
}
