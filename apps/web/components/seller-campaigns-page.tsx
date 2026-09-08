'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SellerCampaignDetail,
  SellerCampaignPage,
  SellerCampaignParticipationRequest,
} from '@shopee-clone/contracts';
import { Check, ChevronDown, Eye, X } from '@shopee-clone/ui';
import {
  decideSellerCampaign,
  fetchSellerCampaign,
  fetchSellerCampaigns,
  withdrawSellerCampaign,
} from '../lib/campaigns-api';
import { RoleApiError } from '../lib/role-api';
import { useAuthSession } from './auth-session-provider';
import type { SellerFlashSaleProductGroup } from '../lib/flash-sale-types';
import { fetchSellerFlashSaleSnapshot, type SellerFlashSaleProductMetadata } from '../lib/flash-sale-api';
import { SellerFlashSaleSkuTable } from './seller-flash-sale/seller-flash-sale-sku-table';
import { SellerPagination } from './seller/seller-pagination';

const money = (value: number) => `₫${new Intl.NumberFormat('vi-VN').format(value)}`;
const dateOnly = (value: string) => new Date(value).toLocaleDateString('vi-VN');
const dateTime = (value: string) => new Date(value).toLocaleString('vi-VN');

function sellerCampaignStateLabel(state?: string) {
  switch (state) {
    case 'JOINED':
      return 'Đã tham gia';
    case 'DECLINED':
      return 'Đã từ chối';
    case 'WITHDRAWN':
      return 'Đã rút';
    case 'LOCKED':
      return 'Đã chốt';
    default:
      return 'Chưa phản hồi';
  }
}

function campaignLifecycleLabel(state: string) {
  switch (state) {
    case 'ANNOUNCED':
      return 'Đã công bố';
    case 'ENROLLMENT_OPEN':
      return 'Đang nhận đăng ký';
    case 'SCHEDULED':
      return 'Đã lên lịch';
    case 'ACTIVE':
      return 'Đang diễn ra';
    case 'ENDED':
      return 'Đã kết thúc';
    case 'CANCELLED':
      return 'Đã hủy';
    default:
      return state;
  }
}
type RetryAction =
  | { kind: 'participation'; input: SellerCampaignParticipationRequest; idempotencyKey: string }
  | { kind: 'withdraw'; version: number; idempotencyKey: string };

