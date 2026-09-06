'use client';

import { Plus, Trash2 } from '@shopee-clone/ui';
import type {
  SellerProductOptionInput,
  SellerProductUpsertRequest,
  SellerProductVariantInput,
} from '@shopee-clone/contracts';
import type { ProductMediaItem } from './seller-product-gallery-editor';
import {
  formatInteger,
  parseFormattedInteger,
  variantsFor,
} from './seller-products-utils';

interface VariantsEditorProps {
  form: SellerProductUpsertRequest;
  mediaList?: ProductMediaItem[];
  readOnly?: boolean;
  onUpdateForm: (patch: Partial<SellerProductUpsertRequest>) => void;
}

export function SellerProductVariantsEditor({
  form,
  mediaList = [],
  readOnly = false,
  onUpdateForm,
}: VariantsEditorProps) {
  const groups = form.optionGroups;
  const effectiveMedia = mediaList.length > 0 ? mediaList : form.media;

  function handleAddGroup() {
    if (groups.length >= 2) return;
    const nextGroups: SellerProductOptionInput[] = [
      ...groups,
      { name: groups.length === 0 ? 'Màu sắc' : 'Kích thước', values: [''] },
    ];
    onUpdateForm({
      optionGroups: nextGroups,
      variants: variantsFor(nextGroups, form.variants),
    });
  }

  function handleRemoveGroup(index: number) {
    const nextGroups = groups.filter((_, i) => i !== index);
    onUpdateForm({
      optionGroups: nextGroups,
      variants: variantsFor(nextGroups, form.variants),
    });
  }

  function handleGroupNameChange(index: number, name: string) {
    const nextGroups = groups.map((group, i) => (i === index ? { ...group, name } : group));
    onUpdateForm({
      optionGroups: nextGroups,
      variants: variantsFor(nextGroups, form.variants),
    });
  }

  function handleAddValue(groupIndex: number) {
    const nextGroups = groups.map((group, i) =>
      i === groupIndex ? { ...group, values: [...group.values, ''] } : group,
    );
    onUpdateForm({
      optionGroups: nextGroups,
      variants: variantsFor(nextGroups, form.variants),
    });
  }

  function handleValueChange(groupIndex: number, valIndex: number, value: string) {
    const nextGroups = groups.map((group, i) => {
      if (i !== groupIndex) return group;
      const values = group.values.map((v, vi) => (vi === valIndex ? value : v));
      return { ...group, values };
    });
    onUpdateForm({
      optionGroups: nextGroups,
      variants: variantsFor(nextGroups, form.variants),
    });
  }

  function handleRemoveValue(groupIndex: number, valIndex: number) {
    const nextGroups = groups.map((group, i) => {
      if (i !== groupIndex) return group;
      const values = group.values.filter((_, vi) => vi !== valIndex);
      return { ...group, values: values.length > 0 ? values : [''] };
    });
    onUpdateForm({
      optionGroups: nextGroups,
      variants: variantsFor(nextGroups, form.variants),
    });
  }

  function handleUpdateVariant(index: number, patch: Partial<SellerProductVariantInput>) {
    const nextVariants = form.variants.map((v, i) => (i === index ? { ...v, ...patch } : v));
    onUpdateForm({ variants: nextVariants });
  }

  return (
    <div
      className={`seller-pe-card seller-pe-card--variants ${readOnly ? 'seller-pe-readonly' : ''}`}
      aria-disabled={readOnly}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '16px',
          marginBottom: '20px',
        }}
      >
        <h2 className="seller-pe-card__title" style={{ border: 'none', padding: 0, margin: 0 }}>
          Phân loại & Biến thể hàng
        </h2>
        {groups.length < 2 ? (
          <button
            type="button"
            className="seller-pe-btn-cancel"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            onClick={handleAddGroup}
          >
            <Plus size={14} aria-hidden="true" />
            + Thêm nhóm phân loại
          </button>
        ) : null}
      </div>

      {/* Option Groups Config */}
      {groups.length > 0 ? (
        <div style={{ display: 'grid', gap: '16px', marginBottom: '24px' }}>
          {groups.map((group, gIdx) => (
            <div
              key={gIdx}
              style={{
                background: '#f9fafb',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '12px',
                }}
              >
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label
                    htmlFor={`sp-group-name-${gIdx}`}
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#4b5563',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    Tên nhóm phân loại {gIdx + 1}
                  </label>
                  <input
                    id={`sp-group-name-${gIdx}`}
                    type="text"
                    style={{
                      width: '100%',
                      height: '36px',
                      padding: '0 12px',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                      fontSize: '13px',
                      background: '#fff',
                    }}
                    value={group.name}
                    onChange={(e) => handleGroupNameChange(gIdx, e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="seller-pl-btn-icon seller-pl-btn-icon--delete"
                  style={{ alignSelf: 'flex-end' }}
                  onClick={() => handleRemoveGroup(gIdx)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>

              {/* Group Values */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
                {group.values.map((val, vIdx) => (
                  <div
                    key={vIdx}
                    style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}
                  >
                    <label
                      htmlFor={`sp-group-val-${gIdx}-${vIdx}`}
                      style={{ fontSize: '11px', color: '#6b7280' }}
                    >
                      Giá trị {gIdx + 1}-{vIdx + 1}
                    </label>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        id={`sp-group-val-${gIdx}-${vIdx}`}
                        type="text"
                        placeholder={`Phân loại ${vIdx + 1}`}
                        style={{
                          width: '140px',
                          height: '34px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb',
                          fontSize: '13px',
                          background: '#fff',
                        }}
                        value={val}
                        onChange={(e) => handleValueChange(gIdx, vIdx, e.target.value)}
                      />
                      {group.values.length > 1 ? (
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#9ca3af',
                            cursor: 'pointer',
                            padding: '2px',
                          }}
                          onClick={() => handleRemoveValue(gIdx, vIdx)}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>

                    {/* Option value media selector (for first group e.g. color) */}
                    {gIdx === 0 && effectiveMedia && effectiveMedia.length > 0 ? (
                      <div>
                        <label
                          htmlFor={`opt-media-${gIdx}-${vIdx}`}
                          style={{ fontSize: '11px', color: '#6b7280' }}
                        >
                          Ảnh cho giá trị {gIdx + 1}-{vIdx + 1}
                        </label>
                        <select
                          id={`opt-media-${gIdx}-${vIdx}`}
                          style={{
                            width: '140px',
                            height: '28px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            border: '1px solid #e5e7eb',
                          }}
                          value={
                            (() => {
                              const found = form.optionValueMedia?.find(
                                (ovm) => ovm.groupIndex === gIdx && ovm.value === val,
                              );
                              return found?.mediaRef?.assetId || found?.mediaRef?.imageId || '';
                            })()
                          }
                          onChange={(e) => {
                            const mediaId = e.target.value;
                            const nextOvm = (form.optionValueMedia || []).filter(
                              (ovm) => !(ovm.groupIndex === gIdx && ovm.value === val),
                            );
                            if (mediaId) {
                              nextOvm.push({
                                groupIndex: gIdx,
                                value: val,
                                mediaRef: { assetId: mediaId, imageId: mediaId },
                              });
                            }
                            onUpdateForm({ optionValueMedia: nextOvm });
                          }}
                        >
                          <option value="">Không dùng ảnh</option>
                          {effectiveMedia.map((m, mIdx) => (
                            <option key={m.assetId || m.imageId || (m as ProductMediaItem).key || mIdx} value={m.assetId || m.imageId || (m as ProductMediaItem).key || ''}>
                              Ảnh {mIdx + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  style={{
                    height: '34px',
                    marginTop: '19px',
                    padding: '0 12px',
                    borderRadius: '6px',
                    border: '1px dashed #2563eb',
                    background: '#eff6ff',
                    color: '#2563eb',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onClick={() => handleAddValue(gIdx)}
                >
                  + Thêm giá trị
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
          Sản phẩm hiện là đơn biến thể. Thêm nhóm phân loại (màu sắc, kích cỡ) nếu sản phẩm có nhiều lựa chọn.
        </p>
      )}

      {/* Combinations Matrix Table */}
      {groups.length > 0 && form.variants.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="seller-pl-table" style={{ minWidth: '700px' }}>
            <thead>
              <tr>
                <th>Biến thể</th>
                <th>Mã SKU</th>
                <th>Giá bán (₫) *</th>
                <th>Giá so sánh (₫)</th>
                <th>Kho hàng *</th>
                <th>Cân nặng (g)</th>
              </tr>
            </thead>
            <tbody>
              {form.variants.map((v, vIdx) => (
                <tr key={v.combination.join('|') || vIdx}>
                  <td>
                    <strong>{v.combination.join(' · ') || 'Mặc định'}</strong>
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      SKU tự sinh sau khi lưu
                    </span>
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Giá bán ${v.combination.join(' ')}`}
                      style={{
                        width: '120px',
                        height: '34px',
                        padding: '0 8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}
                      value={formatInteger(v.priceMinor)}
                      onChange={(e) =>
                        handleUpdateVariant(vIdx, {
                          priceMinor: parseFormattedInteger(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      style={{
                        width: '120px',
                        height: '34px',
                        padding: '0 8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}
                      value={v.compareAtPriceMinor ? formatInteger(v.compareAtPriceMinor) : ''}
                      onChange={(e) => {
                        const parsed = parseFormattedInteger(e.target.value);
                        handleUpdateVariant(vIdx, {
                          compareAtPriceMinor: parsed > 0 ? parsed : null,
                        });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Tồn kho ${v.combination.join(' ')}`}
                      style={{
                        width: '90px',
                        height: '34px',
                        padding: '0 8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}
                      value={formatInteger(v.stock)}
                      onChange={(e) =>
                        handleUpdateVariant(vIdx, {
                          stock: parseFormattedInteger(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      style={{
                        width: '90px',
                        height: '34px',
                        padding: '0 8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}
                      value={v.weightGrams || ''}
                      onChange={(e) =>
                        handleUpdateVariant(vIdx, {
                          weightGrams: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
