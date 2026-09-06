'use client';

import type {
  SellerProductCategory,
  SellerProductDetail,
  SellerProductUpsertRequest,
  SellerProductVariantInput,
} from '@shopee-clone/contracts';
import {
  cmStringToMm,
  formatInteger,
  mmToCmString,
  parseFormattedInteger,
} from './seller-products-utils';

interface GeneralInfoProps {
  form: SellerProductUpsertRequest;
  existingProduct: SellerProductDetail | null;
  categories: SellerProductCategory[];
  isMultiVariant: boolean;
  readOnly?: boolean;
  onUpdateForm: (patch: Partial<SellerProductUpsertRequest>) => void;
  onUpdateDefaultVariant: (patch: Partial<SellerProductVariantInput>) => void;
}

export function SellerProductGeneralInfo({
  form,
  existingProduct,
  categories,
  isMultiVariant,
  readOnly = false,
  onUpdateForm,
  onUpdateDefaultVariant,
}: GeneralInfoProps) {
  const defaultVariant = form.variants[0] || {
    priceMinor: 0,
    compareAtPriceMinor: null,
    stock: 0,
    weightGrams: 500,
    active: true,
  };

  const defaultSku = existingProduct?.variants?.[0]?.sku || 'Tự sinh sau khi lưu';

  // Category selection handling
  return (
    <div className={`seller-pe-card ${readOnly ? 'seller-pe-readonly' : ''}`}>
      <h2 className="seller-pe-card__title">Thông tin chung</h2>

      <div className="seller-pe-form-grid">
        {/* Row 1: Product Name */}
        <div className="seller-pe-field">
          <label htmlFor="sp-product-name">Tên sản phẩm</label>
          <input
            id="sp-product-name"
            type="text"
            placeholder="Nhập tên sản phẩm (tối thiểu 10 ký tự)"
            value={form.name}
            readOnly={readOnly}
            onChange={(e) => onUpdateForm({ name: e.target.value })}
            required
          />
        </div>

        {/* Row 2: Category & SKU */}
        <div className="seller-pe-field-row">
          <div className="seller-pe-field">
            <label htmlFor="sp-category-select">Danh mục</label>
            <select
              id="sp-category-select"
              value={form.categoryId}
              disabled={readOnly}
              onChange={(e) => onUpdateForm({ categoryId: e.target.value })}
              required
            >
              <option value="" disabled>
                Chọn ngành hàng
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="seller-pe-field">
            <label htmlFor="sp-sku-display">Mã sản phẩm (SKU)</label>
            <input
              id="sp-sku-display"
              type="text"
              readOnly
              value={isMultiVariant ? 'Nhiều biến thể (xem bảng biến thể)' : defaultSku}
            />
            <p className="seller-pe-card__hint">
              Slug sẽ được tạo sau khi lưu theo tên sản phẩm và thời điểm đăng.
            </p>
          </div>
        </div>

        {/* Single variant pricing & stock (Row 3 & 4) */}
        {!isMultiVariant ? (
          <>
            <div className="seller-pe-field-row">
              <div className="seller-pe-field">
                <label htmlFor="sp-price-input">Giá bán mặc định</label>
                <input
                  id="sp-price-input"
                  type="text"
                  inputMode="numeric"
                  value={formatInteger(defaultVariant.priceMinor)}
                  readOnly={readOnly}
                  onChange={(e) =>
                    onUpdateDefaultVariant({
                      priceMinor: parseFormattedInteger(e.target.value),
                    })
                  }
                />
              </div>

              <div className="seller-pe-field">
                <label htmlFor="sp-compare-price-input">Giá so sánh / Gốc (₫)</label>
                <input
                  id="sp-compare-price-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="Để trống nếu không giảm giá"
                  value={
                    defaultVariant.compareAtPriceMinor
                      ? formatInteger(defaultVariant.compareAtPriceMinor)
                      : ''
                  }
                  readOnly={readOnly}
                  onChange={(e) => {
                    const parsed = parseFormattedInteger(e.target.value);
                    onUpdateDefaultVariant({
                      compareAtPriceMinor: parsed > 0 ? parsed : null,
                    });
                  }}
                />
              </div>
            </div>

            <div className="seller-pe-field-row">
              <div className="seller-pe-field">
                <label htmlFor="sp-stock-input">Tồn kho mặc định</label>
                <input
                  id="sp-stock-input"
                  type="text"
                  inputMode="numeric"
                  value={formatInteger(defaultVariant.stock)}
                  readOnly={readOnly}
                  onChange={(e) =>
                    onUpdateDefaultVariant({
                      stock: parseFormattedInteger(e.target.value),
                    })
                  }
                />
              </div>

              <div className="seller-pe-field">
                <label htmlFor="sp-status-display">Trạng thái sản phẩm</label>
                <input
                  id="sp-status-display"
                  type="text"
                  readOnly
                  value={
                    existingProduct?.lifecycle === 'published'
                      ? 'Đang kinh doanh'
                      : existingProduct?.lifecycle === 'hidden'
                      ? 'Đang ẩn'
                      : existingProduct?.lifecycle === 'archived'
                      ? 'Đã lưu trữ'
                      : 'Bản nháp'
                  }
                />
              </div>
            </div>
          </>
        ) : null}

        {/* Row 5: Package Weight & Dimensions */}
        <div className="seller-pe-field-row">
          <div className="seller-pe-field">
            <label htmlFor="sp-weight-input">Trọng lượng đóng gói (gram)</label>
            <input
              id="sp-weight-input"
              type="number"
              min="1"
              readOnly={readOnly}
              value={defaultVariant.weightGrams || ''}
              onChange={(e) =>
                onUpdateDefaultVariant({
                  weightGrams: Number(e.target.value) || 0,
                })
              }
            />
          </div>

          <div className="seller-pe-field">
            <label>Kích thước đóng gói (D x R x C cm)</label>
            <div className="seller-pe-dim-row">
              <input
                type="text"
                inputMode="decimal"
                aria-label="Dài"
                placeholder="Dài (cm)"
                value={mmToCmString(form.packageLengthMm)}
                readOnly={readOnly}
                onChange={(e) =>
                  onUpdateForm({ packageLengthMm: cmStringToMm(e.target.value) })
                }
              />
              <input
                type="text"
                inputMode="decimal"
                aria-label="Rộng"
                placeholder="Rộng (cm)"
                value={mmToCmString(form.packageWidthMm)}
                readOnly={readOnly}
                onChange={(e) =>
                  onUpdateForm({ packageWidthMm: cmStringToMm(e.target.value) })
                }
              />
              <input
                type="text"
                inputMode="decimal"
                aria-label="Cao"
                placeholder="Cao (cm)"
                value={mmToCmString(form.packageHeightMm)}
                readOnly={readOnly}
                onChange={(e) =>
                  onUpdateForm({ packageHeightMm: cmStringToMm(e.target.value) })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
