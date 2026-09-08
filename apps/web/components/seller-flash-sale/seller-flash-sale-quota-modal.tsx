'use client';

import { useState } from 'react';
import type { FlashSaleSkuItem } from '../../lib/flash-sale-types';
import { useAuthSession } from '../auth-session-provider';
import { updateSellerFlashSaleSkuQuota } from '../../lib/flash-sale-api';
import { RoleApiError } from '../../lib/role-api';

function money(minor: number) {
  return `₫${new Intl.NumberFormat('vi-VN').format(minor)}`;
}

export interface SellerFlashSaleQuotaModalProps {
  campaignId: string;
  sku: FlashSaleSkuItem;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function SellerFlashSaleQuotaModal({
  campaignId,
  sku,
  onClose,
  onSuccess,
}: SellerFlashSaleQuotaModalProps) {
  const { authenticatedFetch } = useAuthSession();
  const [quota, setQuota] = useState(String(sku.allocatedQuantity));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const quotaNum = Number(quota);
  let quotaError = '';
  if (!Number.isInteger(quotaNum) || quotaNum <= 0) {
    quotaError = 'Số lượng quota phải là số nguyên dương.';
  } else if (quotaNum > sku.availablePhysical) {
    quotaError = `Số lượng vượt quá tồn kho khả dụng hiện tại (${sku.availablePhysical}).`;
  }

  const canSubmit = !quotaError && quotaNum !== sku.allocatedQuantity && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setServerError('');
    try {
      await updateSellerFlashSaleSkuQuota(authenticatedFetch, campaignId, sku.variantId, {
        version: sku.version,
        quota: quotaNum,
      });
      await onSuccess();
    } catch (err) {
      if (err instanceof RoleApiError && (err.status === 409 || err.status === 412)) {
        setServerError('Thông tin SKU đã thay đổi trên hệ thống. Dữ liệu đã được cập nhật lại.');
      } else {
        setServerError('Không thể cập nhật số lượng quota. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="seller-fs-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="quota-modal-title">
      <div className="seller-fs-modal">
        <header className="seller-fs-modal__header">
          <h3 id="quota-modal-title" className="seller-fs-modal__title">
            Chỉnh sửa quota Flash Sale trước giờ mở
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
              <strong>Giá thường:</strong> {money(sku.basePriceMinor)}
            </p>
            <p>
              <strong>Giá Flash Sale (cố định):</strong>{' '}
              <span className="seller-fs-flash-price">{money(sku.salePriceMinor)}</span>
            </p>
            <p>
              <strong>Kho khả dụng có thể cấp:</strong> {sku.availablePhysical} sản phẩm
            </p>
          </div>

          <div className="seller-fs-form__group">
            <label htmlFor="quota-input" className="seller-fs-form__label">
              Số lượng suất bán mới (Quota) <span className="text-required">*</span>
            </label>
            <input
              id="quota-input"
              type="number"
              min={1}
              max={sku.availablePhysical}
              className={`seller-fs-form__input ${quotaError ? 'is-invalid' : ''}`}
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
              aria-describedby={quotaError ? 'quota-error-msg' : undefined}
            />
            {quotaError && (
              <span id="quota-error-msg" className="seller-fs-form__error" role="alert">
                {quotaError}
              </span>
            )}
            <small className="seller-fs-form__hint">
              Bạn có thể tăng hoặc giảm quota trước khi chiến dịch bắt đầu, miễn không vượt tồn kho khả dụng.
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
              {isSubmitting ? 'Đang lưu...' : 'Lưu quota'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
