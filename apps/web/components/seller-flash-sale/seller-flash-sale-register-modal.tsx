'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthSession } from '../auth-session-provider';
import { registerSellerFlashSaleSkus } from '../../lib/flash-sale-api';
import { RoleApiError } from '../../lib/role-api';
import { fetchSellerProduct, fetchSellerProducts } from '../../lib/seller-products-api';

interface AvailableVariant {
  variantId: string;
  variantName: string;
  skuCode: string;
  basePriceMinor: number;
  availablePhysical: number;
}

interface AvailableProduct {
  productId: string;
  productName: string;
  variants: AvailableVariant[];
}

function money(minor: number) {
  return `₫${new Intl.NumberFormat('vi-VN').format(minor)}`;
}

export interface SellerFlashSaleRegisterModalProps {
  campaignId: string;
  minimumDiscountBasisPoints: number;
  campaignVersion: number;
  availableProductIds: string[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function SellerFlashSaleRegisterModal({
  campaignId,
  minimumDiscountBasisPoints,
  campaignVersion,
  availableProductIds,
  onClose,
  onSuccess,
}: SellerFlashSaleRegisterModalProps) {
  const { authenticatedFetch } = useAuthSession();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [quota, setQuota] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [availableProducts, setAvailableProducts] = useState<AvailableProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The modal starts in loading state; keep the flag true while a campaign filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingProducts(true);
    void (async () => {
      const items: Awaited<ReturnType<typeof fetchSellerProducts>>['items'] = [];
      let pageNumber = 1;
      while (true) {
        const response = await fetchSellerProducts(authenticatedFetch, { lifecycle: 'published', page: pageNumber });
        items.push(...response.items);
        if (pageNumber >= response.totalPages) break;
        pageNumber += 1;
      }
      return items;
    })()
      .then(async (items) => {
        const products = await Promise.all(
          items
            .filter((product) => availableProductIds.length === 0 || availableProductIds.includes(product.id))
            .map(async (product) => {
              const detail = await fetchSellerProduct(authenticatedFetch, product.id);
              return {
                productId: detail.id,
                productName: detail.name,
                variants: detail.variants.filter((variant) => variant.active).map((variant) => ({
                  variantId: variant.id,
                  variantName: variant.combination.join(' / ') || variant.sku,
                  skuCode: variant.sku,
                  basePriceMinor: variant.priceMinor,
                  availablePhysical: variant.stock,
                })),
              } satisfies AvailableProduct;
            }),
        );
        if (!cancelled) setAvailableProducts(products.filter((product) => product.variants.length > 0));
      })
      .catch(() => { if (!cancelled) setServerError('Không thể tải danh sách SKU của shop.'); })
      .finally(() => { if (!cancelled) setLoadingProducts(false); });
    return () => { cancelled = true; };
  }, [authenticatedFetch, availableProductIds]);

  // Find all variants across products matching search
  const allVariants = useMemo(() => availableProducts.flatMap((p) =>
    p.variants.map((v) => ({ ...v, productName: p.productName })),
  ), [availableProducts]);

  const filteredVariants = allVariants.filter(
    (v) =>
      v.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.variantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.skuCode.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const activeVariant = allVariants.find((v) => v.variantId === selectedVariantId) ?? null;

  // Validation
  const minDiscountPercent = minimumDiscountBasisPoints / 100;
  const maxAllowedPriceMinor = activeVariant
    ? Math.floor((activeVariant.basePriceMinor * (10000 - minimumDiscountBasisPoints)) / 10000)
    : 0;

  const salePriceMinor = Number(salePrice);
  const quotaNum = Number(quota);

  let priceError = '';
  if (activeVariant && salePrice) {
    if (!Number.isInteger(salePriceMinor) || salePriceMinor <= 0) {
      priceError = 'Giá Flash Sale phải là số nguyên dương.';
    } else if (salePriceMinor > maxAllowedPriceMinor) {
      priceError = `Giá Flash Sale phải giảm tối thiểu ${minDiscountPercent}% (tối đa ${money(
        maxAllowedPriceMinor,
      )}).`;
    }
  }

  let quotaError = '';
  if (activeVariant && quota) {
    if (!Number.isInteger(quotaNum) || quotaNum <= 0) {
      quotaError = 'Số lượng quota phải là số nguyên dương.';
    } else if (quotaNum > activeVariant.availablePhysical) {
      quotaError = `Số lượng vượt quá tồn kho khả dụng (${activeVariant.availablePhysical}).`;
    }
  }

  const canSubmit =
    Boolean(activeVariant) &&
    Boolean(salePrice) &&
    Boolean(quota) &&
    !priceError &&
    !quotaError &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !activeVariant) return;

