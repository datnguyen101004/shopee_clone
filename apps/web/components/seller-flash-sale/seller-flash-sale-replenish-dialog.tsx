'use client';

import { useState } from 'react';
import type { FlashSaleSkuItem } from '../../lib/flash-sale-types';
import { useAuthSession } from '../auth-session-provider';
import { replenishSellerFlashSaleSku } from '../../lib/flash-sale-api';
import { RoleApiError } from '../../lib/role-api';

function money(minor: number) {
  return `₫${new Intl.NumberFormat('vi-VN').format(minor)}`;
}

export interface SellerFlashSaleReplenishDialogProps {
  campaignId: string;
  sku: FlashSaleSkuItem;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function SellerFlashSaleReplenishDialog({
  campaignId,
  sku,
  onClose,
  onSuccess,
}: SellerFlashSaleReplenishDialogProps) {
  const { authenticatedFetch } = useAuthSession();
  const [additionalQuantity, setAdditionalQuantity] = useState('10');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const addQty = Number(additionalQuantity);
  let errorMsg = '';
  if (!Number.isInteger(addQty) || addQty <= 0) {
    errorMsg = 'Số lượng bổ sung phải là số nguyên dương.';
  } else if (addQty > sku.availablePhysical) {
    errorMsg = `Số lượng bổ sung vượt quá tồn kho có thể cấp thêm (${sku.availablePhysical}).`;
  }

  const canSubmit = !errorMsg && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setServerError('');
    try {
      await replenishSellerFlashSaleSku(authenticatedFetch, campaignId, sku.variantId, {
        version: sku.version,
        additionalQuantity: addQty,
      });
      await onSuccess();
    } catch (err) {
      if (err instanceof RoleApiError && (err.status === 409 || err.status === 412)) {
        setServerError(
          'Trạng thái SKU đã thay đổi (có thể do đơn hủy đã hoàn lại suất hoặc quota đã được bổ sung). Đang tải lại dữ liệu mới...',
        );
        setTimeout(async () => {
          await onSuccess();
        }, 1200);
      } else {
        setServerError('Không thể bổ sung số lượng suất bán. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="seller-fs-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="replenish-dialog-title">
      <div className="seller-fs-modal">
        <header className="seller-fs-modal__header">
          <h3 id="replenish-dialog-title" className="seller-fs-modal__title">
            Bổ sung suất bán Flash Sale (Hết suất)
          </h3>
          <button
            type="button"
            className="seller-fs-modal__close"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="seller-fs-form">
          <div className="seller-fs-variant-summary">
            <p>
              <strong>Biến thể:</strong> {sku.variantName} ({sku.skuCode})
            </p>
            <p>
              <strong>Giá Flash Sale cố định:</strong>{' '}
              <span className="seller-fs-flash-price">{money(sku.salePriceMinor)}</span>
            </p>
            <p>
              <strong>Kho có thể bổ sung thêm:</strong> {sku.availablePhysical} sản phẩm
            </p>
          </div>

          <div className="seller-fs-form__group">
            <label htmlFor="additional-qty-input" className="seller-fs-form__label">
              Số lượng suất bán thêm <span className="text-required">*</span>
            </label>
            <input
              id="additional-qty-input"
              type="number"
              min={1}
              max={sku.availablePhysical}
              className={`seller-fs-form__input ${errorMsg ? 'is-invalid' : ''}`}
              value={additionalQuantity}
              onChange={(e) => setAdditionalQuantity(e.target.value)}
              aria-describedby={errorMsg ? 'replenish-error-msg' : undefined}
            />
            {errorMsg && (
              <span id="replenish-error-msg" className="seller-fs-form__error" role="alert">
                {errorMsg}
              </span>
            )}
            <small className="seller-fs-form__hint">
              Khi thêm số lượng thành công, biến thể sẽ chuyển về trạng thái &quot;Đang diễn ra&quot; và giá sale giữ nguyên.
            </small>
          </div>

          {serverError && (
            <div className="seller-fs-form__alert" role="alert">
              {serverError}
            </div>
          )}

          <footer className="seller-fs-modal__footer">
            <button
              type="button"
              className="seller-pl-btn seller-pl-btn--secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="seller-pl-btn seller-pl-btn--primary"
              disabled={!canSubmit}
            >
              {isSubmitting ? 'Đang bổ sung...' : 'Xác nhận thêm'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
