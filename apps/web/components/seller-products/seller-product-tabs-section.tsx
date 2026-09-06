'use client';

import { useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import type {
  SellerProductCategory,
  SellerProductDetail,
  SellerProductUpsertRequest,
} from '@shopee-clone/contracts';
import { Star } from '@shopee-clone/ui';

interface TabsSectionProps {
  form: SellerProductUpsertRequest;
  existingProduct: SellerProductDetail | null;
  selectedCategory: SellerProductCategory | undefined;
  readOnly?: boolean;
  onUpdateDescription: (text: string) => void;
  onUpdateAttribute: (attributeId: string, value: string) => void;
}

export function SellerProductTabsSection({
  form,
  existingProduct,
  selectedCategory,
  readOnly = false,
  onUpdateDescription,
  onUpdateAttribute,
}: TabsSectionProps) {
  const [activeTab, setActiveTab] = useState<'desc' | 'specs' | 'reviews'>('desc');

  const descLength = form.description.length;
  const maxDesc = 8000;

  const reviewCount = existingProduct?.operationalSummary?.ratingCount ?? 0;
  const ratingAvg = (
    (existingProduct?.operationalSummary?.ratingAverageBasisPoints ?? 0) / 100
  ).toFixed(1);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
    );
    const currentIndex = tabs.indexOf(event.currentTarget);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === currentIndex) return;
    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  }

  return (
    <div className={`seller-pe-tabs-card ${readOnly ? 'seller-pe-readonly' : ''}`}>
      {/* Tab bar */}
      <div className="seller-pe-tablist" role="tablist" aria-label="Chi tiết bổ sung">
        <button
          type="button"
          role="tab"
          id="tab-desc"
          aria-selected={activeTab === 'desc'}
          aria-controls="panel-desc"
          className={`seller-pe-tab ${activeTab === 'desc' ? 'is-active' : ''}`}
          aria-labelledby="tab-desc"
          tabIndex={activeTab === 'desc' ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setActiveTab('desc')}
        >
          Mô tả sản phẩm
        </button>

        <button
          type="button"
          role="tab"
          id="tab-specs"
          aria-selected={activeTab === 'specs'}
          aria-controls="panel-specs"
          className={`seller-pe-tab ${activeTab === 'specs' ? 'is-active' : ''}`}
          tabIndex={activeTab === 'specs' ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setActiveTab('specs')}
        >
          Thông số kỹ thuật
        </button>

        {existingProduct ? (
          <button
            type="button"
            role="tab"
            id="tab-reviews"
            aria-selected={activeTab === 'reviews'}
            aria-controls="panel-reviews"
            className={`seller-pe-tab ${activeTab === 'reviews' ? 'is-active' : ''}`}
            tabIndex={activeTab === 'reviews' ? 0 : -1}
            onKeyDown={handleTabKeyDown}
            onClick={() => setActiveTab('reviews')}
          >
            Đánh giá ({reviewCount})
          </button>
        ) : null}
      </div>

      {/* Tab 1: Description Panel */}
      <div
        id="panel-desc"
        role="tabpanel"
        hidden={activeTab !== 'desc'}
        aria-labelledby="tab-desc"
        className="seller-pe-tabpanel"
      >
        <textarea
          className="seller-pe-desc-textarea"
          aria-label="Mô tả"
          placeholder="Nhập mô tả chi tiết sản phẩm (công dụng, đặc tính, hướng dẫn sử dụng, bảo quản...)"
          maxLength={maxDesc}
          value={form.description}
          readOnly={readOnly}
          onChange={(e) => onUpdateDescription(e.target.value)}
        />
        <div className="seller-pe-desc-meta">
          <span>Tối đa {maxDesc} ký tự</span>
          <span className={descLength > maxDesc ? 'seller-pe-desc-meta__invalid' : undefined}>
            {descLength}/{maxDesc}
          </span>
        </div>
      </div>

      {/* Tab 2: Technical Specs Panel */}
      <div
        id="panel-specs"
        role="tabpanel"
        aria-labelledby="tab-specs"
        hidden={activeTab !== 'specs'}
        className="seller-pe-tabpanel"
      >
        {selectedCategory?.attributes && selectedCategory.attributes.length > 0 ? (
          <div className="seller-pe-form-grid seller-pe-form-grid--attributes">
            {selectedCategory.attributes.map((attr) => {
              const currentVal =
                form.attributes.find((a) => a.definitionId === attr.id)?.value || '';

              return (
                <div key={attr.id} className="seller-pe-field">
                  <label htmlFor={`attr-${attr.id}`}>
                    {attr.label} {attr.required ? '*' : ''}
                  </label>
                  {attr.allowedValues && attr.allowedValues.length > 0 ? (
                    <select
                      id={`attr-${attr.id}`}
                      value={currentVal}
                      required={attr.required}
                      aria-required={attr.required || undefined}
                      disabled={readOnly}
                      onChange={(e) => onUpdateAttribute(attr.id, e.target.value)}
                    >
                      <option value="">Chọn {attr.label.toLowerCase()}</option>
                      {attr.allowedValues.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`attr-${attr.id}`}
                      type="text"
                      placeholder={`Nhập ${attr.label.toLowerCase()}`}
                      value={currentVal}
                      required={attr.required}
                      aria-required={attr.required || undefined}
                      readOnly={readOnly}
                      onChange={(e) => onUpdateAttribute(attr.id, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="seller-pe-empty-note">
            Danh mục hiện tại không có thuộc tính thông số kỹ thuật bắt buộc.
          </p>
        )}
      </div>

      {/* Tab 3: Reviews Overview Panel */}
      {existingProduct ? (
        <div
          id="panel-reviews"
          role="tabpanel"
          aria-labelledby="tab-reviews"
          hidden={activeTab !== 'reviews'}
          className="seller-pe-tabpanel"
        >
          <div className="seller-pe-review-summary">
            <div>
              <div className="seller-pe-review-rating">
                <Star size={24} fill="#f59e0b" color="#f59e0b" aria-hidden="true" />
                <span>{ratingAvg}</span>
                <span className="seller-pe-review-rating__scale">/ 5</span>
              </div>
              <p className="seller-pe-review-summary__meta">
                Dựa trên {reviewCount} lượt đánh giá sản phẩm
              </p>
            </div>

            <Link
              href="/seller/reviews"
              className="seller-pe-btn-cancel seller-pe-review-link"
            >
              Xem đánh giá của shop
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
