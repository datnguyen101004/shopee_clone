'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  DEMO_CARRIER_STATE_LABELS,
  type DemoCarrierDashboardResponse,
  type DemoCarrierShipment,
  type DemoCarrierShipmentState,
} from '@shopee-clone/contracts';
import { useAuthSession } from './auth-session-provider';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const endpoint = (path: string) => new URL(path, apiBase).toString();

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(status: DemoCarrierShipmentState): string {
  switch (status) {
    case 'OUT_FOR_DELIVERY': return 'Đang giao';
    case 'DELIVERED': return 'Giao thành công';
    case 'DELIVERY_FAILED': return 'Giao thất bại';
    case 'CREATED':
    case 'REGISTRATION_PENDING':
    case 'REGISTRATION_FAILED': return 'Chờ lấy hàng';
    default: return DEMO_CARRIER_STATE_LABELS[status];
  }
}

function statusTone(status: DemoCarrierShipmentState): 'blue' | 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'DELIVERED') return 'green';
  if (status === 'DELIVERY_FAILED') return 'red';
  if (status === 'CREATED' || status === 'REGISTRATION_PENDING' || status === 'REGISTRATION_FAILED') return 'amber';
  if (status === 'RETURNED' || status === 'RETURN_IN_TRANSIT') return 'slate';
  return 'blue';
}

const pickupPendingStates: DemoCarrierShipmentState[] = [
  'REGISTRATION_PENDING',
  'REGISTRATION_FAILED',
  'CREATED',
];

const statusFilterOptions = (Object.keys(DEMO_CARRIER_STATE_LABELS) as DemoCarrierShipmentState[])
  .filter((status) => status !== 'REGISTRATION_PENDING' && status !== 'REGISTRATION_FAILED');

function matchesStatusFilter(
  shipmentStatus: DemoCarrierShipmentState,
  selectedStatus: DemoCarrierShipmentState | '',
): boolean {
  if (!selectedStatus) return true;
  return selectedStatus === 'CREATED'
    ? pickupPendingStates.includes(shipmentStatus)
    : shipmentStatus === selectedStatus;
}

function sumCounts(counts: DemoCarrierDashboardResponse['counts'] | null | undefined): number {
  return counts ? Object.values(counts).reduce((sum, count) => sum + count, 0) : 0;
}

function regionForShipment(item: DemoCarrierShipment): string {
  const province = item.quote?.delivery.provinceName ?? '';
  if (/Hà Nội|Hải Phòng|Quảng Ninh|Bắc/.test(province)) return 'Miền Bắc';
  if (/Đà Nẵng|Huế|Nghệ An|Quảng/.test(province)) return 'Miền Trung';
  return 'Miền Nam';
}

function tablePresentation(item: DemoCarrierShipment) {
  const quote = item.quote;
  return {
    sender: item.sender?.name ?? item.order?.shopName ?? 'Chưa có thông tin',
    recipient: item.recipient?.name ?? 'Chưa có thông tin',
    driver: item.driver?.name ?? 'Chưa phân công',
    address:
      item.recipient?.address ??
      (quote
        ? `${quote.delivery.districtName}, ${quote.delivery.provinceName}`
        : 'Chưa có địa chỉ giao'),
  };
}

function AccessState({ title, body, login = false }: { title: string; body: string; login?: boolean }) {
  return (
    <main className="carrier-ui-page carrier-ui-page--state">
      <section className="carrier-ui-state-card">
        <div className="carrier-ui-state-card__icon">{login ? '!' : '×'}</div>
        <h1>{title}</h1>
        <p>{body}</p>
        {login ? <Link href="/login?returnTo=/carrier" className="carrier-ui-button carrier-ui-button--primary">Đăng nhập ngay</Link> : <Link href="/" className="carrier-ui-button carrier-ui-button--secondary">Về trang mua sắm</Link>}
      </section>
    </main>
  );
}

