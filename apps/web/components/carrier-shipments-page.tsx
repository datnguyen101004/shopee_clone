'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  DEMO_CARRIER_SERVICES,
  DEMO_CARRIER_SERVICE_LABELS,
  DEMO_CARRIER_STATE_LABELS,
  type DemoCarrierServiceCode,
  type DemoCarrierShipment,
  type DemoCarrierShipmentState,
} from '@shopee-clone/contracts';
import { useAuthSession } from './auth-session-provider';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getStatusCategory(status: DemoCarrierShipmentState): 'pending' | 'transit' | 'delivering' | 'failed' | 'return' | 'delivered' {
  switch (status) {
    case 'REGISTRATION_PENDING':
    case 'REGISTRATION_FAILED':
    case 'CREATED':
      return 'pending';
    case 'ACCEPTED':
    case 'IN_TRANSIT':
      return 'transit';
    case 'OUT_FOR_DELIVERY':
      return 'delivering';
    case 'DELIVERY_FAILED':
      return 'failed';
    case 'RETURN_IN_TRANSIT':
    case 'RETURNED':
      return 'return';
    case 'DELIVERED':
      return 'delivered';
    default:
      return 'transit';
  }
}

export function CarrierShipmentsPage() {
  const auth = useAuthSession();
  const [items, setItems] = useState<DemoCarrierShipment[]>([]);
  const [reference, setReference] = useState('');
  const [state, setState] = useState<DemoCarrierShipmentState | ''>('');
  const [service, setService] = useState<DemoCarrierServiceCode | ''>('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const load = async () => {
    if (auth.state.status !== 'authenticated') return;
    setStatus('loading');
    const params = new URLSearchParams({ limit: '50' });
    if (reference.trim()) params.set('reference', reference.trim());
    if (state) params.set('status', state);
    if (service) params.set('service', service);

    try {
      const response = await auth.authenticatedFetch(
        `${apiBase}/api/v1/carrier/operations/shipments?${params.toString()}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('Không thể tải danh sách vận đơn');
      const body = (await response.json()) as { items?: DemoCarrierShipment[] };
      setItems(body.items ?? []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.state.status]);

  const handleCopy = (code: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
      });
    }
  };

  const handleReset = () => {
    setReference('');
    setState('');
    setService('');
    setTimeout(() => {
      void (async () => {
        if (auth.state.status !== 'authenticated') return;
        setStatus('loading');
        try {
          const response = await auth.authenticatedFetch(
            `${apiBase}/api/v1/carrier/operations/shipments?limit=50`,
            { cache: 'no-store' },
          );
          if (!response.ok) throw new Error('Không thể tải danh sách');
          const body = (await response.json()) as { items?: DemoCarrierShipment[] };
          setItems(body.items ?? []);
          setStatus('ready');
        } catch {
          setStatus('error');
        }
      })();
    }, 0);
  };

  if (auth.state.status === 'loading') {
    return (
      <main className="carrier-portal">
        <section className="carrier-state-card" aria-busy="true">
          <div className="carrier-spinner" />
          <h1>Đang tải danh sách vận đơn…</h1>
          <p>Vui lòng chờ trong giây lát.</p>
        </section>
      </main>
    );
  }

  if (auth.state.status === 'guest') {
    return (
      <main className="carrier-portal">
        <section className="carrier-state-card">
          <div className="carrier-state-card__icon carrier-state-card__icon--warn">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1>Cần đăng nhập</h1>
          <p>Vui lòng đăng nhập với tài khoản Carrier Operator để truy cập danh sách vận đơn.</p>
          <Link href="/login?returnTo=/carrier/shipments" className="carrier-btn-primary">
            Đăng nhập
          </Link>
        </section>
      </main>
    );
  }

  if (!auth.state.user.roles.includes('carrier_operator')) {
    return (
      <main className="carrier-portal">
        <section className="carrier-state-card">
          <div className="carrier-state-card__icon carrier-state-card__icon--danger">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <h1>Bạn không có quyền truy cập</h1>
          <p>Tài khoản cần quyền Carrier Operator để quản lý vận đơn mô phỏng.</p>
          <Link href="/" className="carrier-btn-secondary">
            Về trang mua sắm
          </Link>
        </section>
      </main>
    );
  }

  if (status === 'loading') {
    return (
      <main className="carrier-portal">
        <section className="carrier-state-card" aria-busy="true">
          <div className="carrier-spinner" />
          <h1>Đang tải danh sách vận đơn…</h1>
          <p>Vui lòng chờ trong giây lát.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="carrier-portal">
      {/* Header */}
      <header className="carrier-portal__header">
        <div className="carrier-portal__header-left">
          <span className="carrier-portal__eyebrow">DEMO CARRIER · MÔ PHỎNG</span>
          <h1>Danh sách vận đơn</h1>
          <p>Tìm kiếm mã đơn, lọc theo trạng thái hiện tại hoặc gói dịch vụ vận chuyển.</p>
        </div>
        <div className="carrier-portal__header-actions">
          <Link href="/carrier" className="carrier-btn-secondary">
            &larr; Về trang Tổng quan
          </Link>
        </div>
      </header>

      {/* Filter Toolbar */}
      <form
        className="carrier-filter-bar"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <div className="carrier-filter-item carrier-filter-item--search">
          <label htmlFor="carrier-search-input" className="carrier-sr-only">
            Mã đơn hàng hoặc vận đơn
          </label>
          <div className="carrier-input-icon-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="carrier-search-input"
              aria-label="Mã đơn hàng"
              placeholder="Nhập mã đơn hàng hoặc mã vận đơn…"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="carrier-input"
            />
          </div>
        </div>

        <div className="carrier-filter-item">
          <label htmlFor="carrier-state-select" className="carrier-sr-only">
            Trạng thái vận đơn
          </label>
          <select
            id="carrier-state-select"
            aria-label="Trạng thái"
            value={state}
            onChange={(event) => setState(event.target.value as DemoCarrierShipmentState | '')}
            className="carrier-select"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(DEMO_CARRIER_STATE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="carrier-filter-item">
          <label htmlFor="carrier-service-select" className="carrier-sr-only">
            Gói dịch vụ
          </label>
          <select
            id="carrier-service-select"
            aria-label="Gói dịch vụ"
            value={service}
            onChange={(event) => setService(event.target.value as DemoCarrierServiceCode | '')}
            className="carrier-select"
          >
            <option value="">Tất cả gói dịch vụ</option>
            {DEMO_CARRIER_SERVICES.map((s) => (
              <option key={s} value={s}>
                {DEMO_CARRIER_SERVICE_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </div>

        <div className="carrier-filter-actions">
          <button type="submit" className="carrier-btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Tìm kiếm</span>
          </button>
          {(reference || state || service) && (
            <button
              type="button"
              className="carrier-btn-reset"
              onClick={handleReset}
            >
              Đặt lại
            </button>
          )}
        </div>
      </form>

      {/* Results Section */}
      {status === 'error' ? (
        <section className="carrier-state-card">
          <div className="carrier-state-card__icon carrier-state-card__icon--danger">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2>Không thể tải danh sách vận đơn</h2>
          <p>Có lỗi khi kết nối máy chủ hoặc máy chủ demo chưa phản hồi.</p>
          <button type="button" className="carrier-btn-primary" onClick={() => void load()}>
            Thử lại
          </button>
        </section>
      ) : items.length === 0 ? (
        <section className="carrier-state-card">
          <div className="carrier-state-card__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            </svg>
          </div>
          <h2>Không có vận đơn phù hợp</h2>
          <p>Thử bỏ bớt điều kiện lọc hoặc tạo đơn bàn giao mới từ Seller Center.</p>
          <button type="button" className="carrier-btn-secondary" onClick={handleReset}>
            Xóa điều kiện tìm kiếm
          </button>
        </section>
      ) : (
        <section className="carrier-shipments-table-card" aria-label="Danh sách vận đơn">
          <div className="carrier-table-responsive">
            <table className="carrier-table">
              <thead>
                <tr>
                  <th>Mã vận đơn</th>
                  <th>Mã đơn hàng</th>
                  <th>Gói dịch vụ</th>
                  <th>Lộ trình (Từ &rarr; Đến)</th>
                  <th>Cập nhật gần nhất</th>
                  <th>Trạng thái</th>
                  <th className="carrier-text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const cat = getStatusCategory(item.status);
                  const serviceLabel = DEMO_CARRIER_SERVICE_LABELS[item.service as DemoCarrierServiceCode] ?? item.service;

                  return (
                    <tr key={item.trackingCode} className="carrier-table-row">
                      <td>
                        <div className="carrier-tracking-cell">
                          <Link
                            href={`/carrier/shipments/${encodeURIComponent(item.trackingCode)}`}
                            className="carrier-code-link"
                          >
                            {item.trackingCode}
                          </Link>
                          <button
                            type="button"
                            className="carrier-btn-inline-copy"
                            onClick={(e) => handleCopy(item.trackingCode, e)}
                            title="Sao chép mã"
                          >
                            {copiedCode === item.trackingCode ? (
                              <span className="carrier-copy-check">✓</span>
                            ) : (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className="carrier-ref-tag">{item.shipmentReference}</span>
                      </td>
                      <td>
                        <span className="carrier-service-pill">{serviceLabel}</span>
                      </td>
                      <td>
                        {item.quote ? (
                          <div className="carrier-route-compact">
                            <span>{item.quote.pickup.provinceName}</span>
                            <span className="carrier-arrow">&rarr;</span>
                            <span>{item.quote.delivery.provinceName}</span>
                          </div>
                        ) : (
                          <span className="carrier-text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <time className="carrier-time-cell">{formatDate(item.lastUpdatedAt)}</time>
                      </td>
                      <td>
                        <span className={`carrier-status-pill carrier-status-pill--${cat}`}>
                          {DEMO_CARRIER_STATE_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="carrier-text-right">
                        <Link
                          href={`/carrier/shipments/${encodeURIComponent(item.trackingCode)}`}
                          className="carrier-btn-table-action"
                        >
                          <span>Chi tiết</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
