'use client';

import {
  ADMIN_RETURN_DECISIONS,
  RETURN_DEADLINE_FILTERS,
  RETURN_STATUSES,
  SELLER_RETURN_ACTIONS,
  type AdminReturnDecision,
  type AdminReturnDetailResponse,
  type ReturnDetailResponse,
  type ReturnListQuery,
  type ReturnListResponse,
  type ReturnStatus,
  type SellerReturnAction,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Eye } from '@shopee-clone/ui';

import { AdminEntityLink } from '../admin/admin-entity-link';

import {
  decideAdminReturn,
  executeBuyerReturnAction,
  executeSellerReturnAction,
  fetchAdminReturn,
  fetchAdminReturns,
  fetchBuyerReturn,
  fetchBuyerReturns,
  fetchSellerReturn,
  fetchSellerReturns,
  ReturnApiError,
  type ReturnDetailResult,
} from '../../lib/returns-api';
import { useAuthSession } from '../auth-session-provider';
import {
  AccountLoadFailure,
  AccountWorkspace,
  ProtectedAccountState,
} from '../protected-account-state';

type ReturnRole = 'buyer' | 'seller' | 'admin';
type AnyDetailResponse = ReturnDetailResponse | AdminReturnDetailResponse;

const statusLabels: Record<ReturnStatus, string> = {
  REQUESTED: 'Đang chờ người bán phản hồi',
  AWAITING_RETURN: 'Chờ gửi hàng trả',
  IN_TRANSIT: 'Đang gửi hàng trả',
  ESCALATED: 'Cần quản trị viên xử lý',
  CANCELLED: 'Đã hủy yêu cầu',
  EXPIRED: 'Yêu cầu đã hết hạn',
  REJECTED: 'Yêu cầu bị từ chối',
  REFUNDED: 'Đã hoàn tiền',
};
const actionLabels: Record<string, string> = {
  CANCEL: 'Hủy yêu cầu',
  SUBMIT_SHIPMENT: 'Xác nhận đã gửi hàng',
  ACCEPT_RETURN: 'Chấp nhận trả hàng',
  REJECT_AND_ESCALATE: 'Từ chối và chuyển tranh chấp',
  ESCALATE: 'Chuyển quản trị viên',
  CONFIRM_RECEIPT: 'Xác nhận đã nhận hàng',
  APPROVE_RETURN: 'Chấp thuận trả hàng',
  APPROVE_REFUND: 'Duyệt hoàn tiền',
  REJECT: 'Từ chối yêu cầu',
};
const deadlineLabels = { ALL: 'Tất cả hạn', OVERDUE: 'Quá hạn', DUE_SOON: 'Sắp đến hạn' } as const;
const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';
const apiBase = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

function rolePath(role: ReturnRole, reference?: string) {
  const prefix = role === 'buyer' ? '/account/returns' : `/${role}/returns`;
  return reference ? `${prefix}/${reference}` : prefix;
}

function hasRole(role: ReturnRole, roles: string[]) {
  return role === 'buyer' || roles.includes(role);
}

function roleTitle(role: ReturnRole) {
  return role === 'buyer'
    ? 'Trả hàng / Hoàn tiền'
    : role === 'seller'
      ? 'Yêu cầu trả hàng'
      : 'Tranh chấp trả hàng';
}

function returnInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}` : name.slice(0, 2)
  ).toUpperCase();
}

function ReturnMedia({ src, name }: { src: string | null | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="admin-return-media" aria-hidden="true">
      {src && !failed ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>{returnInitials(name)}</span>
      )}
    </span>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof ReturnApiError) {
    if (error.status === 403) return 'Bạn không có quyền truy cập nội dung này.';
    if (error.status === 404) return 'Không tìm thấy yêu cầu trả hàng.';
    return error.problem?.detail ?? 'Không thể tải dữ liệu trả hàng.';
  }
  return 'Không thể tải dữ liệu trả hàng.';
}

function QueueShell({ role, children }: { role: ReturnRole; children: ReactNode }) {
  const body = (
    <section
      className={`return-workflow ${role === 'admin' ? 'admin-page admin-returns-page' : ''}`}
    >
      {children}
    </section>
  );
  if (role !== 'buyer') return body;
  return (
    <AccountWorkspace
      title="Trả hàng / Hoàn tiền"
      description="Theo dõi, gửi hàng trả và nhận kết quả hoàn tiền."
    >
      {body}
    </AccountWorkspace>
  );
}

function ReturnQueue({ role }: { role: ReturnRole }) {
  const auth = useAuthSession();
  const sellerVariant = role === 'seller';
  const [page, setPage] = useState<ReturnListResponse | null>(null);
  const [status, setStatus] = useState<ReturnStatus | 'ALL'>('ALL');
  const [deadline, setDeadline] = useState<'ALL' | 'OVERDUE' | 'DUE_SOON'>('ALL');
  const [reference, setReference] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accessible = auth.state.status === 'authenticated' && hasRole(role, auth.state.user.roles);
  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (!accessible) return;
      setLoading(true);
      setError(null);
      const query: Partial<ReturnListQuery> = {
        status,
        deadline,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(cursor ? { cursor } : {}),
      };
      try {
        const response =
          role === 'buyer'
            ? await fetchBuyerReturns(auth.authenticatedFetch, query)
            : role === 'seller'
              ? await fetchSellerReturns(auth.authenticatedFetch, query)
              : await fetchAdminReturns(auth.authenticatedFetch, query);
        setPage((current) =>
          append && current
            ? { ...response, items: [...current.items, ...response.items] }
            : response,
        );
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setLoading(false);
      }
    },
    [accessible, auth.authenticatedFetch, deadline, from, reference, role, status, to],
  );

  useEffect(() => {
    if (!accessible) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [accessible, load]);

  const queueStateClassName =
    role === 'admin' ? 'return-workflow__state admin-returns-state' : 'return-workflow__state';
  const content = (
    <>
      {role === 'seller' ? (
        <header className="return-workflow__heading">
          <div>
            <p>{role === 'seller' ? 'SELLER CENTER' : 'ADMIN CONSOLE'}</p>
            <h1>{roleTitle(role)}</h1>
            <span>Thông tin hiển thị theo trạng thái xác thực mới nhất từ hệ thống.</span>
          </div>
        </header>
      ) : null}
      {auth.state.status === 'loading' ? (
        <p className={queueStateClassName} aria-busy="true">
          Đang kiểm tra phiên đăng nhập…
        </p>
      ) : null}
      {auth.state.status === 'guest' ? (
        <p className={queueStateClassName}>Vui lòng đăng nhập để xem yêu cầu trả hàng.</p>
      ) : null}
      {auth.state.status === 'authenticated' && !accessible ? (
        <p className={queueStateClassName}>Bạn không có quyền truy cập khu vực này.</p>
      ) : null}
      {accessible ? (
        <>
          <div
            className={`${role === 'admin' ? 'admin-returns-toolbar ' : ''}return-workflow__filters${sellerVariant ? ' seller-pl-toolbar seller-pl-toolbar--labeled' : ''}`}
          >
            <div
              className={
                sellerVariant
                  ? 'seller-pl-toolbar__filters'
                  : role === 'admin'
                    ? 'admin-returns-toolbar__filters'
                    : 'return-workflow__filter-fields'
              }
            >
              <div
                className={
                  sellerVariant
                    ? 'seller-pl-field'
                    : role === 'admin'
                      ? 'admin-field admin-returns-toolbar__field'
                      : 'return-workflow__field'
                }
              >
                <label htmlFor="return-status-filter">Trạng thái</label>
                <div
                  className={
                    sellerVariant
                      ? 'seller-pl-select-wrap'
                      : role === 'admin'
                        ? 'admin-select-wrap'
                        : 'return-workflow__select-wrap'
                  }
                >
                  <select
                    id="return-status-filter"
                    className={
                      sellerVariant
                        ? 'seller-pl-select'
                        : role === 'admin'
                          ? 'admin-control'
                          : undefined
                    }
                    value={status}
                    onChange={(event) => setStatus(event.target.value as ReturnStatus | 'ALL')}
                  >
                    <option value="ALL">Tất cả</option>
                    {RETURN_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {statusLabels[value]}
                      </option>
                    ))}
                  </select>
                  {sellerVariant ? (
                    <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
                  ) : null}
                </div>
              </div>
              <div
                className={
                  sellerVariant
                    ? 'seller-pl-field'
                    : role === 'admin'
                      ? 'admin-field admin-returns-toolbar__field'
                      : 'return-workflow__field'
                }
              >
                <label htmlFor="return-deadline-filter">Thời hạn</label>
                <div
                  className={
                    sellerVariant
                      ? 'seller-pl-select-wrap'
                      : role === 'admin'
                        ? 'admin-select-wrap'
                        : 'return-workflow__select-wrap'
                  }
                >
                  <select
                    id="return-deadline-filter"
                    className={
                      sellerVariant
                        ? 'seller-pl-select'
                        : role === 'admin'
                          ? 'admin-control'
                          : undefined
                    }
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value as typeof deadline)}
                  >
                    {RETURN_DEADLINE_FILTERS.map((value) => (
                      <option key={value} value={value}>
                        {value === 'ALL' ? 'Tất cả' : deadlineLabels[value]}
                      </option>
                    ))}
                  </select>
                  {sellerVariant ? (
                    <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
                  ) : null}
                </div>
              </div>
              <div
                className={
                  sellerVariant
                    ? 'seller-pl-field'
                    : role === 'admin'
                      ? 'admin-field admin-returns-toolbar__field admin-returns-toolbar__field--reference'
                      : 'return-workflow__field'
                }
              >
                <label htmlFor="return-reference-filter">Mã yêu cầu hoặc đơn</label>
                <input
                  id="return-reference-filter"
                  className={role === 'admin' ? 'admin-control' : undefined}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Nhập mã yêu cầu hoặc đơn"
                />
              </div>
              {role === 'admin' ? (
                <>
                  <div className="admin-field admin-returns-toolbar__field">
                    <label htmlFor="return-from-filter">Từ ngày</label>
                    <input
                      id="return-from-filter"
                      className="admin-control"
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                    />
                  </div>
                  <div className="admin-field admin-returns-toolbar__field">
                    <label htmlFor="return-to-filter">Đến ngày</label>
                    <input
                      id="return-to-filter"
                      className="admin-control"
                      type="date"
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                    />
                  </div>
                </>
              ) : null}
              <button
                className={role === 'admin' ? 'admin-btn admin-btn-primary' : undefined}
                type="button"
                disabled={loading}
                onClick={() => void load()}
              >
                Lọc
              </button>
            </div>
          </div>
          {loading && !page ? (
            <p className={queueStateClassName} aria-busy="true">
              Đang tải yêu cầu…
            </p>
          ) : null}
          {error && !page ? <AccountLoadFailure onRetry={() => void load()} /> : null}
          {error && page ? (
            <p role="alert" className="return-workflow__error">
              {error}
            </p>
          ) : null}
          {!loading && !error && page?.items.length === 0 ? (
            <p className={queueStateClassName}>Chưa có yêu cầu phù hợp.</p>
          ) : null}
          {page?.items.length ? (
            <div
              className={`seller-pl-table-stack return-workflow-table-stack${role === 'admin' ? ' admin-returns-table-stack' : ''}`}
            >
              {role === 'admin' ? (
                <>
                  <div className="admin-table-card__header admin-returns-list-header">
                    <div>
                      <h2>Yêu cầu trả hàng / hoàn tiền</h2>
                      <p>Danh sách yêu cầu cần theo dõi và xử lý trong trung tâm quản trị.</p>
                    </div>
                    <span className="admin-table-card__count">{page.items.length} yêu cầu</span>
                  </div>
                  <div className="admin-returns-columns" role="row">
                    <span role="columnheader">Yêu cầu</span>
                    <span role="columnheader">Hoàn tiền</span>
                    <span role="columnheader">Cập nhật</span>
                    <span role="columnheader">Hạn xử lý</span>
                    <span role="columnheader">Hành động</span>
                  </div>
                </>
              ) : null}
              <div
                className={`return-workflow__list${role === 'admin' ? ' admin-returns-list-card' : ''}`}
              >
                {page.items.map((item) =>
                  role === 'admin' ? (
                    <div className="return-card admin-return-row" key={item.returnReference}>
                      <Link
                        className="admin-return-row__request"
                        href={rolePath(role, item.returnReference)}
                      >
                        <ReturnMedia
                          src={item.preview?.productImageUrl}
                          name={item.preview?.productName ?? 'Yêu cầu trả hàng'}
                        />
                        <span className="admin-return-row__copy">
                          <strong>{item.preview?.productName ?? 'Yêu cầu trả hàng'}</strong>
                          <small>{item.preview?.shopName ?? 'Yêu cầu trả hàng'}</small>
                          <span className="admin-status-pill">{statusLabels[item.status]}</span>
                        </span>
                      </Link>
                      <div className="admin-return-row__amount">
                        <strong>{money(item.refundAmountMinor)}</strong>
                        <small>Hoàn tiền</small>
                      </div>
                      <div className="admin-return-row__updated">
                        <strong>{dateTime(item.updatedAt)}</strong>
                        <small>Cập nhật</small>
                      </div>
                      <div className="admin-return-row__deadline">
                        <strong>
                          {dateTime(
                            item.deadline.sellerResponseAt ??
                              item.deadline.shipmentAt ??
                              item.deadline.receiptAt,
                          )}
                        </strong>
                        <small>Hạn xử lý</small>
                      </div>
                      <div className="admin-return-row__actions" aria-label="Hành động">
                        <Link
                          className="admin-icon-btn admin-icon-btn--secondary"
                          href={`${rolePath(role, item.returnReference)}#admin-return-actions`}
                          aria-label={`Xử lý yêu cầu ${item.preview?.productName ?? item.returnReference}`}
                          title="Xử lý yêu cầu"
                        >
                          <Check size={16} aria-hidden="true" />
                        </Link>
                        <Link
                          className="admin-icon-btn admin-icon-btn--secondary"
                          href={rolePath(role, item.returnReference)}
                          aria-label={`Xem chi tiết yêu cầu ${item.preview?.productName ?? item.returnReference}`}
                          title="Xem chi tiết"
                        >
                          <Eye size={16} aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <Link
                      className="return-card"
                      href={rolePath(role, item.returnReference)}
                      key={item.returnReference}
                    >
                      <div>
                        <span className="font-medium">
                          {item.preview?.productName ?? 'Yêu cầu trả hàng'}
                        </span>
                        <small>{statusLabels[item.status]}</small>
                      </div>
                      <div>
                        <span>{money(item.refundAmountMinor)}</span>
                        <small>Cập nhật {dateTime(item.updatedAt)}</small>
                      </div>
                      <small>
                        Hạn xử lý:{' '}
                        {dateTime(
                          item.deadline.sellerResponseAt ??
                            item.deadline.shipmentAt ??
                            item.deadline.receiptAt,
                        )}
                      </small>
                    </Link>
                  ),
                )}
              </div>
              <footer className="seller-pl-footer return-workflow-footer">
                <div className="seller-pl-footer__summary">
                  Hiển thị <strong>{page.items.length}</strong> yêu cầu đã tải
                </div>
                {page.page.nextCursor ? (
                  <button
                    className="seller-pl-btn-loadmore"
                    type="button"
                    disabled={loading}
                    onClick={() => void load(page.page.nextCursor!, true)}
                  >
                    {loading ? 'Đang tải…' : 'Xem thêm'}
                  </button>
                ) : (
                  <span className="seller-pl-footer__complete">Đã tải hết danh sách yêu cầu</span>
                )}
              </footer>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
  return (
    <QueueShell role={role}>
      {role === 'buyer' ? (
        <ProtectedAccountState account={auth.state} returnTo="/account/returns">
          {content}
        </ProtectedAccountState>
      ) : (
        content
      )}
    </QueueShell>
  );
}