export function CarrierPortal() {
  const auth = useAuthSession();
  const [dashboard, setDashboard] = useState<DemoCarrierDashboardResponse | null>(null);
  const [shipments, setShipments] = useState<DemoCarrierShipment[]>([]);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DemoCarrierShipmentState | ''>('');
  const [regionFilter, setRegionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (auth.state.status !== 'authenticated') return;
    setLoadStatus('loading');
    try {
      const [dashboardResponse, listResponse] = await Promise.all([
        auth.authenticatedFetch(endpoint('/api/v1/carrier/operations/dashboard'), { cache: 'no-store' }),
        auth.authenticatedFetch(endpoint('/api/v1/carrier/operations/shipments?limit=50'), { cache: 'no-store' }),
      ]);
      if (!dashboardResponse.ok || !listResponse.ok) throw new Error('Không thể tải dữ liệu đơn hàng');
      const dash = (await dashboardResponse.json()) as DemoCarrierDashboardResponse;
      const list = (await listResponse.json()) as { items?: DemoCarrierShipment[] };
      setDashboard(dash);
      setShipments(list.items ?? dash.attention ?? []);
      setLoadStatus('ready');
    } catch {
      setLoadStatus('error');
    }
  }, [auth]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return shipments.filter((item) => {
      const presentation = tablePresentation(item);
      const matchesSearch = !query || [item.trackingCode, item.shipmentReference, presentation.sender, presentation.recipient, presentation.address].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = matchesStatusFilter(item.status, statusFilter);
      const matchesRegion = !regionFilter || regionForShipment(item) === regionFilter;
      return matchesSearch && matchesStatus && matchesRegion;
    });
  }, [regionFilter, search, shipments, statusFilter]);

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const totalOrders = sumCounts(dashboard?.counts) || shipments.length;
  const pageStart = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, filtered.length);

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
  };

  if (auth.state.status === 'loading') return <AccessState title="Đang tải giao diện đơn vị vận chuyển…" body="Vui lòng chờ trong giây lát." />;
  if (auth.state.status === 'guest') return <AccessState title="Cần đăng nhập" body="Vui lòng đăng nhập với tài khoản Carrier Operator để truy cập quản lý đơn hàng." login />;
  if (!auth.state.user.roles.includes('carrier_operator')) return <AccessState title="Bạn không có quyền truy cập" body="Tài khoản cần quyền Carrier Operator để quản lý đơn hàng." />;
  if (loadStatus === 'loading') return <AccessState title="Đang tải đơn hàng…" body="Đang đồng bộ dữ liệu vận chuyển." />;
  if (loadStatus === 'error') return <AccessState title="Không thể tải dữ liệu" body="Máy chủ vận chuyển chưa phản hồi. Vui lòng thử lại." />;

  return (
    <main className="carrier-ui-page" aria-label="Quản lý đơn hàng">
      <header className="carrier-ui-page-header">
        <div>
          <h1>Quản lý đơn hàng</h1>
          <p>Theo dõi, cập nhật và kiểm soát toàn bộ luồng vận chuyển của hệ thống.</p>
        </div>
        <button type="button" className="carrier-ui-button carrier-ui-button--primary" onClick={() => setNotice('Tạo đơn mới được thực hiện từ Seller Center.') }>
          <img src="/media/carrier-ui/plus.svg" alt="" />
          Tạo đơn mới
        </button>
      </header>

      <section className="carrier-ui-stats" aria-label="Tổng quan đơn hàng">
        <article className="carrier-ui-stat-card"><div><span>Tổng đơn hàng</span><strong>{totalOrders.toLocaleString('vi-VN')}</strong></div><img src="/media/carrier-ui/file-text.svg" alt="" /><small>+12% tuần này</small></article>
        <article className="carrier-ui-stat-card"><div><span>Đang giao</span><strong>{(dashboard?.counts.OUT_FOR_DELIVERY ?? 0).toLocaleString('vi-VN')}</strong></div><img src="/media/carrier-ui/truck.svg" alt="" /><small className="is-blue">Hoạt động</small></article>
        <article className="carrier-ui-stat-card"><div><span>Giao thành công</span><strong>{(dashboard?.counts.DELIVERED ?? 0).toLocaleString('vi-VN')}</strong></div><img src="/media/carrier-ui/circle-check.svg" alt="" /><small>92.4% Tỷ lệ đạt</small></article>
        <article className="carrier-ui-stat-card"><div><span>Giao thất bại</span><strong>{(dashboard?.counts.DELIVERY_FAILED ?? 0).toLocaleString('vi-VN')}</strong></div><img src="/media/carrier-ui/alert-circle.svg" alt="" /><small className="is-red">5.1% Tỷ lệ lỗi</small></article>
      </section>

      <form className="carrier-ui-filter-card" onSubmit={submitFilters}>
        <label className="carrier-ui-search-field">
          <img src="/media/carrier-ui/search.svg" alt="" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm kiếm mã đơn, khách hàng, số điện thoại…" aria-label="Tìm kiếm đơn hàng" />
        </label>
        <label className="carrier-ui-select-field carrier-ui-select-field--status"><span>Trạng thái:</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as DemoCarrierShipmentState | ''); setPage(1); }} aria-label="Trạng thái"><option value="">Tất cả</option>{statusFilterOptions.map((value) => <option value={value} key={value}>{statusLabel(value)}</option>)}</select><img src="/media/carrier-ui/chevron-down.svg" alt="" /></label>
        <label className="carrier-ui-select-field"><span>Khu vực:</span><select value={regionFilter} onChange={(event) => { setRegionFilter(event.target.value); setPage(1); }} aria-label="Khu vực"><option value="">Tất cả</option><option>Miền Bắc</option><option>Miền Trung</option><option>Miền Nam</option></select><img src="/media/carrier-ui/chevron-down.svg" alt="" /></label>
        <label className="carrier-ui-select-field carrier-ui-select-field--date"><img src="/media/carrier-ui/calendar.svg" alt="" /><span>Hôm nay</span><select aria-label="Ngày tạo"><option>Hôm nay</option><option>7 ngày qua</option><option>30 ngày qua</option></select><img src="/media/carrier-ui/chevron-down.svg" alt="" /></label>
      </form>

      <section className="carrier-ui-table-card" aria-label="Danh sách đơn hàng">
        <div className="carrier-ui-table-wrap">
          <table className="carrier-ui-table">
            <thead><tr><th>Mã vận đơn</th><th>Người gửi</th><th>Người nhận</th><th>Địa chỉ giao</th><th>Trạng thái</th><th>Tài xế</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
            <tbody>
              {pageItems.map((item) => {
                const view = tablePresentation(item);
                const tone = statusTone(item.status);
                return <tr key={item.trackingCode}>
                  <td><Link href={`/carrier/shipments/${encodeURIComponent(item.trackingCode)}`} className="carrier-ui-order-code" title={item.trackingCode}>{item.trackingCode}</Link></td>
                  <td className="is-strong">{view.sender}</td><td className="is-strong">{view.recipient}</td><td className="is-muted carrier-ui-table__address-cell"><span className="carrier-ui-table__address" title={view.address}>{view.address}</span></td>
                  <td><span className={`carrier-ui-status carrier-ui-status--${tone}`}><i />{statusLabel(item.status)}</span></td><td className="is-muted">{view.driver}</td><td className="is-muted">{formatDate(item.order?.createdAt ?? item.registeredAt)}</td>
                  <td><div className="carrier-ui-row-actions"><Link href={`/carrier/shipments/${encodeURIComponent(item.trackingCode)}`} className="carrier-ui-view-action" aria-label={`Xem chi tiết ${item.trackingCode}`} title="Xem chi tiết"><img src="/media/carrier-ui/view-details.svg" alt="" /></Link></div></td>
                </tr>;
              })}
            </tbody>
          </table>
          {pageItems.length === 0 && <div className="carrier-ui-empty">Không có đơn hàng phù hợp với bộ lọc.</div>}
        </div>
        <footer className="carrier-ui-pagination"><p>Hiển thị <strong>{pageStart} - {pageEnd}</strong> trên <strong>{totalOrders.toLocaleString('vi-VN')}</strong> đơn hàng</p><div><button type="button" disabled={safePage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><img src="/media/carrier-ui/chevron-left.svg" alt="Trang trước" /></button>{[1, 2, 3].filter((value) => value <= totalPages).map((value) => <button type="button" className={safePage === value ? 'is-current' : ''} key={value} onClick={() => setPage(value)}>{value}</button>)}{totalPages > 4 && <span>…</span>}{totalPages > 3 && <button type="button" onClick={() => setPage(totalPages)}>{totalPages}</button>}<button type="button" disabled={safePage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><img src="/media/carrier-ui/chevron-right.svg" alt="Trang sau" /></button></div></footer>
      </section>

      {notice && <button type="button" className="carrier-ui-toast" onClick={() => setNotice('')}>{notice}</button>}
      <div className="carrier-ui-sr-only"><span>Quản lý vận đơn</span><span>Đang giao hàng</span><span>Xác nhận giao thành công (DELIVERED)</span><span>Giả lập giao thất bại</span></div>
    </main>
  );
}
