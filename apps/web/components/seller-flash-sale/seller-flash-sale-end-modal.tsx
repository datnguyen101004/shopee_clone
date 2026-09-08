'use client';

import { useState } from 'react';
import type { FlashSaleSkuItem } from '../../lib/flash-sale-types';
import { useAuthSession } from '../auth-session-provider';
import { endSellerFlashSaleSku } from '../../lib/flash-sale-api';
import { RoleApiError } from '../../lib/role-api';

function money(minor: number) {
  return `₫${new Intl.NumberFormat('vi-VN').format(minor)}`;
}

export interface SellerFlashSaleEndModalProps {
  campaignId: string;
  sku: FlashSaleSkuItem;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function SellerFlashSaleEndModal({
  campaignId,
  sku,
  onClose,
  onSuccess,
}: SellerFlashSaleEndModalProps) {
  const { authenticatedFetch } = useAuthSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const handleConfirmEnd = async () => {
    setIsSubmitting(true);
    setServerError('');
    try {
      await endSellerFlashSaleSku(authenticatedFetch, campaignId, sku.variantId, {
        version: sku.version,
      });
      await onSuccess();
    } catch (err) {
      if (err instanceof RoleApiError && (err.status === 409 || err.status === 412)) {
        setServerError('Trạng thái SKU đã thay đổi. Đang làm mới dữ liệu...');
        setTimeout(async () => {
          await onSuccess();
        }, 1200);
      } else {
        setServerError('Không thể kết thúc tham gia Flash Sale cho biến thể này. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="seller-fs-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="end-modal-title">
      <div className="seller-fs-modal seller-fs-modal--warning">
        <header className="seller-fs-modal__header">
          <h3 id="end-modal-title" className="seller-fs-modal__title">
            Xác nhận kết thúc chiến dịch cho SKU
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

        <div className="seller-fs-modal__body">
          <div className="seller-fs-variant-summary">
            <p>
              <strong>Biến thể kết thúc:</strong> {sku.variantName} ({sku.skuCode})
            </p>
            <p>
              <strong>Giá Flash Sale hiện tại:</strong> {money(sku.salePriceMinor)}
            </p>
            <p>
              <strong>Giá thường trở lại sau kết thúc:</strong> {money(sku.basePriceMinor)}
            </p>
          </div>

          <div className="seller-fs-callout seller-fs-callout--danger">
            <h4 className="seller-fs-callout__title">Lưu ý quan trọng:</h4>
            <ul className="seller-fs-callout__list">
              <li>Biến thể này sẽ ngay lập tức được bán lại theo giá và tồn kho thông thường.</li>
              <li>Các đơn hàng Flash Sale đã đặt trước đó vẫn giữ nguyên mức giá đã chốt.</li>
              <li>Sau khi kết thúc, biến thể này <strong>không thể mở lại</strong> trong cùng chiến dịch Flash Sale này.</li>
              <li>Thao tác này chỉ áp dụng riêng cho biến thể này, không ảnh hưởng đến các SKU khác hay toàn bộ chiến dịch của sàn.</li>
            </ul>
          </div>

          {serverError && (
            <div className="seller-fs-form__alert" role="alert">
              {serverError}
            </div>
          )}
        </div>

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
            type="button"
            className="seller-pl-btn seller-pl-btn--danger"
            onClick={() => void handleConfirmEnd()}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Đang kết thúc...' : 'Kết thúc chiến dịch'}
          </button>
        </footer>
      </div>
    </div>
  );
}
