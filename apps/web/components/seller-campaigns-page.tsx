'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SellerCampaignDetail,
  SellerCampaignPage,
  SellerCampaignParticipationRequest,
} from '@shopee-clone/contracts';
import { ChevronDown } from '@shopee-clone/ui';
import {
  decideSellerCampaign,
  fetchSellerCampaign,
  fetchSellerCampaigns,
  withdrawSellerCampaign,
} from '../lib/campaigns-api';
import { RoleApiError } from '../lib/role-api';
import { useAuthSession } from './auth-session-provider';

const money = (value: number) => `₫${new Intl.NumberFormat('vi-VN').format(value)}`;
type RetryAction =
  | { kind: 'participation'; input: SellerCampaignParticipationRequest; idempotencyKey: string }
  | { kind: 'withdraw'; version: number; idempotencyKey: string };

export function SellerCampaignsPage({ campaignId }: { campaignId?: string }) {
  const { authenticatedFetch, state } = useAuthSession();
  const [page, setPage] = useState<SellerCampaignPage | null>(null);
  const [detail, setDetail] = useState<SellerCampaignDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(campaignId ?? null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [discounts, setDiscounts] = useState<Record<string, number>>({});
  const [typeFilter, setTypeFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [message, setMessage] = useState('');
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sellerAuthenticated = state.status === 'authenticated' && state.user.roles.includes('seller');

  const hydrateDetail = useCallback((value: SellerCampaignDetail) => {
    setDetail(value);
    setSelectedProductIds(
      value.eligibleProducts
        .filter((product) => product.submittedDiscountBasisPoints !== null)
        .map((product) => product.id),
    );
    setDiscounts(
      Object.fromEntries(
        value.eligibleProducts.map((product) => [
          product.id,
          product.submittedDiscountBasisPoints ?? value.minimumDiscountBasisPoints,
        ]),
      ),
    );
  }, []);

  const load = useCallback(async (cursor?: string) => {
    if (!sellerAuthenticated) return;
    const query = new URLSearchParams();
    if (typeFilter) query.set('typeCode', typeFilter);
    if (stateFilter) query.set('state', stateFilter);
    if (cursor) query.set('cursor', cursor);
    if (cursor) setLoadingMore(true);
    try {
      const result = await fetchSellerCampaigns(
        authenticatedFetch,
        query.toString() ? `?${query.toString()}` : '',
      );
      setPage((current) => cursor && current ? {
        items: [...current.items, ...result.items],
        nextCursor: result.nextCursor,
      } : result);
    } catch {
      setMessage('Không thể tải danh sách chiến dịch.');
    } finally {
      if (cursor) setLoadingMore(false);
    }
  }, [authenticatedFetch, sellerAuthenticated, stateFilter, typeFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected || state.status !== 'authenticated') return;
    void fetchSellerCampaign(authenticatedFetch, selected)
      .then(hydrateDetail)
      .catch(() => setMessage('Chiến dịch không khả dụng.'));
  }, [authenticatedFetch, hydrateDetail, selected, state.status]);

  const typeOptions = useMemo(
    () => [...new Map((page?.items ?? []).map((item) => [item.type.code, item.type.displayName])).entries()],
    [page],
  );

  const closeDetail = () => {
    setSelected(null);
    setDetail(null);
    setSelectedProductIds([]);
    setDiscounts({});
    setMessage('');
  };

  const respond = async (input: SellerCampaignParticipationRequest, idempotencyKey = crypto.randomUUID()) => {
    if (!detail) return;
    setRetryAction(null);
    try {
      await decideSellerCampaign(authenticatedFetch, detail.id, input, idempotencyKey);
      setMessage(input.decision === 'JOINED' ? 'Đã gửi lựa chọn tham gia.' : 'Đã ghi nhận từ chối.');
      await load();
      hydrateDetail(await fetchSellerCampaign(authenticatedFetch, detail.id));
    } catch (error) {
      if (error instanceof RoleApiError && error.status === 412) {
        hydrateDetail(await fetchSellerCampaign(authenticatedFetch, detail.id));
        setMessage('Chiến dịch đã thay đổi. Thông tin mới đã được tải lại, hãy kiểm tra rồi gửi lại.');
      } else {
        setRetryAction({ kind: 'participation', input, idempotencyKey });
        setMessage('Không thể cập nhật lựa chọn. Bạn có thể thử lại với cùng mã yêu cầu.');
      }
    }
  };

  const withdraw = async (idempotencyKey = crypto.randomUUID()) => {
    if (!detail?.participationVersion) return;
    const version = detail.participationVersion;
    setRetryAction(null);
    try {
      await withdrawSellerCampaign(authenticatedFetch, detail.id, version, idempotencyKey);
      setMessage('Đã rút khỏi chiến dịch.');
      await load();
      hydrateDetail(await fetchSellerCampaign(authenticatedFetch, detail.id));
    } catch (error) {
      if (error instanceof RoleApiError && error.status === 412) {
        hydrateDetail(await fetchSellerCampaign(authenticatedFetch, detail.id));
        setMessage('Chiến dịch đã thay đổi. Thông tin mới đã được tải lại.');
      } else {
        setRetryAction({ kind: 'withdraw', version, idempotencyKey });
        setMessage('Không thể rút khỏi chiến dịch. Bạn có thể thử lại với cùng mã yêu cầu.');
      }
    }
  };

  if (state.status !== 'authenticated') {
    return (
      <section className="operational-panel">
        <h1>Cần đăng nhập</h1>
        <Link href="/login">Đăng nhập</Link>
      </section>
    );
  }

  if (!state.user.roles.includes('seller')) {
    return (
      <section className="operational-panel">
        <h1>Chưa thể quản lý chiến dịch</h1>
        <p>Shop cần được duyệt và tài khoản phải có quyền seller.</p>
      </section>
    );
  }

  if (selected && detail) {
    const canRespond = detail.lifecycle === 'ENROLLMENT_OPEN';
    return (
      <section className="operational-panel seller-campaign-page">
        <button type="button" className="seller-campaign-back" onClick={closeDetail}>← Tất cả chiến dịch</button>
        <header>
          <span className="operational-eyebrow">
            {detail.type.displayName} · {detail.type.importanceClass === 'FEATURED' ? 'Nổi bật' : 'Tiêu chuẩn'}
          </span>
          <h1>{detail.title}</h1>
          <p>{detail.description}</p>
          <p>Thời gian: {new Date(detail.startsAt).toLocaleString('vi-VN')} – {new Date(detail.endsAt).toLocaleString('vi-VN')}</p>
          <p>{canRespond ? `Đăng ký đến ${new Date(detail.enrollmentEndsAt).toLocaleString('vi-VN')}.` : `Trạng thái: ${detail.lifecycle}.`}</p>
        </header>

        <section>
          <h2>Sản phẩm đủ điều kiện</h2>
          {detail.eligibleProducts.length ? (
            <div className="seller-campaign-products">
              {detail.eligibleProducts.map((product) => (
                <div className="seller-campaign-product-option" key={product.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      disabled={!canRespond || !product.eligible}
                      onChange={(event) => setSelectedProductIds((current) => event.target.checked ? [...new Set([...current, product.id])] : current.filter((id) => id !== product.id))}
                    />{' '}
                    <span>{product.name}</span>
                  </label>
                  <small>{money(product.basePriceMinor)} · giảm tối thiểu {detail.minimumDiscountBasisPoints / 100}%{product.reason ? ` · ${product.reason}` : ''}</small>
                  {product.eligible ? (
                    <label>
                      Mức giảm
                      <input
                        type="number"
                        min={detail.minimumDiscountBasisPoints / 100}
                        max={90}
                        step={0.1}
                        aria-label={`Mức giảm cho ${product.name}`}
                        value={(discounts[product.id] ?? detail.minimumDiscountBasisPoints) / 100}
                        disabled={!canRespond}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value)) return;
                          setDiscounts((current) => ({
                            ...current,
                            [product.id]: Math.max(detail.minimumDiscountBasisPoints, Math.min(9000, Math.round(value * 100))),
                          }));
                        }}
                      />%
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
          ) : <p>Chưa có sản phẩm phù hợp.</p>}
        </section>

        <div className="seller-campaign-actions">
          <button
            type="button"
            disabled={!canRespond || selectedProductIds.length === 0}
            onClick={() => {
              if (!window.confirm('Xác nhận cho shop tham gia chiến dịch?')) return;
              void respond({
                decision: 'JOINED',
                version: detail.participationVersion,
                products: detail.eligibleProducts
                  .filter((product) => product.eligible && selectedProductIds.includes(product.id))
                  .slice(0, 20)
                  .map((product) => ({ productId: product.id, discountBasisPoints: discounts[product.id] ?? detail.minimumDiscountBasisPoints })),
              });
            }}
          >Tham gia chiến dịch</button>
          <button
            type="button"
            disabled={!canRespond}
            onClick={() => {
              if (!window.confirm('Xác nhận không tham gia chiến dịch?')) return;
              void respond({ decision: 'DECLINED', version: detail.participationVersion });
            }}
          >Không tham gia</button>
          {detail.participationVersion && canRespond && detail.sellerState === 'JOINED' ? (
            <button type="button" onClick={() => { if (window.confirm('Xác nhận rút khỏi chiến dịch?')) void withdraw(); }}>Rút khỏi chiến dịch</button>
          ) : null}
        </div>
        {message ? <p role="status">{message}</p> : null}
        {retryAction ? (
          <button type="button" onClick={() => retryAction.kind === 'participation' ? void respond(retryAction.input, retryAction.idempotencyKey) : void withdraw(retryAction.idempotencyKey)}>
            Thử lại thao tác
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="operational-panel seller-campaign-page seller-campaign-page--list">
      <header>
        <span className="operational-eyebrow">Seller Center</span>
        <h1>Chiến dịch sàn</h1>
        <p>Chọn tham gia các chương trình phù hợp với sản phẩm của shop.</p>
      </header>
      {message ? <p role="alert">{message}</p> : null}
      <div className="seller-pl-toolbar seller-pl-toolbar--labeled seller-campaign-filters">
        <div className="seller-pl-toolbar__filters">
          <div className="seller-pl-field">
            <label htmlFor="seller-campaign-type">Loại</label>
            <div className="seller-pl-select-wrap">
              <select id="seller-campaign-type" className="seller-pl-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="">Tất cả</option>
                {typeOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="seller-pl-field">
            <label htmlFor="seller-campaign-state">Trạng thái</label>
            <div className="seller-pl-select-wrap">
              <select id="seller-campaign-state" className="seller-pl-select" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
                <option value="">Tất cả</option>
                <option value="AVAILABLE">Có thể tham gia</option>
                <option value="JOINED">Đã tham gia</option>
                <option value="UPCOMING">Sắp diễn ra</option>
                <option value="ACTIVE">Đang chạy</option>
                <option value="ENDED">Đã kết thúc</option>
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      {page?.items.length ? (
        <div className="seller-pl-table-stack seller-campaign-table-stack">
          <div className="seller-campaign-grid">
            {page.items.map((campaign) => (
              <button type="button" className="seller-campaign-card" key={campaign.id} onClick={() => setSelected(campaign.id)}>
                <span>{campaign.type.displayName} · {campaign.type.importanceClass === 'FEATURED' ? 'Nổi bật' : 'Tiêu chuẩn'}</span>
                <strong>{campaign.title}</strong>
                <small>{campaign.lifecycle} · nhận đăng ký đến {new Date(campaign.enrollmentEndsAt).toLocaleString('vi-VN')}</small>
                <b>{campaign.sellerState ?? 'Chưa phản hồi'}</b>
              </button>
            ))}
          </div>
          <footer className="seller-pl-footer seller-campaign-footer">
            <div className="seller-pl-footer__summary">Hiển thị <strong>{page.items.length}</strong> chiến dịch đã tải</div>
            {page.nextCursor ? (
              <button className="seller-pl-btn-loadmore" type="button" disabled={loadingMore} onClick={() => void load(page.nextCursor ?? undefined)}>
                {loadingMore ? 'Đang tải...' : 'Tải thêm chiến dịch'}
              </button>
            ) : <span className="seller-pl-footer__complete">Đã tải hết danh sách chiến dịch</span>}
          </footer>
        </div>
      ) : <p>{page ? 'Chưa có chiến dịch phù hợp.' : 'Đang tải chiến dịch...'}</p>}
    </section>
  );
}
