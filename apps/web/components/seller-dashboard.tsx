'use client';

import type { SellerAnalyticsGranularity, SellerDashboardResponse } from '@shopee-clone/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchSellerDashboard } from '../lib/seller-analytics-api';
import { RoleApiError } from '../lib/role-api';
import { DateTimeLocalPicker } from './datetime-local-picker';
import { useAuthSession } from './auth-session-provider';

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
  if (!src || failed) return <span className="seller-dashboard-image seller-dashboard-image--fallback">Ảnh</span>;
  return <img className="seller-dashboard-image" src={src} alt={alt} onError={() => setFailed(true)} />;
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
    setLoading(true); setError(null);
    try { setData(await fetchSellerDashboard(authenticatedFetch, { from, to, granularity })); }
    catch (cause) { setError(cause instanceof RoleApiError ? cause.problem?.detail ?? 'Không thể tải dashboard.' : 'Không thể tải dashboard.'); }
    finally { setLoading(false); }
  }, [authenticatedFetch, from, granularity, state.status, to]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (state.status !== 'authenticated') return <section className="operational-state"><h1>Dashboard seller</h1><p>Vui lòng đăng nhập tài khoản seller để xem số liệu.</p></section>;
  const maxRevenue = Math.max(...(data?.timeSeries.map((point) => point.merchandiseRevenueMinor) ?? [1]), 1);
  return <section className="seller-dashboard-page">
    <header className="seller-dashboard-heading"><div><p className="seller-dashboard-eyebrow">SELLER CENTER</p><h1>Tổng quan shop</h1><p>Số liệu tiền hàng và vận hành theo múi giờ {data?.range.timeZone ?? 'Asia/Ho_Chi_Minh'}.</p></div><div className="seller-dashboard-filters"><div className="seller-dashboard-date">Từ ngày<DateTimeLocalPicker mode="date" showClear={false} aria-label="Từ ngày" value={from} onChange={setFrom} /></div><div className="seller-dashboard-date">Đến ngày<DateTimeLocalPicker mode="date" showClear={false} aria-label="Đến ngày" value={to} onChange={setTo} /></div><label>Nhóm theo<select value={granularity} onChange={(event) => setGranularity(event.target.value as SellerAnalyticsGranularity)}><option value="DAY">Ngày</option><option value="WEEK">Tuần</option><option value="MONTH">Tháng</option></select></label><button type="button" onClick={() => void load()}>Cập nhật</button></div></header>
    {loading ? <p className="seller-dashboard-state">Đang tải số liệu…</p> : error ? <div className="seller-dashboard-error"><p>{error}</p><button type="button" onClick={() => void load()}>Thử lại</button></div> : data ? <>
      <div className="seller-dashboard-kpis"><article><span>Tiền hàng</span><strong>{money(data.kpis.merchandiseRevenueMinor)}</strong><small>Không bao gồm phí ship/quyết toán</small></article><article><span>Đơn hợp lệ</span><strong>{count(data.kpis.eligibleOrderCount)}</strong><small>Đã xác nhận, đang giao hoặc đã giao</small></article><article><span>Sản phẩm đã bán</span><strong>{count(data.kpis.unitsSold)}</strong><small>Từ snapshot đơn hàng</small></article><article><span>Conversion</span><strong>Chưa có dữ liệu</strong><small>Chưa có tracking lượt truy cập</small></article></div>
      <div className="seller-dashboard-grid"><section className="seller-dashboard-panel seller-dashboard-chart"><div className="seller-dashboard-panel-heading"><h2>Doanh thu theo thời gian</h2><span>{data.range.from} → {data.range.to}</span></div><div className="seller-dashboard-bars" aria-label="Biểu đồ doanh thu">{data.timeSeries.map((point) => <div className="seller-dashboard-bar" key={point.bucket} title={`${point.bucket}: ${money(point.merchandiseRevenueMinor)}`}><span style={{ height: `${Math.max(3, point.merchandiseRevenueMinor / maxRevenue * 100)}%` }} /><small>{point.bucket.slice(5)}</small></div>)}</div></section><section className="seller-dashboard-panel"><div className="seller-dashboard-panel-heading"><h2>Sản phẩm bán chạy</h2><span>Top 10</span></div>{data.bestSellers.length ? <ul className="seller-dashboard-list">{data.bestSellers.map((item) => <li key={item.productId}><SellerDashboardImage src={item.productImageUrl} alt={item.productName} /><div>{item.currentProductAvailable ? <Link href={`/products/${item.productId}`}><strong>{item.productName}</strong></Link> : <strong>{item.productName}</strong>}<span>{count(item.unitsSold)} sản phẩm · {money(item.merchandiseRevenueMinor)}</span></div></li>)}</ul> : <p className="seller-dashboard-empty">Chưa có đơn hợp lệ trong khoảng thời gian này.</p>}</section></div>
      <section className="seller-dashboard-panel"><div className="seller-dashboard-panel-heading"><h2>Sắp hết hàng</h2><span>Ngưỡng ≤ {data.lowStock.threshold}</span></div>{data.lowStock.items.length ? <div className="seller-dashboard-low-stock">{data.lowStock.items.map((item) => <div key={item.variantId}><SellerDashboardImage src={item.productImageUrl} alt={item.productName} /><div><Link href={`/seller/inventory?productId=${item.productId}`}><strong>{item.productName}</strong></Link><span>{item.variantName} · {item.sku}</span></div><b>{count(item.availableQuantity)}</b></div>)}</div> : <p className="seller-dashboard-empty">Không có biến thể nào sắp hết hàng.</p>}</section>
    </> : null}
  </section>;
}
