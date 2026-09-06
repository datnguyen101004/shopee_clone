'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DEMO_CARRIER_STATE_LABELS,
  type DemoCarrierOperationAction,
  type DemoCarrierShipment,
  type DemoCarrierShipmentState,
} from '@shopee-clone/contracts';
import { useAuthSession } from './auth-session-provider';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const endpoint = (path: string) => new URL(path, apiBase).toString();

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatCurrency(amountMinor: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amountMinor);
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

function nextActionFor(status: DemoCarrierShipmentState): DemoCarrierOperationAction | null {
  if (status === 'CREATED' || status === 'ACCEPTED' || status === 'IN_TRANSIT' || status === 'OUT_FOR_DELIVERY') return 'ADVANCE';
  if (status === 'DELIVERY_FAILED') return 'RETRY_DELIVERY';
  if (status === 'RETURN_IN_TRANSIT') return 'ADVANCE_RETURN';
  if (status === 'REGISTRATION_FAILED') return 'RETRY_REGISTRATION';
  return null;
}

function nextActionLabel(status: DemoCarrierShipmentState): string {
  if (status === 'CREATED') return 'Xác nhận đã lấy hàng';
  if (status === 'ACCEPTED' || status === 'IN_TRANSIT') return 'Chuyển sang đang giao';
  if (status === 'OUT_FOR_DELIVERY') return 'Xác nhận giao thành công';
  if (status === 'DELIVERY_FAILED') return 'Thử giao lại';
  if (status === 'RETURN_IN_TRANSIT') return 'Xác nhận đã hoàn về shop';
  if (status === 'REGISTRATION_FAILED') return 'Thử đăng ký lại';
  return 'Cập nhật trạng thái';
}

function AccessState({ title, body, login = false }: { title: string; body: string; login?: boolean }) {
  return (
    <main className="carrier-ui-page carrier-ui-page--state">
      <section className="carrier-ui-state-card">
        <div className="carrier-ui-state-card__icon">{login ? '!' : '×'}</div>
        <h1>{title}</h1>
        <p>{body}</p>
        {login ? <Link href="/login?returnTo=/carrier" className="carrier-ui-button carrier-ui-button--primary">Đăng nhập ngay</Link> : <Link href="/carrier" className="carrier-ui-button carrier-ui-button--secondary">Về quản lý đơn hàng</Link>}
      </section>
    </main>
  );
}

