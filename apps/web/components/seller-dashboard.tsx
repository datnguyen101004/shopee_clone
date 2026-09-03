'use client';

import type { SellerAnalyticsGranularity, SellerDashboardResponse } from '@shopee-clone/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchSellerDashboard } from '../lib/seller-analytics-api';
import { RoleApiError } from '../lib/role-api';
import { marketplaceMediaUrl } from '../lib/marketplace-media-url';
import { DateTimeLocalPicker } from './datetime-local-picker';
import { useAuthSession } from './auth-session-provider';

// Font Awesome SVG Icons
function FaMoneyBillWave({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 576 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M0 112c0-26.5 21.5-48 48-48l480 0c26.5 0 48 21.5 48 48l0 288c0 26.5-21.5 48-48 48L48 448c-26.5 0-48-21.5-48-48L0 112zm64 48l0 192c35.3 0 64 28.7 64 64l320 0c0-35.3 28.7-64 64-64l0-192c-35.3 0-64-28.7-64-64L128 96c0 35.3-28.7 64-64 64zm224 192a48 48 0 1 1 0-96 48 48 0 1 1 0 96z" />
    </svg>
  );
}

function FaClipboardCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 384 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M192 0c-41.8 0-77.4 26.7-90.5 64L48 64C21.5 64 0 85.5 0 112l0 352c0 26.5 21.5 48 48 48l288 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48l-53.5 0C269.4 26.7 233.8 0 192 0zm0 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM305 273L177 401c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L271 239c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z" />
    </svg>
  );
}

function FaBox({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 448 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M50.7 58.5L0 160l208 0 0-128L93.7 32C75.5 32 58.9 42.5 50.7 58.5zM240 32l0 128 208 0L397.3 58.5C389.1 42.5 372.5 32 354.3 32L240 32zM448 192L0 192 0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-224z" />
    </svg>
  );
}

function FaChartPie({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 576 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M304 240l0-223.4c0-9 7-16.6 16-16.6C443.2 0 544 100.8 544 224c0 9-7.6 16-16.6 16L304 240zM240 70.4L240 272l201.6 0c.3 5.3 .4 10.6 .4 16c0 123.7-100.3 224-224 224S-6.4 411.7-6.4 288c0-117.4 90.6-213.6 206.4-223.6c9.1-.8 16.7 6.4 16.7 15.6l23.3-9.6z" />
    </svg>
  );
}

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const count = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: isoDate(from), to: isoDate(to) };
}

function SellerDashboardImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return <span className="seller-dashboard-image seller-dashboard-image--fallback">Ảnh</span>;
  return (
    <img
      className="seller-dashboard-image"
      src={marketplaceMediaUrl(src)}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}