export function SellerCampaignsPage({ campaignId }: { campaignId?: string }) {
  const { authenticatedFetch, state } = useAuthSession();
  const [page, setPage] = useState<SellerCampaignPage | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [detail, setDetail] = useState<SellerCampaignDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(campaignId ?? null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [discounts, setDiscounts] = useState<Record<string, number>>({});
  const [flashSaleGroups, setFlashSaleGroups] = useState<SellerFlashSaleProductGroup[]>([]);
  const [flashSaleVersion, setFlashSaleVersion] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [message, setMessage] = useState('');
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);
  const [actionPending, setActionPending] = useState(false);
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

  const load = useCallback(async (targetPage = 1) => {
    if (!sellerAuthenticated) return;
    const query = new URLSearchParams();
    if (typeFilter) query.set('typeCode', typeFilter);
    if (stateFilter) query.set('state', stateFilter);
    query.set('page', String(targetPage));
    try {
      const result = await fetchSellerCampaigns(
        authenticatedFetch,
        query.toString() ? `?${query.toString()}` : '',
      );
      const lastPage = Math.max(1, result.totalPages);
      if (targetPage > lastPage) { setCurrentPage(lastPage); return; }
      setPage(result);
      setCurrentPage(result.page);
    } catch {
      setMessage('Không thể tải danh sách chiến dịch.');
    }
  }, [authenticatedFetch, sellerAuthenticated, stateFilter, typeFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(currentPage);
  }, [currentPage, load]);

  const loadFlashSale = useCallback(
    async (campId: string, metadata: Record<string, SellerFlashSaleProductMetadata> = {}) => {
      try {
        const snapshot = await fetchSellerFlashSaleSnapshot(authenticatedFetch, campId, metadata);
        setFlashSaleGroups(snapshot.groups);
        setFlashSaleVersion(snapshot.version);
      } catch {
        setFlashSaleGroups([]);
        setFlashSaleVersion(0);
      }
    },
    [authenticatedFetch],
  );

  useEffect(() => {
    if (!selected || state.status !== 'authenticated') return;
    void fetchSellerCampaign(authenticatedFetch, selected)
      .then((val) => {
        hydrateDetail(val);
        if (val.type.code === 'FLASH_SALE') {
          void loadFlashSale(
            val.id,
            Object.fromEntries(
              val.eligibleProducts.map((product) => [product.id, {
                name: product.name,
                slug: product.slug,
                imageUrl: product.imageUrl,
              }]),
            ),
          );
        }
      })
      .catch(() => setMessage('Chiến dịch không khả dụng.'));
  }, [authenticatedFetch, hydrateDetail, loadFlashSale, selected, state.status]);

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
    if (!detail || actionPending) return;
    setRetryAction(null);
    setActionPending(true);
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
    } finally {
      setActionPending(false);
    }
  };

  const withdraw = async (idempotencyKey = crypto.randomUUID()) => {
    if (!detail?.participationVersion || actionPending) return;
    const version = detail.participationVersion;
    setRetryAction(null);
    setActionPending(true);
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
    } finally {
      setActionPending(false);
    }
  };

  const declineFromList = async (campaignId: string, campaignTitle: string) => {
    if (actionPending) return;
    if (!window.confirm(`Xác nhận từ chối chiến dịch ${campaignTitle}?`)) return;
    setMessage('');
    setActionPending(true);
    try {
      const campaignDetail = await fetchSellerCampaign(authenticatedFetch, campaignId);
      await decideSellerCampaign(
        authenticatedFetch,
        campaignId,
        { decision: 'DECLINED', version: campaignDetail.participationVersion },
        crypto.randomUUID(),
      );
      setMessage(`Đã từ chối chiến dịch ${campaignTitle}.`);
      await load(currentPage);
    } catch (error) {
      if (error instanceof RoleApiError && error.status === 412) {
        setMessage('Chiến dịch đã thay đổi. Danh sách mới đã được tải lại, hãy kiểm tra rồi thử lại.');
        await load(currentPage);
      } else {
        setMessage(`Không thể từ chối chiến dịch ${campaignTitle}. Vui lòng thử lại.`);
      }
    } finally {
      setActionPending(false);
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
    const flashSaleJoined = detail.sellerState === 'JOINED' || detail.sellerState === 'LOCKED';
    const canAddFlashSaleSku = flashSaleJoined && ['ENROLLMENT_OPEN', 'SCHEDULED'].includes(detail.lifecycle);
    return (
      <section className="seller-campaign-page seller-campaign-page--detail">
        <button type="button" className="seller-pl-btn seller-pl-btn--secondary seller-campaign-back" onClick={closeDetail}>← Tất cả chiến dịch</button>
        <header className="seller-campaign-detail__header">
          <span className="operational-eyebrow">
            {detail.type.displayName} · {detail.type.importanceClass === 'FEATURED' ? 'Nổi bật' : 'Tiêu chuẩn'}
          </span>
          <h1>{detail.title}</h1>
          <p>{detail.description}</p>
          <dl className="seller-campaign-detail__facts">
            <div>
              <dt>Thời gian diễn ra</dt>
              <dd>{dateTime(detail.startsAt)} – {dateTime(detail.endsAt)}</dd>
            </div>
            <div>
              <dt>Hạn đăng ký</dt>
              <dd>{dateTime(detail.enrollmentEndsAt)}</dd>
            </div>
            <div>
              <dt>Giảm tối thiểu</dt>
              <dd>{detail.minimumDiscountBasisPoints / 100}%</dd>
            </div>
            <div>
              <dt>Trạng thái</dt>
              <dd>{campaignLifecycleLabel(detail.lifecycle)}</dd>
            </div>
          </dl>
        </header>

        {detail.type.code === 'FLASH_SALE' ? (
          <div className="seller-campaign-detail__flash-sale">
            {canRespond && !flashSaleJoined ? (
              <div className="seller-campaign-actions seller-campaign-actions--flash-sale">
                <p>Hãy xác nhận tham gia trước khi đăng ký các SKU Flash Sale của shop.</p>
                <button
                  type="button"
                  className="seller-pl-btn seller-pl-btn--primary"
                  disabled={actionPending}
                  onClick={() => {
                    if (!window.confirm('Xác nhận cho shop tham gia chiến dịch Flash Sale?')) return;
                    void respond({
                      decision: 'JOINED',
                      version: detail.participationVersion,
                      products: [],
                    });
                  }}
                >
                  Xác nhận tham gia chiến dịch
                </button>
              </div>
            ) : null}
            <SellerFlashSaleSkuTable
              campaignId={detail.id}
              campaignTitle={detail.title}
              campaignLifecycle={detail.lifecycle}
              minimumDiscountBasisPoints={detail.minimumDiscountBasisPoints}
              groups={flashSaleGroups}
              campaignVersion={flashSaleVersion}
              availableProductIds={detail.eligibleProducts.map((product) => product.id)}
              canEnroll={canAddFlashSaleSku}
              onRefresh={async () => {
                await loadFlashSale(
                  detail.id,
                  Object.fromEntries(
                    detail.eligibleProducts.map((product) => [product.id, {
                      name: product.name,
                      slug: product.slug,
                      imageUrl: product.imageUrl,
                    }]),
                  ),
                );
              }}
            />
          </div>
        ) : (
          <>
            <section className="seller-campaign-detail__products">
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
                          onChange={(event) =>
                            setSelectedProductIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, product.id])]
                                : current.filter((id) => id !== product.id),
                            )
                          }
                        />{' '}
                        <span>{product.name}</span>
                      </label>
                      <small>
                        {money(product.basePriceMinor)} · giảm tối thiểu{' '}
                        {detail.minimumDiscountBasisPoints / 100}%
                        {product.reason ? ` · ${product.reason}` : ''}
                      </small>
                      {product.eligible ? (
                        <label>
                          Mức giảm
                          <input
                            type="number"
                            min={detail.minimumDiscountBasisPoints / 100}
                            max={90}
                            step={0.1}
                            aria-label={`Mức giảm cho ${product.name}`}
                            value={
                              (discounts[product.id] ?? detail.minimumDiscountBasisPoints) / 100
                            }
                            disabled={!canRespond}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (!Number.isFinite(value)) return;
                              setDiscounts((current) => ({
                                ...current,
                                [product.id]: Math.max(
                                  detail.minimumDiscountBasisPoints,
                                  Math.min(9000, Math.round(value * 100)),
                                ),
                              }));
                            }}
                          />
                          %
                        </label>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p>Chưa có sản phẩm phù hợp.</p>
              )}
            </section>

            <div className="seller-campaign-actions">
              <button
                type="button"
                className="seller-pl-btn seller-pl-btn--primary"
                disabled={actionPending || !canRespond || selectedProductIds.length === 0}
                onClick={() => {
                  if (!window.confirm('Xác nhận cho shop tham gia chiến dịch?')) return;
                  void respond({
                    decision: 'JOINED',
                    version: detail.participationVersion,
                    products: detail.eligibleProducts
                      .filter((product) => product.eligible && selectedProductIds.includes(product.id))
                      .slice(0, 20)
                      .map((product) => ({
                        productId: product.id,
                        discountBasisPoints:
                          discounts[product.id] ?? detail.minimumDiscountBasisPoints,
                      })),
                  });
                }}
              >
                Tham gia chiến dịch
              </button>
              <button
                type="button"
                className="seller-pl-btn seller-pl-btn--danger"
                disabled={actionPending || !canRespond}
                onClick={() => {
                  if (!window.confirm('Xác nhận không tham gia chiến dịch?')) return;
                  void respond({ decision: 'DECLINED', version: detail.participationVersion });
                }}
              >
                Không tham gia
              </button>
              {detail.participationVersion && canRespond && detail.sellerState === 'JOINED' ? (
                <button
                  type="button"
                  className="seller-pl-btn seller-pl-btn--danger"
                  disabled={actionPending}
                  onClick={() => {
                    if (window.confirm('Xác nhận rút khỏi chiến dịch?')) void withdraw();
                  }}
                >
                  Rút khỏi chiến dịch
                </button>
              ) : null}
            </div>
          </>
        )}
        {message ? <p role="status">{message}</p> : null}
        {retryAction ? (
          <button className="seller-pl-btn seller-pl-btn--secondary seller-campaign-retry" type="button" onClick={() => retryAction.kind === 'participation' ? void respond(retryAction.input, retryAction.idempotencyKey) : void withdraw(retryAction.idempotencyKey)}>
            Thử lại thao tác
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="seller-campaign-page seller-campaign-page--list">
      {message ? <p role="alert">{message}</p> : null}
      <div className="seller-pl-toolbar seller-pl-toolbar--labeled seller-campaign-filters">
        <div className="seller-pl-toolbar__filters">
          <div className="seller-pl-field">
            <label htmlFor="seller-campaign-type">Loại</label>
            <div className="seller-pl-select-wrap">
              <select id="seller-campaign-type" className="seller-pl-select" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setCurrentPage(1); }}>
                <option value="">Tất cả</option>
                {typeOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="seller-pl-field">
            <label htmlFor="seller-campaign-state">Trạng thái</label>
            <div className="seller-pl-select-wrap">
              <select id="seller-campaign-state" className="seller-pl-select" value={stateFilter} onChange={(event) => { setStateFilter(event.target.value); setCurrentPage(1); }}>
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
          <div className="seller-pl-table-card seller-campaign-table-card">
            <div className="seller-pl-table-scroll">
              <table className="seller-pl-table seller-management-table seller-campaign-table" aria-label="Danh sách chiến dịch dành cho người bán">
                <thead>
                  <tr>
                    <th scope="col" className="management-table-id-cell">ID</th>
                    <th scope="col">Chiến dịch</th>
                    <th scope="col">Loại</th>
                    <th scope="col">Thời gian diễn ra</th>
                    <th scope="col">Hạn đăng ký</th>
                    <th scope="col">Giảm tối thiểu</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((campaign) => (
                    <tr key={campaign.id}>
                      <td className="management-table-id-cell">{campaign.id}</td>
                      <td className="seller-campaign-table__campaign">
                        <strong>{campaign.title}</strong>
                        <small>{campaign.description || 'Chương trình dành cho sản phẩm đủ điều kiện của shop.'}</small>
                      </td>
                      <td>
                        <span className="seller-campaign-table__type">{campaign.type.displayName}</span>
                        <small className="seller-campaign-table__subtext">
                          {campaign.type.importanceClass === 'FEATURED' ? 'Nổi bật' : 'Tiêu chuẩn'}
                        </small>
                      </td>
                      <td>{dateOnly(campaign.startsAt)} – {dateOnly(campaign.endsAt)}</td>
                      <td>{dateOnly(campaign.enrollmentEndsAt)}</td>
                      <td>{campaign.minimumDiscountBasisPoints / 100}%</td>
                      <td>
                        <span className={`seller-campaign-state seller-table-status seller-campaign-state--${campaign.sellerState ?? 'UNRESPONDED'}`}>
                          {sellerCampaignStateLabel(campaign.sellerState)}
                        </span>
                        <small className="seller-campaign-table__subtext">{campaignLifecycleLabel(campaign.lifecycle)}</small>
                      </td>
                      <td className="seller-campaign-table__actions">
                        <div className="seller-pl-actions seller-campaign-table__action-buttons">
                          {campaign.lifecycle === 'ENROLLMENT_OPEN' && campaign.sellerState !== 'JOINED' ? (
                            <button
                              type="button"
                              className="seller-pl-btn-icon seller-campaign-table__action seller-campaign-table__action--accept"
                              aria-label={`Xác nhận tham gia chiến dịch ${campaign.title}`}
                              title="Xác nhận tham gia"
                              disabled={actionPending}
                              onClick={() => setSelected(campaign.id)}
                            >
                              <Check size={16} aria-hidden="true" />
                            </button>
                          ) : null}
                          {campaign.lifecycle === 'ENROLLMENT_OPEN' && campaign.sellerState !== 'JOINED' && campaign.sellerState !== 'DECLINED' ? (
                            <button
                              type="button"
                              className="seller-pl-btn-icon seller-pl-btn-icon--delete seller-campaign-table__action seller-campaign-table__action--decline"
                              aria-label={`Từ chối chiến dịch ${campaign.title}`}
                              title="Từ chối"
                              disabled={actionPending}
                              onClick={() => void declineFromList(campaign.id, campaign.title)}
                            >
                              <X size={16} aria-hidden="true" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="seller-pl-btn-icon seller-campaign-table__open"
                            aria-label={`Xem chi tiết chiến dịch ${campaign.title}`}
                            title="Xem chi tiết"
                            disabled={actionPending}
                            onClick={() => setSelected(campaign.id)}
                          >
                            <Eye size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <SellerPagination itemLabel="chiến dịch" page={currentPage} pageSize={page.pageSize} totalItems={page.totalItems} totalPages={page.totalPages} onPageChange={setCurrentPage} />
        </div>
      ) : (
        <div className="seller-campaign-list-state" role={page ? 'status' : 'progressbar'} aria-busy={!page}>
          <strong>{page ? 'Chưa có chiến dịch phù hợp.' : 'Đang tải chiến dịch...'}</strong>
          <span>{page ? 'Thử thay đổi bộ lọc để xem các chương trình khác.' : 'Đang tải dữ liệu từ Kênh Người Bán.'}</span>
        </div>
      )}
    </section>
  );
}
