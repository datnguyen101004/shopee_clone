'use client';

import type {
  SellerAnalyticsMetricKey,
  SellerAnalyticsMetrics,
  SellerAnalyticsOverviewResponse,
  SellerAnalyticsPreset,
} from '@shopee-clone/contracts';
import { Eye } from '@shopee-clone/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSellerAnalyticsOverview } from '../lib/seller-analytics-api';
import { RoleApiError } from '../lib/role-api';
import { marketplaceMediaUrl } from '../lib/marketplace-media-url';
import { useAuthSession } from './auth-session-provider';
import { SellerPagination } from './seller/seller-pagination';

const MAX_CUSTOM_RANGE_DAYS = 31;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const SELLER_ANALYTICS_PRESET_OPTIONS: ReadonlyArray<{
  value: SellerAnalyticsPreset;
  label: string;
}> = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'last_7_days', label: '7 ngày qua' },
  { value: 'last_30_days', label: '30 ngày qua' },
];

export const SELLER_ANALYTICS_METRIC_KEYS: readonly SellerAnalyticsMetricKey[] = [
  'impressions',
  'productViews',
  'uniqueVisitors',
  'clicks',
  'ctr',
  'addToCart',
  'orders',
  'unitsSold',
  'revenue',
  'conversionRate',
];

const TREND_METRIC_KEYS: readonly SellerAnalyticsMetricKey[] = [
  'impressions',
  'productViews',
  'clicks',
  'orders',
  'revenue',
];

const METRIC_LABELS: Record<SellerAnalyticsMetricKey, string> = {
  impressions: 'Impressions',
  productViews: 'Product Views',
  uniqueVisitors: 'Unique Visitors',
  clicks: 'Clicks',
  ctr: 'CTR',
  addToCart: 'Add to Cart',
  orders: 'Orders',
  unitsSold: 'Units Sold',
  revenue: 'Revenue',
  conversionRate: 'Conversion Rate',
};

const RATE_KEYS = new Set<SellerAnalyticsMetricKey>(['ctr', 'conversionRate']);

export type SellerAnalyticsSelection =
  | { kind: 'preset'; preset: SellerAnalyticsPreset }
  | { kind: 'custom'; from: string; to: string };

export function isValidSellerAnalyticsDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidSellerAnalyticsRange(from: string, to: string, today = dateInShopTimeZone()): boolean {
  if (!isValidSellerAnalyticsDate(from) || !isValidSellerAnalyticsDate(to) || from > to) return false;
  if (!isValidSellerAnalyticsDate(today) || to > today) return false;
  const days = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  return days >= 1 && days <= MAX_CUSTOM_RANGE_DAYS;
}

function dateInShopTimeZone(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function subtractUtcDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function initialCustomRange(): { from: string; to: string } {
  const to = dateInShopTimeZone();
  return { from: subtractUtcDays(to, 6), to };
}

export function formatSellerAnalyticsMetric(
  key: SellerAnalyticsMetricKey,
  value: number,
): string {
  if (RATE_KEYS.has(key)) {
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value * 100)}%`;
  }
  if (key === 'revenue') {
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} ₫`;
  }
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function formatChange(change: number | 'new'): { label: string; tone: 'positive' | 'negative' | 'neutral' | 'new' } {
  if (change === 'new') return { label: 'Mới', tone: 'new' };
  if (change === 0) return { label: 'Không đổi', tone: 'neutral' };
  const value = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Math.abs(change));
  return { label: `${change > 0 ? '+' : '-'}${value}%`, tone: change > 0 ? 'positive' : 'negative' };
}

export function sellerAnalyticsChangeLabel(change: number | 'new'): string {
  const formatted = formatChange(change);
  if (formatted.tone === 'new') return 'Mới';
  if (formatted.tone === 'neutral') return 'Không đổi';
  return `${formatted.tone === 'positive' ? 'Tăng' : 'Giảm'} ${formatted.label.replace(/^[-+]/, '')}`;
}

function metricComparison(metric: { change: number | 'new' }) {
  const formatted = formatChange(metric.change);
  return (
    <span
      className={`seller-analytics-comparison seller-analytics-comparison--${formatted.tone}`}
      data-change={formatted.tone === 'new' ? 'new' : formatted.label}
      aria-label={sellerAnalyticsChangeLabel(metric.change)}
    >
      <span aria-hidden="true">{formatted.tone === 'positive' ? '↗' : formatted.tone === 'negative' ? '↘' : formatted.tone === 'new' ? '✦' : '→'}</span>
      {formatted.label}
    </span>
  );
}