export function SellerDashboard() {
  const { state, authenticatedFetch } = useAuthSession();
  const initial = useMemo(() => defaultRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [granularity, setGranularity] = useState<SellerAnalyticsGranularity>('DAY');
  const [data, setData] = useState<SellerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (state.status !== 'authenticated') return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSellerDashboard(authenticatedFetch, { from, to, granularity }));
    } catch (cause) {
      setError(
        cause instanceof RoleApiError
          ? (cause.problem?.detail ?? 'Không thể tải dashboard.')
          : 'Không thể tải dashboard.',
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, from, granularity, state.status, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (state.status !== 'authenticated') {
    return (
      <section className="operational-state">
        <h1>Dashboard seller</h1>
        <p>Vui lòng đăng nhập tài khoản seller để xem số liệu.</p>
      </section>
    );
  }

  const maxRevenue = Math.max(
    ...(data?.timeSeries.map((point) => point.merchandiseRevenueMinor) ?? [1]),
    1,
  );

  return (
    <section className="seller-dashboard-page">
      {/* Header & Filter Card */}
      <header className="seller-dashboard-heading">
        <div className="seller-dashboard-heading__info">
          <p className="seller-dashboard-eyebrow">KÊNH NGƯỜI BÁN</p>
          <h1>Tổng quan shop</h1>
          <p>
            Số liệu tiền hàng và vận hành theo múi giờ {data?.range.timeZone ?? 'Asia/Ho_Chi_Minh'}.
          </p>
        </div>
        <div className="seller-dashboard-filters">
          <div className="seller-dashboard-date">
            <span className="seller-filter-label">Từ ngày</span>
            <DateTimeLocalPicker
              mode="date"
              showClear={false}
              aria-label="Từ ngày"
              value={from}
              onChange={setFrom}
            />
          </div>
          <div className="seller-dashboard-date">
            <span className="seller-filter-label">Đến ngày</span>
            <DateTimeLocalPicker
              mode="date"
              showClear={false}
              aria-label="Đến ngày"
              value={to}
              onChange={setTo}
            />
          </div>
          <label className="seller-dashboard-select-label">
            <span className="seller-filter-label">Nhóm theo</span>
            <select
              value={granularity}
              onChange={(event) => setGranularity(event.target.value as SellerAnalyticsGranularity)}
              className="seller-filter-select"
            >
              <option value="DAY">Ngày</option>
              <option value="WEEK">Tuần</option>
              <option value="MONTH">Tháng</option>
            </select>
          </label>
          <button type="button" className="seller-filter-btn" onClick={() => void load()}>
            Cập nhật
          </button>
        </div>
      </header>

      {/* Loading & Error States */}
      {loading ? (
        <div className="seller-dashboard-loading" role="status">
          <span className="seller-spinner" aria-hidden="true" />
          <p className="seller-dashboard-state">Đang tải số liệu…</p>
        </div>
      ) : error ? (
        <div className="seller-dashboard-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : data ? (
        <>
          {/* Section: KPI Summary Cards */}
          <div className="seller-dashboard-kpis">
            <article className="seller-kpi-card seller-kpi-card--revenue">
              <div className="seller-kpi-card__head">
                <span>Tiền hàng</span>
                <div className="seller-kpi-icon seller-kpi-icon--revenue" aria-hidden="true">
                  <FaMoneyBillWave />
                </div>
              </div>
              <strong>{money(data.kpis.merchandiseRevenueMinor)}</strong>
              <small>Không bao gồm phí ship/quyết toán</small>
            </article>

            <article className="seller-kpi-card seller-kpi-card--orders">
              <div className="seller-kpi-card__head">
                <span>Đơn hợp lệ</span>
                <div className="seller-kpi-icon seller-kpi-icon--orders" aria-hidden="true">
                  <FaClipboardCheck />
                </div>
              </div>
              <strong>{count(data.kpis.eligibleOrderCount)}</strong>
              <small>Đã xác nhận, đang giao hoặc đã giao</small>
            </article>

            <article className="seller-kpi-card seller-kpi-card--units">
              <div className="seller-kpi-card__head">
                <span>Sản phẩm đã bán</span>
                <div className="seller-kpi-icon seller-kpi-icon--units" aria-hidden="true">
                  <FaBox />
                </div>
              </div>
              <strong>{count(data.kpis.unitsSold)}</strong>
              <small>Từ snapshot đơn hàng</small>
            </article>

            <article className="seller-kpi-card seller-kpi-card--conversion">
              <div className="seller-kpi-card__head">
                <span>Tỷ lệ chuyển đổi</span>
                <div className="seller-kpi-icon seller-kpi-icon--conversion" aria-hidden="true">
                  <FaChartPie />
                </div>
              </div>
              <strong>Chưa có dữ liệu</strong>
              <small>Chưa có tracking lượt truy cập</small>
            </article>
          </div>

          {/* Section: Chart & Top Selling Products */}
          <div className="seller-dashboard-grid">
            {/* Revenue Bar Chart */}
            <section className="seller-dashboard-panel seller-dashboard-chart">
              <div className="seller-dashboard-panel-heading">
                <h2>Doanh thu theo thời gian</h2>
                <span className="seller-panel-badge">
                  {data.range.from} → {data.range.to}
                </span>
              </div>
              <div className="seller-dashboard-bars" aria-label="Biểu đồ doanh thu">
                {data.timeSeries.map((point) => (
                  <div
                    className="seller-dashboard-bar"
                    key={point.bucket}
                    title={`${point.bucket}: ${money(point.merchandiseRevenueMinor)}`}
                  >
                    <span
                      style={{
                        height: `${Math.max(
                          3,
                          (point.merchandiseRevenueMinor / maxRevenue) * 100,
                        )}%`,
                      }}
                    />
                    <small>{point.bucket.slice(5)}</small>
                  </div>
                ))}
              </div>
            </section>

            {/* Top 10 Best Sellers */}
            <section className="seller-dashboard-panel">
              <div className="seller-dashboard-panel-heading">
                <h2>Sản phẩm bán chạy</h2>
                <span className="seller-panel-badge">Top 10</span>
              </div>
              {data.bestSellers.length ? (
                <ul className="seller-dashboard-list">
                  {data.bestSellers.map((item) => (
                    <li key={item.productId}>
                      <SellerDashboardImage src={item.productImageUrl} alt={item.productName} />
                      <div className="seller-product-item-info">
                        {item.currentProductAvailable ? (
                          <Link
                            href={`/products/${item.productId}`}
                            className="seller-product-link"
                          >
                            <strong>{item.productName}</strong>
                          </Link>
                        ) : (
                          <strong>{item.productName}</strong>
                        )}
                        <span>
                          {count(item.unitsSold)} sản phẩm · {money(item.merchandiseRevenueMinor)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="seller-dashboard-empty">
                  Chưa có đơn hợp lệ trong khoảng thời gian này.
                </p>
              )}
            </section>
          </div>

          {/* Section: Low Stock Warning */}
          <section className="seller-dashboard-panel">
            <div className="seller-dashboard-panel-heading">
              <h2>Sắp hết hàng</h2>
              <span className="seller-panel-badge">Ngưỡng ≤ {data.lowStock.threshold}</span>
            </div>
            {data.lowStock.items.length ? (
              <div className="seller-dashboard-low-stock">
                {data.lowStock.items.map((item) => (
                  <div key={item.variantId} className="seller-low-stock-item">
                    <SellerDashboardImage src={item.productImageUrl} alt={item.productName} />
                    <div className="seller-product-item-info">
                      <Link
                        href={`/seller/inventory?productId=${item.productId}`}
                        className="seller-product-link"
                      >
                        <strong>{item.productName}</strong>
                      </Link>
                      <span>
                        {item.variantName} · {item.sku}
                      </span>
                    </div>
                    <b className="seller-stock-badge">{count(item.availableQuantity)}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="seller-dashboard-empty">Không có biến thể nào sắp hết hàng.</p>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
