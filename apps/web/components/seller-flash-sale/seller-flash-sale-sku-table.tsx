'use client';

import { useState } from 'react';
import { Plus, SquarePen, X } from '@shopee-clone/ui';
import type {
  FlashSaleSkuItem,
  SellerFlashSaleProductGroup,
} from '../../lib/flash-sale-types';
import { SellerFlashSaleRegisterModal } from './seller-flash-sale-register-modal';
import { SellerFlashSaleQuotaModal } from './seller-flash-sale-quota-modal';
import { SellerFlashSaleReplenishDialog } from './seller-flash-sale-replenish-dialog';
import { SellerFlashSaleEndModal } from './seller-flash-sale-end-modal';

function money(minor: number) {
  return `₫${new Intl.NumberFormat('vi-VN').format(minor)}`;
}

function statusBadge(state: FlashSaleSkuItem['state']) {
  switch (state) {
    case 'UPCOMING':
      return <span className="seller-fs-badge seller-table-status seller-fs-badge--upcoming">Sắp diễn ra</span>;
    case 'ACTIVE':
      return <span className="seller-fs-badge seller-table-status seller-fs-badge--active">Đang diễn ra</span>;
    case 'SOLD_OUT':
      return <span className="seller-fs-badge seller-table-status seller-fs-badge--soldout">Hết suất</span>;
    case 'ENDED':
      return <span className="seller-fs-badge seller-table-status seller-fs-badge--ended">Đã kết thúc</span>;
  }
}

function lifecycleLabel(lifecycle: string) {
  switch (lifecycle) {
    case 'ENROLLMENT_OPEN':
      return 'Đang nhận đăng ký';
    case 'SCHEDULED':
      return 'Đã lên lịch';
    case 'ACTIVE':
      return 'Chiến dịch đang mở bán';
    case 'ENDED':
      return 'Đã kết thúc';
    case 'CANCELLED':
      return 'Đã hủy';
    default:
      return lifecycle;
  }
}

export interface SellerFlashSaleSkuTableProps {
  campaignId: string;
  campaignTitle: string;
  campaignLifecycle: string;
  minimumDiscountBasisPoints: number;
  campaignVersion?: number;
  availableProductIds?: string[];
  groups: SellerFlashSaleProductGroup[];
  canEnroll: boolean;
  onRefresh: () => Promise<void>;
}