function PrivateEvidence({ url, index }: { url: string; index: number }) {
  const auth = useAuthSession();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let createdUrl: string | null = null;
    auth
      .authenticatedFetch(new URL(url, apiBase()), { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('evidence');
        createdUrl = URL.createObjectURL(await response.blob());
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [auth.authenticatedFetch, url]);
  if (failed)
    return <p className="return-evidence__failed">Không thể tải ảnh bằng chứng {index + 1}.</p>;
  return objectUrl ? (
    <img src={objectUrl} alt={`Bằng chứng trả hàng ${index + 1}`} />
  ) : (
    <span aria-busy="true">Đang tải ảnh bằng chứng…</span>
  );
}

function ReturnDetailBody({
  role,
  result,
  onMutate,
  onRefresh,
}: {
  role: ReturnRole;
  result: ReturnDetailResult<AnyDetailResponse>;
  onMutate: (result: ReturnDetailResult<AnyDetailResponse>) => void;
  onRefresh: () => Promise<void>;
}) {
  const auth = useAuthSession();
  const detail = result.data.return;
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sellerAction, setSellerAction] = useState<SellerReturnAction | ''>('');
  const [adminDecision, setAdminDecision] = useState<AdminReturnDecision | ''>('');
  const [publicReason, setPublicReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const keys = useRef(new Map<string, string>());

  const mutate = async (action: string) => {
    if (pending) return;
    const selected = detail.availableActions.find((item) => item.action === action);
    if (selected?.requiresPublicReason && publicReason.trim().length < 8) {
      setNotice('Vui lòng nhập lý do công khai (ít nhất 8 ký tự).');
      return;
    }
    if (role === 'admin' && !confirmed) {
      setNotice('Hãy xác nhận trước khi ra quyết định.');
      return;
    }
    setPending(true);
    setNotice(null);
    const key = keys.current.get(action) ?? crypto.randomUUID();
    keys.current.set(action, key);
    try {
      const next =
        role === 'buyer'
          ? await executeBuyerReturnAction(
              auth.authenticatedFetch,
              detail.returnReference,
              result.etag,
              { action: action as 'CANCEL' | 'SUBMIT_SHIPMENT' },
              key,
            )
          : role === 'seller'
            ? await executeSellerReturnAction(
                auth.authenticatedFetch,
                detail.returnReference,
                result.etag,
                {
                  action: action as SellerReturnAction,
                  ...(selected?.requiresPublicReason && publicReason.trim()
                    ? { publicReason: publicReason.trim() }
                    : {}),
                },
                key,
              )
            : await decideAdminReturn(
                auth.authenticatedFetch,
                detail.returnReference,
                result.etag,
                {
                  decision: action as AdminReturnDecision,
                  publicReason: publicReason.trim(),
                  ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
                },
                key,
              );
      onMutate(next);
      setPublicReason('');
      setInternalNote('');
      setConfirmed(false);
      keys.current.delete(action);
      setNotice('Trạng thái đã được cập nhật.');
    } catch (error) {
      if (error instanceof ReturnApiError && error.status === 409) {
        keys.current.delete(action);
        void onRefresh();
        setNotice('Trạng thái đã thay đổi. Hệ thống đang tải lại dữ liệu chính xác.');
      } else setNotice(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const sellerChoices = detail.availableActions.filter((item) =>
    SELLER_RETURN_ACTIONS.includes(item.action as SellerReturnAction),
  );
  const adminChoices = detail.availableActions.filter((item) =>
    ADMIN_RETURN_DECISIONS.includes(item.action as AdminReturnDecision),
  );
  const adminSectionClassName = role === 'admin' ? 'admin-return-detail__section' : undefined;
  return (
    <article className={`return-detail ${role === 'admin' ? 'admin-return-detail' : ''}`}>
      {notice ? (
        <p className="return-workflow__notice" role="status">
          {notice}
        </p>
      ) : null}
      {role === 'admin' ? (
        <header className="admin-return-detail__intro">
          <div>
            <p>ADMIN CONSOLE</p>
            <h2>Chi tiết trả hàng / hoàn tiền</h2>
            <span>Kiểm tra thông tin yêu cầu và đưa ra quyết định xử lý.</span>
          </div>
        </header>
      ) : null}
      <header className="return-detail__heading admin-return-detail__heading">
        {role === 'admin' && 'buyer' in detail ? (
          <div className="admin-detail-linked-entities">
            <AdminEntityLink
              href={`/admin/shops/${detail.shop.id}`}
              name={detail.shop.name}
              meta="Shop"
            />
            <AdminEntityLink
              href={`/admin/users/${detail.buyer.id}`}
              name={detail.buyer.displayName}
              meta="Người mua"
            />
          </div>
        ) : (
          <div>
            <span className="font-medium">Yêu cầu trả hàng</span>
          </div>
        )}
        <span>{statusLabels[detail.status]}</span>
      </header>
      <section className={adminSectionClassName}>
        <h2>Yêu cầu hoàn tiền</h2>
        <p>{detail.description}</p>
        <strong>{money(detail.refundAmountMinor)}</strong>
      </section>
      <section className={adminSectionClassName}>
        <h2>Sản phẩm</h2>
        {detail.lines.map((line) => (
          <div className="return-detail__line" key={line.lineReference}>
            {role === 'admin' ? (
              <ReturnMedia src={line.productImageUrl} name={line.productName} />
            ) : (
              <span>{line.productImageUrl ? <img src={line.productImageUrl} alt="" /> : null}</span>
            )}
            <div>
              <span className="font-medium">{line.productName}</span>
              <small>
                {line.variantName} · {line.requestedQuantity}/{line.purchasedQuantity}
              </small>
            </div>
            <span className="font-medium">{money(line.refundMinor)}</span>
          </div>
        ))}
      </section>
      <section className={adminSectionClassName}>
        <h2>Bằng chứng riêng tư</h2>
        <div className="return-evidence">
          {detail.evidence.map((item, index) => (
            <PrivateEvidence key={item.evidenceId} url={item.url} index={index} />
          ))}
        </div>
      </section>
      <section className={adminSectionClassName}>
        <h2>Thời hạn và vận chuyển</h2>
        <dl className="return-detail__facts">
          <div>
            <dt>Người bán phản hồi</dt>
            <dd>{dateTime(detail.deadline.sellerResponseAt)}</dd>
          </div>
          <div>
            <dt>Gửi hàng trả</dt>
            <dd>{dateTime(detail.deadline.shipmentAt)}</dd>
          </div>
          <div>
            <dt>Xác nhận nhận hàng</dt>
            <dd>{dateTime(detail.deadline.receiptAt)}</dd>
          </div>
        </dl>
        {detail.shipment ? (
          <p>
            Mã vận đơn thử nghiệm:{' '}
            <span className="font-medium">{detail.shipment.trackingCode}</span>
            <br />
            Đến: {detail.shipment.destination.shopName}, {detail.shipment.destination.address}
          </p>
        ) : null}
        {detail.refund ? (
          <p>
            Đã hoàn {money(detail.refund.amountMinor)} vào {dateTime(detail.refund.finalizedAt)}.
          </p>
        ) : null}
      </section>
      {detail.sellerPublicReason ? (
        <section className={adminSectionClassName}>
          <h2>Phản hồi của người bán</h2>
          <p>{detail.sellerPublicReason}</p>
        </section>
      ) : null}
      {'buyer' in detail ? (
        <section className={adminSectionClassName}>
          <h2>Ngữ cảnh tranh chấp</h2>
          <p>
            Người mua: {detail.buyer.displayName} · Shop: {detail.shop.name}
          </p>
          {detail.decisions.length ? (
            <ol className="return-timeline">
              {detail.decisions.map((decision) => (
                <li key={decision.id}>
                  <span className="font-medium">{actionLabels[decision.decision]}</span> ·{' '}
                  {decision.publicReason}
                  <small>{dateTime(decision.decidedAt)}</small>
                  {decision.internalNote ? <p>Ghi chú nội bộ: {decision.internalNote}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
      <section className={adminSectionClassName}>
        <h2>Lịch sử</h2>
        <ol className="return-timeline">
          {detail.timeline.map((event) => (
            <li key={event.id}>
              <span className="font-medium">{statusLabels[event.status]}</span>
              <small>
                {event.actorType} · {dateTime(event.occurredAt)}
              </small>
              {event.publicReason ? <p>{event.publicReason}</p> : null}
            </li>
          ))}
        </ol>
      </section>
      {role === 'buyer' && detail.availableActions.length ? (
        <section className="return-detail__actions">
          <h2>Thao tác</h2>
          {detail.availableActions.map((item) => (
            <button
              key={item.action}
              type="button"
              disabled={pending}
              onClick={() => void mutate(item.action)}
            >
              {actionLabels[item.action]}
            </button>
          ))}
        </section>
      ) : null}
      {role === 'seller' && sellerChoices.length ? (
        <section className="return-detail__actions">
          <h2>Xử lý yêu cầu</h2>
          <div className="return-detail__field return-detail__field--seller">
            <label htmlFor="seller-return-action">Thao tác xử lý</label>
            <div className="seller-pl-select-wrap">
              <select
                id="seller-return-action"
                className="seller-pl-select"
                value={sellerAction}
                disabled={pending}
                onChange={(event) => setSellerAction(event.target.value as SellerReturnAction | '')}
              >
                <option value="">Chọn thao tác</option>
                {sellerChoices.map((item) => (
                  <option key={item.action} value={item.action}>
                    {actionLabels[item.action]}
                  </option>
                ))}
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
            </div>
          </div>
          {sellerChoices.find((item) => item.action === sellerAction)?.requiresPublicReason ? (
            <textarea
              value={publicReason}
              disabled={pending}
              minLength={8}
              maxLength={500}
              placeholder="Lý do hiển thị cho người mua"
              onChange={(event) => setPublicReason(event.target.value)}
            />
          ) : null}
          <button
            type="button"
            disabled={pending || !sellerAction}
            onClick={() => sellerAction && void mutate(sellerAction)}
          >
            {pending ? 'Đang xử lý…' : 'Xác nhận'}
          </button>
        </section>
      ) : null}
      {role === 'admin' && adminChoices.length ? (
        <section
          id="admin-return-actions"
          className="return-detail__actions admin-return-detail__actions"
        >
          <h2>Quyết định tranh chấp</h2>
          <div className="return-detail__field">
            <label htmlFor="admin-return-decision">Quyết định</label>
            <div className="return-detail__select-wrap">
              <select
                id="admin-return-decision"
                value={adminDecision}
                disabled={pending}
                onChange={(event) =>
                  setAdminDecision(event.target.value as AdminReturnDecision | '')
                }
              >
                <option value="">Chọn quyết định</option>
                {adminChoices.map((item) => (
                  <option key={item.action} value={item.action}>
                    {actionLabels[item.action]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <textarea
            value={publicReason}
            disabled={pending}
            minLength={8}
            maxLength={500}
            placeholder="Lý do hiển thị cho người mua và người bán"
            onChange={(event) => setPublicReason(event.target.value)}
          />
          <textarea
            value={internalNote}
            disabled={pending}
            maxLength={1000}
            placeholder="Ghi chú nội bộ (tùy chọn)"
            onChange={(event) => setInternalNote(event.target.value)}
          />
          <label className="return-detail__confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>Tôi xác nhận quyết định này.</span>
          </label>
          <button
            type="button"
            disabled={pending || !adminDecision}
            onClick={() => adminDecision && void mutate(adminDecision)}
          >
            {pending ? 'Đang xử lý…' : 'Ra quyết định'}
          </button>
        </section>
      ) : null}
    </article>
  );
}

function ReturnDetailScreen({
  role,
  returnReference,
}: {
  role: ReturnRole;
  returnReference: string;
}) {
  const auth = useAuthSession();
  const [result, setResult] = useState<ReturnDetailResult<AnyDetailResponse> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accessible = auth.state.status === 'authenticated' && hasRole(role, auth.state.user.roles);
  const load = useCallback(async () => {
    if (!accessible) return;
    setLoading(true);
    setError(null);
    try {
      const next =
        role === 'buyer'
          ? await fetchBuyerReturn(auth.authenticatedFetch, returnReference)
          : role === 'seller'
            ? await fetchSellerReturn(auth.authenticatedFetch, returnReference)
            : await fetchAdminReturn(auth.authenticatedFetch, returnReference);
      setResult(next);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [accessible, auth.authenticatedFetch, returnReference, role]);
  useEffect(() => {
    if (!accessible) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [accessible, load]);
  const content = (
    <>
      <Link className="return-workflow__back" href={rolePath(role)}>
        ← Về danh sách yêu cầu
      </Link>
      {auth.state.status === 'loading' || loading ? (
        <p className="return-workflow__state" aria-busy="true">
          Đang tải yêu cầu…
        </p>
      ) : null}
      {auth.state.status === 'guest' ? (
        <p className="return-workflow__state">Vui lòng đăng nhập để xem yêu cầu trả hàng.</p>
      ) : null}
      {auth.state.status === 'authenticated' && !accessible ? (
        <p className="return-workflow__state">Bạn không có quyền truy cập khu vực này.</p>
      ) : null}
      {error ? <AccountLoadFailure onRetry={() => void load()} /> : null}
      {result ? (
        <ReturnDetailBody
          role={role}
          result={result}
          onMutate={(next) => setResult(next)}
          onRefresh={load}
        />
      ) : null}
    </>
  );
  return (
    <QueueShell role={role}>
      {role === 'buyer' ? (
        <ProtectedAccountState
          account={auth.state}
          returnTo={`/account/returns/${returnReference}`}
        >
          {content}
        </ProtectedAccountState>
      ) : (
        content
      )}
    </QueueShell>
  );
}

export function BuyerReturnQueueScreen() {
  return <ReturnQueue role="buyer" />;
}
export function BuyerReturnDetailScreen({ returnReference }: { returnReference: string }) {
  return <ReturnDetailScreen role="buyer" returnReference={returnReference} />;
}
export function SellerReturnQueueScreen() {
  return <ReturnQueue role="seller" />;
}
export function SellerReturnDetailScreen({ returnReference }: { returnReference: string }) {
  return <ReturnDetailScreen role="seller" returnReference={returnReference} />;
}
export function AdminReturnQueueScreen() {
  return <ReturnQueue role="admin" />;
}
export function AdminReturnDetailScreen({ returnReference }: { returnReference: string }) {
  return <ReturnDetailScreen role="admin" returnReference={returnReference} />;
}