function metricValue(metrics: SellerAnalyticsMetrics, key: SellerAnalyticsMetricKey): string {
  return formatSellerAnalyticsMetric(key, metrics[key].current);
}

function errorMessage(error: unknown): string {
  if (error instanceof RoleApiError && error.problem?.detail) return error.problem.detail;
  return 'Không thể tải dữ liệu phân tích lúc này.';
}

function formatTrendBucket(value: string, interval: 'hour' | 'day'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', interval === 'hour'
    ? { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(date);
}

function SummaryCards({ metrics }: { metrics: SellerAnalyticsMetrics }) {
  return (
    <section className="seller-analytics-section" aria-labelledby="seller-analytics-summary-heading">
      <div className="seller-analytics-section-heading">
        <div>
          <h2 id="seller-analytics-summary-heading">Tổng quan chỉ số</h2>
          <p>So sánh với khoảng thời gian liền trước có cùng độ dài.</p>
        </div>
      </div>
      <div className="seller-analytics-kpis">
        {SELLER_ANALYTICS_METRIC_KEYS.map((key) => {
          const metric = metrics[key];
          return (
            <article className="seller-analytics-kpi" key={key} data-testid={`seller-analytics-kpi-${key}`}>
              <span className="seller-analytics-kpi__label">{METRIC_LABELS[key]}</span>
              <strong className="seller-analytics-kpi__value">{metricValue(metrics, key)}</strong>
              <span className="seller-analytics-kpi__previous">Kỳ trước: {formatSellerAnalyticsMetric(key, metric.previous)}</span>
              <div className="seller-analytics-kpi__comparison">
                {metricComparison(metric)}
                <span className="seller-analytics-kpi__comparison-label">so với kỳ trước</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TrendPanel({ data }: { data: SellerAnalyticsOverviewResponse }) {
  const buckets = data.trend.buckets;
  const maxValues = TREND_METRIC_KEYS.reduce<Record<string, number>>((result, key) => {
    result[key] = Math.max(...buckets.map((bucket) => bucket.metrics[key].current), 1);
    return result;
  }, {});
  const chartDescription = data.trend.interval === 'hour' ? 'theo giờ' : 'theo ngày';

  return (
    <section className="seller-analytics-panel seller-analytics-trend" aria-labelledby="seller-analytics-trend-heading">
      <div className="seller-analytics-section-heading">
        <div>
          <h2 id="seller-analytics-trend-heading">Xu hướng theo thời gian</h2>
          <p>Biểu đồ {chartDescription} cho các bước phễu và thương mại.</p>
          <p className="seller-analytics-trend-note">Chiều cao cột được chuẩn hóa riêng theo từng chỉ số; không dùng để so sánh độ lớn tuyệt đối giữa các chỉ số.</p>
        </div>
        <span className="seller-analytics-panel-badge">{buckets.length} mốc</span>
      </div>
      {buckets.length === 0 ? (
        <p className="seller-analytics-empty">Chưa có dữ liệu xu hướng trong khoảng thời gian này.</p>
      ) : (
        <>
          <div className="seller-analytics-legend" aria-label="Chú giải biểu đồ">
            {TREND_METRIC_KEYS.map((key) => <span key={key}><i className={`seller-analytics-legend__swatch seller-analytics-legend__swatch--${key}`} aria-hidden="true" />{METRIC_LABELS[key]}</span>)}
          </div>
          <div className="seller-analytics-chart-scroll">
            <div className="seller-analytics-chart" role="list" aria-label={`Biểu đồ xu hướng ${chartDescription}`}>
              {buckets.map((bucket) => {
                const label = formatTrendBucket(bucket.bucketStart, data.trend.interval);
                return (
                  <div className="seller-analytics-chart__bucket" role="listitem" key={bucket.bucketStart}>
                    <div
                      className="seller-analytics-chart__bars"
                      aria-label={`${label}: ${TREND_METRIC_KEYS.map((key) => `${METRIC_LABELS[key]} ${metricValue(bucket.metrics, key)}`).join(', ')}`}
                    >
                      {TREND_METRIC_KEYS.map((key) => (
                        <span
                          className={`seller-analytics-chart__bar seller-analytics-chart__bar--${key}`}
                          key={key}
                          style={{ height: `${Math.max(4, Math.round((bucket.metrics[key].current / (maxValues[key] ?? 1)) * 100))}%` }}
                          title={`${METRIC_LABELS[key]}: ${metricValue(bucket.metrics, key)}`}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <span className="seller-analytics-chart__label">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <details className="seller-analytics-trend-details">
            <summary>Xem dữ liệu xu hướng</summary>
            <div className="seller-analytics-trend-table-scroll">
              <table aria-label="Dữ liệu xu hướng theo thời gian">
                <thead><tr><th>Mốc</th>{SELLER_ANALYTICS_METRIC_KEYS.map((key) => <th key={key}>{METRIC_LABELS[key]}</th>)}</tr></thead>
                <tbody>
                  {buckets.map((bucket) => <tr key={`table-${bucket.bucketStart}`}><th scope="row">{formatTrendBucket(bucket.bucketStart, data.trend.interval)}</th>{SELLER_ANALYTICS_METRIC_KEYS.map((key) => <td key={key}>{metricValue(bucket.metrics, key)}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

function ProductTable({
  data,
  loading,
  onPageChange,
}: {
  data: SellerAnalyticsOverviewResponse;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const { products } = data;
  return (
    <section className="seller-analytics-panel seller-analytics-products" aria-labelledby="seller-analytics-products-heading">
      <div className="seller-analytics-section-heading">
        <div>
          <h2 id="seller-analytics-products-heading">Hiệu quả theo sản phẩm</h2>
          <p>Đủ 10 chỉ số và so sánh kỳ trước cho từng sản phẩm.</p>
        </div>
        <span className="seller-analytics-panel-badge">{products.totalItems} sản phẩm</span>
      </div>
      {products.items.length === 0 ? (
        <div className="seller-analytics-empty seller-analytics-empty--products">
          <strong>Chưa có dữ liệu sản phẩm</strong>
          <span>Shop chưa phát sinh hoạt động trong khoảng thời gian này.</span>
          <Link href="/seller/products" className="seller-pl-btn seller-pl-btn--secondary">Quản lý sản phẩm</Link>
        </div>
      ) : (
        <>
          <div className="seller-analytics-products-scroll">
            <table className="seller-management-table seller-analytics-products-table" aria-label="Hiệu quả theo sản phẩm">
              <thead><tr><th className="seller-analytics-products-table__name">Sản phẩm</th>{SELLER_ANALYTICS_METRIC_KEYS.map((key) => <th key={key}>{METRIC_LABELS[key]}</th>)}<th>Thao tác</th></tr></thead>
              <tbody>
                {products.items.map((product) => (
                  <tr key={product.productId}>
                    <th scope="row" className="seller-analytics-products-table__product">
                      <div className="seller-analytics-product-copy">
                        {product.productImageUrl ? (
                          // The marketplace URL can be an arbitrary CDN/API media URL; the existing
                          // media helper owns that mapping, so Next Image cannot safely optimize it.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={marketplaceMediaUrl(product.productImageUrl)} alt="" />
                        ) : <span className="seller-analytics-product-copy__placeholder" aria-hidden="true">Ảnh</span>}
                        <span><strong>{product.productName}</strong><small>{product.productId}</small></span>
                      </div>
                    </th>
                    {SELLER_ANALYTICS_METRIC_KEYS.map((key) => <td key={key}><span>{metricValue(product.metrics, key)}</span>{metricComparison(product.metrics[key])}</td>)}
                    <td className="seller-analytics-products-table__actions">
                      <Link className="seller-pl-btn-icon" href={`/seller/products/${product.productId}`} aria-label={`Xem sản phẩm ${product.productName}`} title={`Xem sản phẩm ${product.productName}`}>
                        <Eye aria-hidden="true" size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SellerPagination itemLabel="sản phẩm" page={products.page} pageSize={products.pageSize} totalItems={products.totalItems} totalPages={products.totalPages} disabled={loading} onPageChange={onPageChange} />
        </>
      )}
    </section>
  );
}

export function SellerAnalyticsOverview() {
  const { state, authenticatedFetch } = useAuthSession();
  const customInitial = useMemo(() => initialCustomRange(), []);
  const shopToday = useMemo(() => dateInShopTimeZone(), []);
  const [selection, setSelection] = useState<SellerAnalyticsSelection>({ kind: 'preset', preset: 'last_7_days' });
  const [customFrom, setCustomFrom] = useState(customInitial.from);
  const [customTo, setCustomTo] = useState(customInitial.to);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SellerAnalyticsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);
  const requestVersion = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const selectPreset = useCallback((preset: SellerAnalyticsPreset) => {
    setLoading(true);
    setError('');
    setData(null);
    setSelection({ kind: 'preset', preset });
    setPage(1);
  }, []);

  const applyCustomRange = useCallback(() => {
    if (!isValidSellerAnalyticsRange(customFrom, customTo, shopToday)) return;
    setLoading(true);
    setError('');
    setData(null);
    setSelection({ kind: 'custom', from: customFrom, to: customTo });
    setPage(1);
  }, [customFrom, customTo, shopToday]);

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const currentVersion = ++requestVersion.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    const input = selection.kind === 'preset'
      ? { preset: selection.preset, page, pageSize: 10 }
      : { from: selection.from, to: selection.to, page, pageSize: 10 };
    void fetchSellerAnalyticsOverview(authenticatedFetch, input, { signal: nextController.signal })
      .then((response) => {
        if (currentVersion !== requestVersion.current) return;
        setData(response);
      })
      .catch((cause: unknown) => {
        if (currentVersion !== requestVersion.current || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (currentVersion === requestVersion.current) setLoading(false);
      });
    return () => nextController.abort();
  }, [authenticatedFetch, page, retryVersion, selection, state.status]);

  if (state.status === 'loading') {
    return <section className="seller-analytics-page"><div className="seller-analytics-state" role="status" aria-busy="true">Đang kiểm tra quyền người bán…</div></section>;
  }

  if (state.status !== 'authenticated') {
    return (
      <section className="seller-analytics-page">
        <div className="seller-analytics-state">
          <h2>Cần đăng nhập</h2>
          <p>Đăng nhập tài khoản người bán để xem số liệu phân tích.</p>
          <Link href="/login" className="seller-pl-btn seller-pl-btn--primary">Đăng nhập</Link>
        </div>
      </section>
    );
  }

  const customRangeValid = isValidSellerAnalyticsRange(customFrom, customTo, shopToday);
  return (
    <section className="seller-analytics-page" data-testid="seller-analytics-page">
      <header className="seller-analytics-heading">
        <div>
          <p className="seller-analytics-eyebrow">KÊNH NGƯỜI BÁN</p>
          <h2>Phân tích shop</h2>
          <p>Theo dõi phễu sản phẩm, đơn hàng và doanh thu theo thời gian.</p>
        </div>
        <Link href="/seller/products" className="seller-pl-btn seller-pl-btn--secondary">Quản lý sản phẩm</Link>
      </header>

      <form className="seller-analytics-filters" aria-label="Khoảng thời gian phân tích" onSubmit={(event) => { event.preventDefault(); applyCustomRange(); }}>
        <div className="seller-analytics-presets" role="group" aria-label="Khoảng thời gian có sẵn">
          {SELLER_ANALYTICS_PRESET_OPTIONS.map((option) => <button key={option.value} type="button" className={selection.kind === 'preset' && selection.preset === option.value ? 'is-active' : undefined} aria-pressed={selection.kind === 'preset' && selection.preset === option.value} onClick={() => selectPreset(option.value)}>{option.label}</button>)}
        </div>
        <div className="seller-analytics-custom-range">
          <label htmlFor="seller-analytics-from">Từ ngày</label>
          <input id="seller-analytics-from" type="date" value={customFrom} max={shopToday} onChange={(event) => setCustomFrom(event.target.value)} />
          <label htmlFor="seller-analytics-to">Đến ngày</label>
          <input id="seller-analytics-to" type="date" value={customTo} min={customFrom} max={shopToday} onChange={(event) => setCustomTo(event.target.value)} />
          <button type="submit" className="seller-pl-btn seller-pl-btn--primary" disabled={!customRangeValid}>Áp dụng</button>
        </div>
        {!customRangeValid ? <p className="seller-analytics-filter-error" role="alert">Chọn khoảng ngày hợp lệ từ 1 đến 31 ngày.</p> : <p className="seller-analytics-filter-hint">Múi giờ shop · tối đa 31 ngày</p>}
      </form>

      {loading ? <div className="seller-analytics-state" role="status" aria-busy="true">Đang tải dữ liệu phân tích…</div> : error ? (
        <div className="seller-analytics-state" role="alert"><p>{error}</p><button type="button" className="seller-pl-btn seller-pl-btn--secondary" onClick={() => { setLoading(true); setError(''); setData(null); setRetryVersion((value) => value + 1); }}>Thử lại</button></div>
      ) : data ? (
        <>
          <p className="seller-analytics-freshness" role="status">Cập nhật lúc {new Intl.DateTimeFormat('vi-VN', { timeZone: data.range.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.generatedAt))} · Dữ liệu gần thời gian thực</p>
          <SummaryCards metrics={data.summary} />
          <TrendPanel data={data} />
          <ProductTable data={data} loading={loading} onPageChange={(nextPage) => { setLoading(true); setError(''); setData(null); setPage(nextPage); }} />
        </>
      ) : null}
    </section>
  );
}