export function CarrierShipmentDetailPage() {
  const auth = useAuthSession();
  const params = useParams<{ trackingCode: string }>();
  const trackingCode = decodeURIComponent(params.trackingCode ?? '');
  const [shipment, setShipment] = useState<DemoCarrierShipment | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (auth.state.status !== 'authenticated' || !trackingCode) return;
    setLoadStatus('loading');
    try {
      const response = await auth.authenticatedFetch(endpoint(`/api/v1/carrier/operations/shipments/${encodeURIComponent(trackingCode)}`), { cache: 'no-store' });
      if (!response.ok) throw new Error('Không thể tải thông tin đơn hàng');
      setShipment((await response.json()) as DemoCarrierShipment);
      setLoadStatus('ready');
    } catch {
      setLoadStatus('error');
    }
  }, [auth, trackingCode]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const runAction = async (action: DemoCarrierOperationAction) => {
    if (!shipment || actionLoading) return;
    setActionLoading(true);
    setMessage('Đang cập nhật trạng thái…');
    try {
      const response = await auth.authenticatedFetch(endpoint(`/api/v1/carrier/operations/shipments/${encodeURIComponent(trackingCode)}/actions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error('Cập nhật trạng thái thất bại.');
      const body = (await response.json()) as { shipment: DemoCarrierShipment };
      setShipment(body.shipment);
      setMessage(`Đã cập nhật: ${statusLabel(body.shipment.status)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cập nhật trạng thái thất bại.');
    } finally {
      setActionLoading(false);
    }
  };

  const quote = shipment?.quote;
  const events = useMemo(() => shipment?.events ?? [], [shipment]);

  if (auth.state.status === 'loading') return <AccessState title="Đang tải chi tiết đơn hàng…" body="Vui lòng chờ trong giây lát." />;
  if (auth.state.status === 'guest') return <AccessState title="Cần đăng nhập" body="Vui lòng đăng nhập với tài khoản Carrier Operator để xem chi tiết đơn hàng." login />;
  if (!auth.state.user.roles.includes('carrier_operator')) return <AccessState title="Bạn không có quyền truy cập" body="Tài khoản cần quyền Carrier Operator để xem đơn hàng." />;
  if (loadStatus === 'loading') return <AccessState title="Đang tải chi tiết đơn hàng…" body="Đang đồng bộ dữ liệu vận chuyển." />;
  if (loadStatus === 'error' || !shipment) return <AccessState title="Không tìm thấy đơn hàng" body={`Mã vận đơn “${trackingCode}” không tồn tại hoặc đã bị xóa.`} />;

  const tone = statusTone(shipment.status);
  const nextAction = nextActionFor(shipment.status);
  const sender = shipment.sender ?? {
    name: shipment.order?.shopName ?? 'Chưa có thông tin',
    phoneNumber: null,
    address: quote ? `${quote.pickup.districtName}, ${quote.pickup.provinceName}` : 'Chưa có địa chỉ gửi',
  };
  const recipient = shipment.recipient ?? {
    name: 'Chưa có thông tin',
    phoneNumber: null,
    address: quote ? `${quote.delivery.districtName}, ${quote.delivery.provinceName}` : 'Chưa có địa chỉ giao',
  };
  const orderItems = shipment.order?.items ?? [];

  return (
    <main className="carrier-ui-page carrier-ui-detail" aria-label={`Chi tiết đơn ${shipment.trackingCode}`}>
      <header className="carrier-ui-detail-header">
        <div>
          <nav className="carrier-ui-breadcrumbs" aria-label="Đường dẫn"><Link href="/carrier">Đơn hàng</Link><span>›</span><span className="font-medium">Chi tiết đơn #{shipment.trackingCode}</span></nav>
          <div className="carrier-ui-detail-title"><h1>Đơn hàng #{shipment.trackingCode}</h1><span className={`carrier-ui-status carrier-ui-status--${tone}`}><i />{statusLabel(shipment.status)}</span></div>
        </div>
        <div className="carrier-ui-detail-actions">
          <button type="button" className="carrier-ui-button carrier-ui-button--secondary" onClick={() => setMessage('Đơn hàng đang được xử lý trên hệ thống vận chuyển.')}><img src="/media/carrier-ui/trash.svg" alt="" />Hủy đơn</button>
          <button type="button" className="carrier-ui-button carrier-ui-button--secondary" onClick={() => window.print()}><img src="/media/carrier-ui/printer.svg" alt="" />In phiếu giao</button>
          <button type="button" className="carrier-ui-button carrier-ui-button--primary" disabled={!nextAction || actionLoading} onClick={() => nextAction && void runAction(nextAction)}><img src="/media/carrier-ui/edit.svg" alt="" />{actionLoading ? 'Đang cập nhật…' : nextActionLabel(shipment.status)}</button>
        </div>
      </header>

      <div className="carrier-ui-detail-grid">
        <div className="carrier-ui-detail-main">
          <section className="carrier-ui-detail-card carrier-ui-order-info">
            <h2>Thông tin đơn hàng</h2>
            <div className="carrier-ui-order-products">
              {orderItems.length ? orderItems.map((item, index) => (
                <article className="carrier-ui-order-product" key={`${item.productName}-${item.variantName}-${index}`}>
                  {item.imageUrl ? (
                    <img className="carrier-ui-order-product__image" src={item.imageUrl} alt={item.productName} />
                  ) : (
                    <span className="carrier-ui-order-product__image carrier-ui-order-product__image--empty" aria-label={`${item.productName} chưa có ảnh`}>Chưa có ảnh</span>
                  )}
                  <div className="carrier-ui-order-product__copy">
                    <span className="font-medium">{item.productName}</span>
                    <span>{item.variantName} · Số lượng: {item.quantity}</span>
                    <p>{item.description ?? 'Sản phẩm chưa có mô tả.'}</p>
                  </div>
                </article>
              )) : <p className="carrier-ui-order-products__empty">Chưa có thông tin sản phẩm.</p>}
            </div>
            <dl>
              <div><dt>Mã đơn hàng</dt><dd>{shipment.shipmentReference}</dd></div>
              <div><dt>Mã vận đơn</dt><dd className="is-blue">{shipment.trackingCode}</dd></div>
              <div><dt>Trọng lượng</dt><dd>{quote ? (quote.shipmentWeightGrams / 1000).toFixed(1) : '—'} kg</dd></div>
              <div><dt>Kích thước</dt><dd>Chưa cập nhật</dd></div>
              <div><dt>Phí vận chuyển</dt><dd>{formatCurrency(quote?.totalFeeMinor ?? 0)}</dd></div>
              <div><dt>Tiền thu hộ (COD)</dt><dd className="is-bold">{formatCurrency(shipment.order?.codAmountMinor ?? 0)}</dd></div>
              <div><dt>Ghi chú</dt><dd>{shipment.order?.note ?? 'Không có ghi chú'}</dd></div>
            </dl>
          </section>

          <section className="carrier-ui-detail-card carrier-ui-timeline-card"><h2>Lịch sử vận chuyển</h2><ol className="carrier-ui-timeline">
            {events.length === 0 ? <li className="carrier-ui-timeline-empty">Chưa có sự kiện vận chuyển.</li> : events.map((event, index) => <li key={event.externalEventId} className={index === events.length - 1 ? 'is-latest' : ''}><time>{formatDateTime(event.occurredAt)}</time><span className={`carrier-ui-timeline-dot carrier-ui-timeline-dot--${statusTone(event.status)}`} /><div><strong>{statusLabel(event.status)}</strong><p>{event.note ?? (event.status === 'OUT_FOR_DELIVERY' ? (shipment.driver ? `Tài xế ${shipment.driver.name} đang thực hiện lộ trình giao hàng cuối đến người nhận.` : 'Đơn hàng đang trên lộ trình giao tới người nhận.') : 'Đơn hàng được cập nhật trên hệ thống vận chuyển.')}</p></div></li>)}
          </ol></section>
        </div>

        <aside className="carrier-ui-detail-side">
          <ContactCard title="Người gửi" name={sender.name} phone={sender.phoneNumber ?? 'Chưa cập nhật'} address={`Địa chỉ gửi: ${sender.address}`} icon="user.svg" direction="up" />
          <ContactCard title="Người nhận" name={recipient.name} phone={recipient.phoneNumber ?? 'Chưa cập nhật'} address={`Địa chỉ giao: ${recipient.address}`} icon="user-check.svg" direction="down" />
          <section className="carrier-ui-detail-card carrier-ui-driver-card"><h2>Tài xế phụ trách</h2><div className="carrier-ui-person"><span className="carrier-ui-person__icon"><img src="/media/carrier-ui/user.svg" alt="" /></span><div><strong>{shipment.driver?.name ?? 'Chưa phân công'}</strong><span>{shipment.driver?.phoneNumber ?? '—'}</span></div></div><div className="carrier-ui-driver-meta"><div><span>Phương tiện</span><span className="font-medium">{shipment.driver?.vehicle ?? 'Chưa cập nhật'}</span></div><div><span>Khu vực xử lý</span><span className="font-medium">{quote?.delivery.districtName ?? 'Chưa phân công'}</span></div></div></section>
        </aside>
      </div>

      {message && <button type="button" className="carrier-ui-toast" onClick={() => setMessage('')}>{message}</button>}
      <div className="carrier-ui-sr-only"><span>Bảng điều khiển mô phỏng</span><span>Giao hàng thành công (DELIVERED)</span></div>
    </main>
  );
}

function ContactCard({ title, name, phone, address, icon, direction }: { title: string; name: string; phone: string; address: string; icon: string; direction: 'up' | 'down' }) {
  return <section className="carrier-ui-detail-card carrier-ui-contact-card"><div className="carrier-ui-contact-heading"><h2>{title}</h2><img src={`/media/carrier-ui/arrow-${direction === 'up' ? 'up-right' : 'down-left'}.svg`} alt="" /></div><div className="carrier-ui-person"><span className="carrier-ui-person__icon"><img src={`/media/carrier-ui/${icon}`} alt="" /></span><div><strong>{name}</strong><span>{phone}</span></div></div><p><span className="font-medium">{address.split(':')[0]}:</span>{address.split(':').slice(1).join(':')}</p></section>;
}