export function SellerFlashSaleSkuTable({
  campaignId,
  campaignTitle,
  campaignLifecycle,
  minimumDiscountBasisPoints,
  campaignVersion = 0,
  availableProductIds = [],
  groups,
  canEnroll,
  onRefresh,
}: SellerFlashSaleSkuTableProps) {
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<FlashSaleSkuItem | null>(null);
  const [replenishingSku, setReplenishingSku] = useState<FlashSaleSkuItem | null>(null);
  const [endingSku, setEndingSku] = useState<FlashSaleSkuItem | null>(null);

  const totalSkus = groups.reduce((sum, g) => sum + g.skus.length, 0);

  return (
    <section className="seller-fs-workspace" aria-labelledby="seller-fs-title">
      <div className="seller-pl-toolbar seller-pl-toolbar--labeled seller-fs-toolbar">
        <div className="seller-fs-toolbar__info">
          <h2 id="seller-fs-title" className="seller-fs-title">
            Danh sách SKU Flash Sale ({totalSkus} biến thể)
          </h2>
          <p className="seller-fs-subtitle">
            Quản lý quota phân bổ và trạng thái theo từng biến thể trong chiến dịch {campaignTitle}.
            <span className="seller-fs-campaign-state">{lifecycleLabel(campaignLifecycle)}</span>
          </p>
        </div>
        {canEnroll && (
          <div className="seller-fs-toolbar__actions">
            <button
              type="button"
              className="seller-pl-btn seller-pl-btn--primary"
              onClick={() => setRegisterModalOpen(true)}
            >
              + Thêm SKU
            </button>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="seller-fs-empty-card" role="status">
          <p className="seller-fs-empty-card__title">Chưa có SKU nào tham gia chiến dịch này</p>
          <p className="seller-fs-empty-card__desc">
            Chọn các biến thể sản phẩm có sẵn để phân bổ suất bán Flash Sale với mức giảm tối thiểu{' '}
            {minimumDiscountBasisPoints / 100}%.
          </p>
          {canEnroll && (
            <button
              type="button"
              className="seller-pl-btn seller-pl-btn--primary"
              onClick={() => setRegisterModalOpen(true)}
            >
              Thêm SKU tham gia
            </button>
          )}
        </div>
      ) : (
        <div className="seller-fs-groups-container">
          {groups.map((group) => (
            <article key={group.productId} className="seller-fs-group-card">
              <header className="seller-fs-group-header">
                <div className="seller-fs-group-header__media">
                  {group.imageUrl ? (
                    <img
                      src={group.imageUrl}
                      alt={group.productName}
                      className="seller-fs-group-header__img"
                    />
                  ) : (
                    <div className="seller-fs-group-header__placeholder" aria-hidden="true">
                      SP
                    </div>
                  )}
                </div>
                <div className="seller-fs-group-header__info">
                  <h3 className="seller-fs-group-header__name">{group.productName}</h3>
                  <span className="seller-fs-group-header__count">
                    {group.skus.length} biến thể đăng ký
                  </span>
                </div>
              </header>

              <div className="seller-fs-table-wrap">
                <table className="seller-fs-table seller-management-table" aria-label={`Bảng SKU của ${group.productName}`}>
                  <thead>
                    <tr>
                      <th scope="col" className="management-table-id-cell">ID</th>
                      <th scope="col" style={{ width: '48px' }}>Ảnh</th>
                      <th scope="col">Biến thể / Mã SKU</th>
                      <th scope="col">Giá thường</th>
                      <th scope="col">Giá Flash Sale</th>
                      <th scope="col">Kho khả dụng</th>
                      <th scope="col">Quota đã cấp</th>
                      <th scope="col">Quota còn lại</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.skus.map((sku) => (
                      <tr key={sku.id} className="seller-fs-row">
                        <td className="management-table-id-cell">{sku.id}</td>
                        <td className="seller-fs-col-img">
                          {sku.imageUrl ? (
                            <img
                              src={sku.imageUrl}
                              alt={sku.variantName}
                              className="seller-fs-thumb"
                              width={48}
                              height={48}
                            />
                          ) : (
                            <div className="seller-fs-thumb-placeholder" aria-hidden="true">
                              SKU
                            </div>
                          )}
                        </td>
                        <td className="seller-fs-col-variant">
                          <strong className="seller-fs-variant-name">{sku.variantName}</strong>
                          <span className="seller-fs-sku-code">{sku.skuCode}</span>
                        </td>
                        <td className="seller-fs-col-price">
                          <span className="seller-fs-regular-price">{money(sku.basePriceMinor)}</span>
                        </td>
                        <td className="seller-fs-col-sale-price">
                          <strong className="seller-fs-flash-price">{money(sku.salePriceMinor)}</strong>
                        </td>
                        <td className="seller-fs-col-stock">{sku.availablePhysical}</td>
                        <td className="seller-fs-col-allocated">{sku.allocatedQuantity}</td>
                        <td className="seller-fs-col-remaining">
                          <strong className={sku.remainingQuantity === 0 ? 'text-soldout' : ''}>
                            {sku.remainingQuantity}
                          </strong>
                        </td>
                        <td className="seller-fs-col-status">{statusBadge(sku.state)}</td>
                        <td className="seller-fs-col-actions" style={{ textAlign: 'right' }}>
                          {sku.state === 'UPCOMING' && sku.canEditQuota && (
                            <button
                              type="button"
                              className="seller-pl-btn-icon"
                              aria-label={`Chỉnh quota ${sku.variantName}`}
                              title="Chỉnh quota"
                              onClick={() => setEditingSku(sku)}
                            >
                              <SquarePen size={16} aria-hidden="true" />
                            </button>
                          )}
                          {sku.state === 'ACTIVE' && (
                            <span className="seller-fs-readonly-hint" title="Giá và quota đang khóa trong lúc mở bán">
                              Đang mở bán
                            </span>
                          )}
                          {sku.state === 'SOLD_OUT' && (
                            <div className="seller-fs-soldout-actions">
                              {sku.canReplenish && (
                                <button
                                  type="button"
                                  className="seller-pl-btn-icon seller-fs-btn-action--replenish"
                                  aria-label={`Thêm số lượng ${sku.variantName}`}
                                  title="Thêm số lượng"
                                  onClick={() => setReplenishingSku(sku)}
                                >
                                  <Plus size={16} aria-hidden="true" />
                                </button>
                              )}
                              {sku.remainingQuantity === 0 && sku.canEnd && (
                                <button
                                  type="button"
                                  className="seller-pl-btn-icon seller-pl-btn-icon--delete seller-fs-btn-action--end"
                                  aria-label={`Kết thúc chiến dịch cho SKU ${sku.variantName}`}
                                  title="Kết thúc chiến dịch"
                                  onClick={() => setEndingSku(sku)}
                                >
                                  <X size={16} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          )}
                          {sku.state === 'ENDED' && (
                            <span className="seller-fs-readonly-hint">Lịch sử (Chỉ đọc)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}

      {registerModalOpen && (
        <SellerFlashSaleRegisterModal
          campaignId={campaignId}
          minimumDiscountBasisPoints={minimumDiscountBasisPoints}
          campaignVersion={campaignVersion}
          availableProductIds={availableProductIds}
          onClose={() => setRegisterModalOpen(false)}
          onSuccess={async () => {
            setRegisterModalOpen(false);
            await onRefresh();
          }}
        />
      )}

      {editingSku && (
        <SellerFlashSaleQuotaModal
          campaignId={campaignId}
          sku={editingSku}
          onClose={() => setEditingSku(null)}
          onSuccess={async () => {
            setEditingSku(null);
            await onRefresh();
          }}
        />
      )}

      {replenishingSku && (
        <SellerFlashSaleReplenishDialog
          campaignId={campaignId}
          sku={replenishingSku}
          onClose={() => setReplenishingSku(null)}
          onSuccess={async () => {
            setReplenishingSku(null);
            await onRefresh();
          }}
        />
      )}

      {endingSku && (
        <SellerFlashSaleEndModal
          campaignId={campaignId}
          sku={endingSku}
          onClose={() => setEndingSku(null)}
          onSuccess={async () => {
            setEndingSku(null);
            await onRefresh();
          }}
        />
      )}
    </section>
  );
}