    setIsSubmitting(true);
    setServerError('');
    try {
      idempotencyKeyRef.current ??= crypto.randomUUID();
      await registerSellerFlashSaleSkus(authenticatedFetch, campaignId, {
        version: campaignVersion,
        items: [
          {
            variantId: activeVariant.variantId,
            salePriceMinor,
            quota: quotaNum,
          },
        ],
      }, idempotencyKeyRef.current);
      idempotencyKeyRef.current = null;
      await onSuccess();
    } catch (err) {
      if (err instanceof RoleApiError && (err.status === 409 || err.status === 412)) {
        setServerError('Chiến dịch hoặc SKU đã thay đổi. Vui lòng kiểm tra lại thông tin.');
      } else {
        setServerError('Không thể đăng ký SKU vào Flash Sale. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="seller-fs-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="register-modal-title">
      <div className="seller-fs-modal">
        <header className="seller-fs-modal__header">
          <h3 id="register-modal-title" className="seller-fs-modal__title">
            Đăng ký SKU tham gia Flash Sale
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
          <div className="seller-fs-form__group">
            <label htmlFor="variant-search" className="seller-fs-form__label">
              Tìm sản phẩm / biến thể
            </label>
            <input
              id="variant-search"
              type="search"
              className="seller-fs-form__input"
              placeholder="Nhập tên sản phẩm hoặc mã SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="seller-fs-form__group">
            <label htmlFor="variant-select" className="seller-fs-form__label">
              Chọn biến thể đăng ký <span className="text-required">*</span>
            </label>
            <select
              id="variant-select"
              className="seller-fs-form__select"
              value={selectedVariantId}
              onChange={(e) => {
                setSelectedVariantId(e.target.value);
                const selected = allVariants.find((v) => v.variantId === e.target.value);
                if (selected) {
                  // Pre-fill suggested flash sale price with minimum discount
                  const defaultPrice = Math.floor(
                    (selected.basePriceMinor * (10000 - minimumDiscountBasisPoints)) / 10000,
                  );
                  setSalePrice(String(defaultPrice));
                  setQuota(String(Math.min(10, selected.availablePhysical)));
                }
              }}
            >
              <option value="">{loadingProducts ? 'Đang tải SKU...' : '-- Chọn một biến thể có sẵn trong kho --'}</option>
              {filteredVariants.map((v) => (
                <option key={v.variantId} value={v.variantId}>
                  {v.productName} — {v.variantName} ({v.skuCode}) · Giá thường: {money(v.basePriceMinor)} · Kho: {v.availablePhysical}
                </option>
              ))}
            </select>
          </div>

          {activeVariant && (
            <div className="seller-fs-variant-summary">
              <p>
                <strong>Giá niêm yết thường:</strong> {money(activeVariant.basePriceMinor)}
              </p>
              <p>
                <strong>Tồn kho khả dụng:</strong> {activeVariant.availablePhysical} sản phẩm
              </p>
              <p>
                <strong>Mức giảm tối thiểu của sàn:</strong> {minDiscountPercent}% (Giá tối đa:{' '}
                {money(maxAllowedPriceMinor)})
              </p>
            </div>
          )}

          <div className="seller-fs-form__row">
            <div className="seller-fs-form__group">
              <label htmlFor="sale-price" className="seller-fs-form__label">
                Giá Flash Sale (VNĐ) <span className="text-required">*</span>
              </label>
              <input
                id="sale-price"
                type="number"
                min={1000}
                max={maxAllowedPriceMinor || undefined}
                step={1000}
                className={`seller-fs-form__input ${priceError ? 'is-invalid' : ''}`}
                value={salePrice}
                disabled={!activeVariant}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="VD: 150000"
                aria-describedby={priceError ? 'price-error-msg' : undefined}
              />
              {priceError && (
                <span id="price-error-msg" className="seller-fs-form__error" role="alert">
                  {priceError}
                </span>
              )}
            </div>

            <div className="seller-fs-form__group">
              <label htmlFor="quota-input" className="seller-fs-form__label">
                Số lượng phân bổ (Quota) <span className="text-required">*</span>
              </label>
              <input
                id="quota-input"
                type="number"
                min={1}
                max={activeVariant?.availablePhysical || undefined}
                className={`seller-fs-form__input ${quotaError ? 'is-invalid' : ''}`}
                value={quota}
                disabled={!activeVariant}
                onChange={(e) => setQuota(e.target.value)}
                placeholder="VD: 20"
                aria-describedby={quotaError ? 'quota-error-msg' : undefined}
              />
              {quotaError && (
                <span id="quota-error-msg" className="seller-fs-form__error" role="alert">
                  {quotaError}
                </span>
              )}
            </div>
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
              {isSubmitting ? 'Đang lưu...' : 'Lưu đăng ký'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
