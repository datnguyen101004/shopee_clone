'use client';

import type { ProductDetailVariant } from '@shopee-clone/contracts';
import type { VariantFlashSaleOffer } from './product-detail-flash-sale';

export interface ProductQuantityStepperProps {
  quantity: string;
  selectedVariant: ProductDetailVariant | null;
  flashSaleOffer?: VariantFlashSaleOffer | null;
  purchasable: boolean;
  statusMessage: string;
  isError: boolean;
  onQuantityChange: (value: string) => void;
  onStepQuantity: (delta: number) => void;
}

export function ProductQuantityStepper({
  quantity,
  selectedVariant,
  flashSaleOffer,
  purchasable,
  statusMessage,
  isError,
  onQuantityChange,
  onStepQuantity,
}: ProductQuantityStepperProps) {
  const currentQuantity = Number(quantity);
  const isFlashSaleActive = flashSaleOffer?.isFlashSale && flashSaleOffer.state === 'ACTIVE';
  const isFlashSaleSoldOut = flashSaleOffer?.isFlashSale && flashSaleOffer.state === 'SOLD_OUT';

  return (
    <>
      <div className="product-detail-quantity">
        <label htmlFor="product-quantity">Số lượng</label>
        <div className="product-detail-quantity__stepper">
          <button
            type="button"
            className="product-detail-quantity__btn"
            aria-label="Giảm số lượng"
            disabled={!selectedVariant || currentQuantity <= 1 || isFlashSaleActive || isFlashSaleSoldOut}
            onClick={() => onStepQuantity(-1)}
          >
            −
          </button>
          <input
            id="product-quantity"
            className="product-detail-quantity__input"
            inputMode="numeric"
            value={isFlashSaleActive ? '1' : quantity}
            readOnly={isFlashSaleActive || isFlashSaleSoldOut}
            disabled={isFlashSaleSoldOut}
            aria-describedby="product-quantity-status"
            onChange={(event) => {
              if (isFlashSaleActive) return;
              onQuantityChange(event.target.value);
            }}
          />
          <button
            type="button"
            className="product-detail-quantity__btn"
            aria-label="Tăng số lượng"
            disabled={
              !selectedVariant ||
              currentQuantity >= selectedVariant.availableQuantity ||
              isFlashSaleActive ||
              isFlashSaleSoldOut
            }
            onClick={() => onStepQuantity(1)}
          >
            +
          </button>
        </div>
      </div>
      {isFlashSaleActive && (
        <p className="product-detail-fs-stepper-note">
          ⚡ Số lượng Flash Sale cố định 1 sản phẩm cho mỗi tài khoản trong chiến dịch.
        </p>
      )}
      <p
        id="product-quantity-status"
        className={isError ? 'product-detail-status is-error' : 'product-detail-status'}
        aria-live="polite"
      >
        {statusMessage}
      </p>
      {!purchasable ? (
        <p className="product-detail-unavailable">
          Sản phẩm hiện tạm hết hàng. Bạn vẫn có thể xem thông tin và shop.
        </p>
      ) : null}
    </>
  );
}
