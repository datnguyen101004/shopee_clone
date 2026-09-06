'use client';

import type { ProductDetailVariant } from '@shopee-clone/contracts';

export interface ProductQuantityStepperProps {
  quantity: string;
  selectedVariant: ProductDetailVariant | null;
  purchasable: boolean;
  statusMessage: string;
  isError: boolean;
  onQuantityChange: (value: string) => void;
  onStepQuantity: (delta: number) => void;
}

export function ProductQuantityStepper({
  quantity,
  selectedVariant,
  purchasable,
  statusMessage,
  isError,
  onQuantityChange,
  onStepQuantity,
}: ProductQuantityStepperProps) {
  const currentQuantity = Number(quantity);

  return (
    <>
      <div className="product-detail-quantity">
        <label htmlFor="product-quantity">Số lượng</label>
        <div className="product-detail-quantity__stepper">
          <button
            type="button"
            className="product-detail-quantity__btn"
            aria-label="Giảm số lượng"
            disabled={!selectedVariant || currentQuantity <= 1}
            onClick={() => onStepQuantity(-1)}
          >
            −
          </button>
          <input
            id="product-quantity"
            className="product-detail-quantity__input"
            inputMode="numeric"
            value={quantity}
            aria-describedby="product-quantity-status"
            onChange={(event) => onQuantityChange(event.target.value)}
          />
          <button
            type="button"
            className="product-detail-quantity__btn"
            aria-label="Tăng số lượng"
            disabled={
              !selectedVariant || currentQuantity >= selectedVariant.availableQuantity
            }
            onClick={() => onStepQuantity(1)}
          >
            +
          </button>
        </div>
      </div>
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
