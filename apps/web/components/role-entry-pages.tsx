'use client';

import type { RoleAuditPage, SellerShop } from '@shopee-clone/contracts';
import { Container } from '@shopee-clone/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { approveSellerShop } from '../lib/seller-shop-api';
import { fetchRoleAuditPage, fetchSellerShop, RoleApiError } from '../lib/role-api';
import { useAuthSession } from './auth-session-provider';
import { OperationalRoleGate } from './operational-role-gate';

type ProtectedState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'unavailable' };

type ProtectedFailureStatus = 'loading' | 'unauthorized' | 'forbidden' | 'unavailable';

function ProtectedFailure({ status }: { status: ProtectedFailureStatus }) {
  if (status === 'loading') {
    return (
      <div className="operational-panel" aria-live="polite" aria-busy="true">
        <h2>Đang tải dữ liệu được bảo vệ</h2>
      </div>
    );
  }
  return (
    <div className="operational-panel" role="status" aria-live="polite">
      <h2>{status === 'unauthorized' ? 'Phiên đăng nhập đã hết hạn' : 'Không thể mở dữ liệu'}</h2>
      <p>
        {status === 'unauthorized'
          ? 'Vui lòng đăng nhập lại để tiếp tục.'
          : status === 'forbidden'
            ? 'Quyền hiện tại không còn đủ để truy cập khu vực này.'
            : 'Dịch vụ đang tạm thời không khả dụng. Vui lòng thử lại sau.'}
      </p>
      {status === 'unauthorized' ? <Link href="/login">Đăng nhập</Link> : null}
    </div>
  );
}

function failureState(error: unknown): ProtectedState<never> {
  if (error instanceof RoleApiError && error.status === 401) return { status: 'unauthorized' };
  if (error instanceof RoleApiError && error.status === 403) return { status: 'forbidden' };
  return { status: 'unavailable' };
}

function SellerContent() {
  const { authenticatedFetch } = useAuthSession();
  const [state, setState] = useState<ProtectedState<SellerShop>>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void fetchSellerShop(authenticatedFetch)
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (active) setState(failureState(error));
      });
    return () => {
      active = false;
    };
  }, [authenticatedFetch]);

  if (state.status !== 'ready') return <ProtectedFailure status={state.status} />;
  return (
    <section className="operational-panel" aria-labelledby="seller-shop-title">
      <span className="operational-eyebrow">Kênh người bán</span>
      <h1 id="seller-shop-title">{state.data.name}</h1>
      <dl>
        <div>
          <dt>Đường dẫn shop</dt>
          <dd>{state.data.slug}</dd>
        </div>
        <div>
          <dt>Trạng thái</dt>
          <dd>
            {state.data.status === 'active'
              ? 'Đang hoạt động'
              : state.data.status === 'suspended'
                ? 'Đang bị tạm khóa'
                : 'Tạm ngừng'}
          </dd>
        </div>
      </dl>
      <p>
        {state.data.status === 'active'
          ? 'Shop đang hoạt động trên marketplace.'
          : 'Shop hiện không được bán trên catalog và checkout.'}
      </p>
      <Link href="/seller/shop">Quản lý hồ sơ shop</Link>
    </section>
  );
}

function AdminApprovalPlaceholder() {
  const { authenticatedFetch } = useAuthSession();
  const [shopId, setShopId] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="seller-shop-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        setMessage(null);
        void approveSellerShop(authenticatedFetch, shopId, { decision, reason })
          .then((shop) => {
            setMessage(`Đã ${decision === 'approve' ? 'duyệt' : 'từ chối'} ${shop.name}.`);
          })
          .catch(() => {
            setMessage('Không thể cập nhật duyệt shop.');
          })
          .finally(() => setPending(false));
      }}
    >
      <h2>Duyệt đăng ký mở shop</h2>
      <p>Khi duyệt, chủ shop sẽ được cấp quyền người bán và shop được mở bán.</p>
      <label>
        Mã shop
        <input name="shopId" value={shopId} onChange={(event) => setShopId(event.target.value)} required />
      </label>
      <label>
        Quyết định
        <select name="decision" value={decision} onChange={(event) => setDecision(event.target.value as 'approve' | 'reject')}>
          <option value="approve">Duyệt</option>
          <option value="reject">Từ chối</option>
        </select>
      </label>
      <label>
        Lý do
        <input name="reason" value={reason} onChange={(event) => setReason(event.target.value)} required minLength={8} />
      </label>
      <button type="submit" disabled={pending}>{pending ? 'Đang gửi…' : 'Gửi quyết định'}</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

function AdminContent() {
  const { authenticatedFetch } = useAuthSession();
  const [state, setState] = useState<ProtectedState<RoleAuditPage>>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void fetchRoleAuditPage(authenticatedFetch)
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (active) setState(failureState(error));
      });
    return () => {
      active = false;
    };
  }, [authenticatedFetch]);

  if (state.status !== 'ready') return <ProtectedFailure status={state.status} />;
  return (
    <section className="operational-panel" aria-labelledby="admin-title">
      <span className="operational-eyebrow">Quản trị quyền T12</span>
      <h1 id="admin-title">Kiểm soát vai trò marketplace</h1>
      <p>
        Backend đã hỗ trợ cấp, thu hồi và audit vai trò. Giao diện quản trị đầy đủ sẽ được xây dựng
        trong task quản trị sau.
      </p>
      <AdminApprovalPlaceholder />
      <strong>{state.data.items.length} sự kiện audit gần nhất</strong>
      <ul className="operational-audit-list" aria-label="Sự kiện phân quyền gần nhất">
        {state.data.items.slice(0, 5).map((event) => (
          <li key={event.id}>
            <span>{event.action === 'grant' ? 'Cấp' : 'Thu hồi'}</span>
            <b>{event.role}</b>
            <time dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleDateString('vi-VN')}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SellerEntryPage() {
  return (
    <Container className="operational-page">
      <OperationalRoleGate role="seller">
        <SellerContent />
      </OperationalRoleGate>
    </Container>
  );
}

export function AdminEntryPage() {
  return (
    <Container className="operational-page">
      <OperationalRoleGate role="admin">
        <AdminContent />
      </OperationalRoleGate>
    </Container>
  );
}
