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

function errorMessage(error: unknown) {
  if (error instanceof ReturnApiError) {
    if (error.status === 403) return 'Bạn không có quyền truy cập nội dung này.';
    if (error.status === 404) return 'Không tìm thấy yêu cầu trả hàng.';
    return error.problem?.detail ?? 'Không thể tải dữ liệu trả hàng.';
  }
  return 'Không thể tải dữ liệu trả hàng.';
}

function QueueShell({ role, children }: { role: ReturnRole; children: ReactNode }) {
  const body = <section className="return-workflow">{children}</section>;
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

  const content = (
    <>
      {role !== 'buyer' ? (
        <header className="return-workflow__heading">
          <div>
            <p>{role === 'seller' ? 'SELLER CENTER' : 'ADMIN CONSOLE'}</p>
            <h1>{roleTitle(role)}</h1>
            <span>Thông tin hiển thị theo trạng thái xác thực mới nhất từ hệ thống.</span>
          </div>
        </header>
      ) : null}
      {auth.state.status === 'loading' ? (
        <p className="return-workflow__state" aria-busy="true">
          Đang kiểm tra phiên đăng nhập…
        </p>
      ) : null}
      {auth.state.status === 'guest' ? (
        <p className="return-workflow__state">Vui lòng đăng nhập để xem yêu cầu trả hàng.</p>
      ) : null}
      {auth.state.status === 'authenticated' && !accessible ? (
        <p className="return-workflow__state">Bạn không có quyền truy cập khu vực này.</p>
      ) : null}
      {accessible ? (
        <>
          <div className="return-workflow__filters">
            <label>
              Trạng thái
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as ReturnStatus | 'ALL')}
              >
                <option value="ALL">Tất cả trạng thái</option>
                {RETURN_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Thời hạn
              <select
                value={deadline}
                onChange={(event) => setDeadline(event.target.value as typeof deadline)}
              >
                {RETURN_DEADLINE_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {deadlineLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mã yêu cầu hoặc đơn
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="UUID yêu cầu hoặc đơn"
              />
            </label>
            {role === 'admin' ? (
              <>
                <label>
                  Từ ngày
                  <input
                    type="date"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </label>
                <label>
                  Đến ngày
                  <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </label>
              </>
            ) : null}
            <button type="button" disabled={loading} onClick={() => void load()}>
              Lọc
            </button>
          </div>
          {loading && !page ? (
            <p className="return-workflow__state" aria-busy="true">
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
            <p className="return-workflow__state">Chưa có yêu cầu phù hợp.</p>
          ) : null}
          {page?.items.length ? (
            <div className="return-workflow__list">
              {page.items.map((item) => (
                <Link
                  className="return-card"
                  href={rolePath(role, item.returnReference)}
                  key={item.returnReference}
                >
                  <div>
                    <strong>{statusLabels[item.status]}</strong>
                    <small>Mã đơn: {item.orderReference}</small>
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
              ))}
            </div>
          ) : null}
          {page?.page.nextCursor ? (
            <button
              className="return-workflow__more"
              type="button"
              disabled={loading}
              onClick={() => void load(page.page.nextCursor!, true)}
            >
              {loading ? 'Đang tải…' : 'Xem thêm'}
            </button>
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
  return (
    <article className="return-detail">
      {notice ? (
        <p className="return-workflow__notice" role="status">
          {notice}
        </p>
      ) : null}
      <header className="return-detail__heading">
        <div>
          <small>Mã yêu cầu</small>
          <strong>{detail.returnReference}</strong>
          <small>Mã đơn: {detail.orderReference}</small>
        </div>
        <span>{statusLabels[detail.status]}</span>
      </header>
      <section>
        <h2>Yêu cầu hoàn tiền</h2>
        <p>{detail.description}</p>
        <strong>{money(detail.refundAmountMinor)}</strong>
      </section>
      <section>
        <h2>Sản phẩm</h2>
        {detail.lines.map((line) => (
          <div className="return-detail__line" key={line.lineReference}>
            <span>{line.productImageUrl ? <img src={line.productImageUrl} alt="" /> : null}</span>
            <div>
              <strong>{line.productName}</strong>
              <small>
                {line.variantName} · {line.requestedQuantity}/{line.purchasedQuantity}
              </small>
            </div>
            <b>{money(line.refundMinor)}</b>
          </div>
        ))}
      </section>
      <section>
        <h2>Bằng chứng riêng tư</h2>
        <div className="return-evidence">
          {detail.evidence.map((item, index) => (
            <PrivateEvidence key={item.evidenceId} url={item.url} index={index} />
          ))}
        </div>
      </section>
      <section>
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
            Mã vận đơn thử nghiệm: <strong>{detail.shipment.trackingCode}</strong>
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
        <section>
          <h2>Phản hồi của người bán</h2>
          <p>{detail.sellerPublicReason}</p>
        </section>
      ) : null}
      {'buyer' in detail ? (
        <section>
          <h2>Ngữ cảnh tranh chấp</h2>
          <p>
            Người mua: {detail.buyer.displayName} · Shop: {detail.shop.name}
          </p>
          {detail.decisions.length ? (
            <ol className="return-timeline">
              {detail.decisions.map((decision) => (
                <li key={decision.id}>
                  <strong>{actionLabels[decision.decision]}</strong> · {decision.publicReason}
                  <small>{dateTime(decision.decidedAt)}</small>
                  {decision.internalNote ? <p>Ghi chú nội bộ: {decision.internalNote}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
      <section>
        <h2>Lịch sử</h2>
        <ol className="return-timeline">
          {detail.timeline.map((event) => (
            <li key={event.id}>
              <strong>{statusLabels[event.status]}</strong>
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
          <select
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
        <section className="return-detail__actions">
          <h2>Quyết định tranh chấp</h2>
          <select
            value={adminDecision}
            disabled={pending}
            onChange={(event) => setAdminDecision(event.target.value as AdminReturnDecision | '')}
          >
            <option value="">Chọn quyết định</option>
            {adminChoices.map((item) => (
              <option key={item.action} value={item.action}>
                {actionLabels[item.action]}
              </option>
            ))}
          </select>
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
