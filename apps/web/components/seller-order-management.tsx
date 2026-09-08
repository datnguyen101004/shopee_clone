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
import { formatSellerOrderVersionEtag } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from '@shopee-clone/ui';
import {
  executeSellerOrderAction,
  fetchSellerOrder,
  fetchSellerOrders,
} from '../lib/seller-orders-api';
import { RoleApiError } from '../lib/role-api';
import { marketplaceMediaUrl } from '../lib/marketplace-media-url';
import { useAuthSession } from './auth-session-provider';
import { SellerPagination } from './seller/seller-pagination';

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
type OrderSort = 'newest' | 'oldest' | 'highest-price' | 'lowest-price';
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
  REJECT: 'Hủy đơn',
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
function OrderProductCell({ item }: { item: SellerOrderSummary }) {
  const firstLine = item.lines[0];
  return (
    <span className="seller-order-table-product">
      {firstLine?.productImageUrl ? (
        <img
          src={marketplaceMediaUrl(firstLine.productImageUrl)}
          alt=""
          className="seller-order-table-product__image"
        />
      ) : (
        <span className="seller-order-table-product__fallback">Ảnh</span>
      )}
      <span className="seller-order-table-product__copy">
        <strong>{firstLine?.productName ?? `${item.lineCount} sản phẩm`}</strong>
        <small>
          {firstLine ? `${firstLine.variantName} · ${firstLine.variantSku}` : 'Nhiều sản phẩm'}
          {item.lineCount > 1 ? ` · +${item.lineCount - 1} sản phẩm` : ''}
        </small>
      </span>
    </span>
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
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<OrderSort>('newest');
  const [selected, setSelected] = useState<{
    order: SellerOrderSummary;
    available: SellerOrderAvailableAction;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const load = useCallback(
    async (targetPage = 1) => {
      if (state.status !== 'authenticated') return;
      setLoading(true);
      setError(null);
      try {
        const next = await fetchSellerOrders(authenticatedFetch, { status, fulfillment, page: targetPage });
        const lastPage = Math.max(1, next.totalPages);
        if (targetPage > lastPage) { setCurrentPage(lastPage); return; }
        setPage(next);
        setCurrentPage(next.page);
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
    void load(currentPage);
  }, [currentPage, load]);

  const visibleItems = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('vi-VN');
    const filtered = (page?.items ?? []).filter((item) => {
      if (!term) return true;
      const searchable = [
        item.orderReference,
        item.purchaseReference,
        ...item.lines.flatMap((line) => [line.productName, line.variantName, line.variantSku]),
      ];
      return searchable.some((value) => value.toLocaleLowerCase('vi-VN').includes(term));
    });

    return [...filtered].sort((left, right) => {
      if (sort === 'highest-price' || sort === 'lowest-price') {
        const difference = right.payableTotalMinor - left.payableTotalMinor;
        return (
          (sort === 'highest-price' ? difference : -difference) ||
          left.orderReference.localeCompare(right.orderReference)
        );
      }
      const leftTime = Date.parse(left.createdAt);
      const rightTime = Date.parse(right.createdAt);
      return (
        (sort === 'newest' ? rightTime - leftTime : leftTime - rightTime) ||
        left.orderReference.localeCompare(right.orderReference)
      );
    });
  }, [page?.items, searchTerm, sort]);
  const changeFilter = (nextStatus: SellerOrderQueueFilter) => {
    setStatus(nextStatus);
    setPage(null);
    setCurrentPage(1);
    router.replace(`/seller/orders?status=${nextStatus}&fulfillment=${fulfillment}`);
  };

  const submitQueueAction = async (input: SellerOrderActionRequest) => {
    if (!selected) return;
    setPendingAction(true);
    setError(null);
    try {
      const result = await executeSellerOrderAction(
        authenticatedFetch,
        selected.order.orderReference,
        formatSellerOrderVersionEtag(
          selected.order.orderVersion,
          selected.order.fulfillmentVersion,
        ),
        input,
      );
      setPage((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.orderReference === selected.order.orderReference
                  ? result.data.order.summary
                  : item,
              ),
            }
          : current,
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
      if (cause instanceof RoleApiError && cause.status === 409) void load(currentPage);
    } finally {
      setPendingAction(false);
    }
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
      <div className="seller-pl-toolbar seller-pl-toolbar--labeled seller-orders-filters">
        <div className="seller-pl-toolbar__filters">
          <div className="seller-pl-search seller-orders-search">
            <Search className="seller-pl-search__icon" size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label="Tìm kiếm đơn hàng"
              placeholder="Mã đơn hoặc sản phẩm"
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); setCurrentPage(1); }}
            />
          </div>
          <div className="seller-pl-field">
            <label htmlFor="seller-orders-fulfillment">Trạng thái chuẩn bị</label>
            <div className="seller-pl-select-wrap">
              <select
                id="seller-orders-fulfillment"
                className="seller-pl-select"
                value={fulfillment}
                onChange={(event) => {
                  const next = event.target.value as SellerOrderFulfillmentFilter;
                  setFulfillment(next);
                  setPage(null);
                  setCurrentPage(1);
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
              <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="seller-pl-field seller-orders-sort">
            <label htmlFor="seller-orders-sort">Sắp xếp</label>
            <div className="seller-pl-select-wrap">
              <select
                id="seller-orders-sort"
                className="seller-pl-select"
                value={sort}
                onChange={(event) => { setSort(event.target.value as OrderSort); setCurrentPage(1); }}
              >
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="highest-price">Giá cao đến thấp</option>
                <option value="lowest-price">Giá thấp đến cao</option>
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      {loading ? (
        <p className="seller-orders-state">Đang tải đơn hàng…</p>
      ) : error ? (
        <ErrorState error={error} retry={() => void load()} />
      ) : !page?.items.length ? (
        <p className="seller-orders-state">Chưa có đơn hàng phù hợp.</p>
      ) : (
        <>
          <div className="seller-pl-table-stack seller-orders-table-stack">
            <div className="seller-pl-table-card seller-orders-table-card">
              <div className="seller-pl-table-scroll">
                <table className="seller-pl-table seller-management-table seller-orders-table">
                  <thead>
                    <tr>
                      <th className="management-table-id-cell">ID</th>
                      <th>Mã đơn</th>
                      <th>Sản phẩm</th>
                      <th>Số lượng</th>
                      <th>Tổng tiền</th>
                      <th>Trạng thái</th>
                      <th>Ngày tạo</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.length ? (
                      visibleItems.map((item) => {
                        const availableActions = item.availableActions.filter(
                          ({ action }) => action === 'CONFIRM' || action === 'REJECT',
                        );
                        return (
                          <tr className="seller-order-table-row" key={item.orderReference}>
                            <td className="management-table-id-cell">{item.orderReference}</td>
                            <td>
                              <Link
                                className="seller-order-table-reference"
                                href={`/seller/orders/${item.orderReference}`}
                              >
                                #{item.orderReference.slice(0, 8).toUpperCase()}
                              </Link>
                              <small className="seller-order-table-subtext">
                                #{item.purchaseReference.slice(0, 8).toUpperCase()}
                              </small>
                            </td>
                            <td>
                              <Link
                                className="seller-order-table-product-link"
                                href={`/seller/orders/${item.orderReference}`}
                              >
                                <OrderProductCell item={item} />
                              </Link>
                            </td>
                            <td>{item.itemQuantity}</td>
                            <td>
                              <strong>{money(item.payableTotalMinor)}</strong>
                            </td>
                            <td>
                              <span className="seller-order-badge seller-table-status" data-status={item.status}>
                                {statusLabels[item.status] ?? item.status}
                              </span>
                              <small className="seller-order-table-subtext">
                                {fulfillmentLabels[item.fulfillmentState]}
                              </small>
                            </td>
                            <td>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</td>
                            <td>
                              <div className="seller-order-row-actions">
                                {availableActions.length ? (
                                  availableActions.map((available) => (
                                    <button
                                      type="button"
                                      className={`seller-pl-btn-icon ${available.action === 'REJECT' ? 'seller-pl-btn-icon--delete' : ''}`}
                                      key={available.action}
                                      data-action={available.action}
                                      aria-label={`${actionLabels[available.action]} đơn hàng ${item.orderReference}`}
                                      title={actionLabels[available.action]}
                                      onClick={() => setSelected({ order: item, available })}
                                    >
                                      {available.action === 'CONFIRM' ? (
                                        <Check size={16} aria-hidden="true" />
                                      ) : (
                                        <X size={16} aria-hidden="true" />
                                      )}
                                    </button>
                                  ))
                                ) : (
                                  <span className="seller-order-table-subtext">—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="seller-order-table__empty" colSpan={8}>
                          Không tìm thấy đơn hàng phù hợp.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <SellerPagination itemLabel="đơn hàng" page={currentPage} pageSize={page.pageSize} totalItems={page.totalItems} totalPages={page.totalPages} disabled={loading} onPageChange={setCurrentPage} />
          </div>
          {selected ? (
            <ActionDialog
              action={selected.available.action}
              available={selected.available}
              pending={pendingAction}
              onCancel={() => setSelected(null)}
              onSubmit={(input) => void submitQueueAction(input)}
            />
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
            <div className="seller-pl-field">
              <label htmlFor="seller-order-rejection-reason">Lý do</label>
              <div className="seller-pl-select-wrap">
                <select
                  id="seller-order-rejection-reason"
                  className="seller-pl-select"
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
                <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
              </div>
            </div>
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
        {['PENDING_CONFIRMATION', 'READY_FOR_PICKUP', 'HANDED_OFF'].map((stateName) => (
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
        ))}
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
                  <span className="font-medium">{line.productName}</span>
                  <span>
                    {line.variantName} · SKU {line.variantSku}
                  </span>
                  <span>
                    x{line.quantity} · {money(line.unitPriceMinor)}
                  </span>
                </div>
                <span className="font-medium">{money(line.payableLineMinor)}</span>
              </div>
            ))}
          </section>
          <section className="seller-order-panel">
            <h2>Địa chỉ giao hàng</h2>
            <p>
              <span className="font-medium">{order.address.recipientName}</span> ·{' '}
              {order.address.phoneNumber}
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
                  <span className="font-medium">{fulfillmentLabels[event.state]}</span>
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
                <span className="font-semibold">Tổng cộng</span>
                <span className="font-semibold">{money(order.payableTotalMinor)}</span>
              </dt>
            </dl>
          </section>
          <section className="seller-order-panel">
            <h2>Hạn xử lý</h2>
            <p>
              {order.summary.deadline.confirmationOverdue ||
              order.summary.deadline.handoffOverdue ? (
                <span className="seller-order-overdue font-medium">Đã quá hạn</span>
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
                Mã vận đơn: <span className="font-medium">{order.shipment.trackingCode}</span>
              </p>
              <p>
                Trạng thái:{' '}
                {order.shipment.status === 'OUT_FOR_DELIVERY'
                  ? 'Đang giao'
                  : order.shipment.status === 'DELIVERED'
                    ? 'Đã giao'
                    : 'Chờ lấy hàng'}
              </p>
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
