'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  SellerProductCategory,
  SellerProductDetail,
  SellerProductUpsertRequest,
  SellerProductVariantInput,
} from '@shopee-clone/contracts';
import {
  createSellerProduct,
  fetchSellerProduct,
  fetchSellerProductCategories,
  stageSellerProductMedia,
  transitionSellerProduct,
  updateSellerProduct,
} from '../../lib/seller-products-api';
import { useAuthSession } from '../auth-session-provider';
import {
  errorMessage,
  initialUpsertRequest,
  sellerProductMediaUrl,
  toInput,
} from './seller-products-utils';
import { SellerProductEditorActions, SellerProductEditorHeader } from './seller-product-editor-header';
import { SellerProductGalleryEditor } from './seller-product-gallery-editor';
import type { ProductMediaItem } from './seller-product-gallery-editor';
import { SellerProductGeneralInfo } from './seller-product-general-info';
import { SellerProductVariantsEditor } from './seller-product-variants-editor';
import { SellerProductTabsSection } from './seller-product-tabs-section';

export function SellerProductEditor({ productId }: { productId?: string }) {
  const router = useRouter();
  const { authenticatedFetch, state } = useAuthSession();

  const isNew = !productId;
  const isSeller = state.status === 'authenticated' && state.user.roles.includes('seller');

  const [categories, setCategories] = useState<SellerProductCategory[]>([]);
  const [existingProduct, setExistingProduct] = useState<SellerProductDetail | null>(null);
  const [form, setForm] = useState<SellerProductUpsertRequest>(initialUpsertRequest());
  const [mediaList, setMediaList] = useState<ProductMediaItem[]>([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);

  const [loading, setLoading] = useState(!isNew);
  const [pending, setPending] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const mediaListRef = useRef(mediaList);

  useEffect(() => {
    mediaListRef.current = mediaList;
  }, [mediaList]);

  useEffect(() => {
    return () => {
      mediaListRef.current.forEach((item) => {
        if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  // Load initial data
  useEffect(() => {
    if (!isSeller) return;
    let active = true;

    // Fetch categories
    fetchSellerProductCategories(authenticatedFetch)
      .then((cats) => {
        if (!active) return;
        setCategories(cats);
        if (isNew && cats.length > 0 && cats[0]) {
          setForm((prev) => (prev.categoryId ? prev : { ...prev, categoryId: cats[0]!.id }));
        }
      })
      .catch(() => undefined);

    // If editing existing product
    if (productId) {
      fetchSellerProduct(authenticatedFetch, productId)
        .then((product) => {
          if (!active) return;
          setExistingProduct(product);
          setForm(toInput(product));
          setMediaList(
            product.media.map((m) => ({
              key: `image:${m.id}`,
              imageId: m.id,
              altText: m.altText,
              sortOrder: m.sortOrder,
              previewUrl: sellerProductMediaUrl(m.url),
              status: 'ready' as const,
            })),
          );
          setLoading(false);
        })
        .catch((err) => {
          if (!active) return;
          setErrorBanner(errorMessage(err));
          setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [authenticatedFetch, isNew, isSeller, productId]);

  // Update form patches
  const handleUpdateForm = useCallback((patch: Partial<SellerProductUpsertRequest>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrorBanner('');
  }, []);

  const handleUpdateDefaultVariant = useCallback((patch: Partial<SellerProductVariantInput>) => {
    setForm((prev) => {
      const currentDefault: SellerProductVariantInput = prev.variants[0] || {
        combination: [],
        priceMinor: 0,
        compareAtPriceMinor: null,
        stock: 0,
        weightGrams: 500,
        maxPurchaseQuantity: null,
        active: true,
      };
      const updatedDefault: SellerProductVariantInput = {
        ...currentDefault,
        ...patch,
        combination: currentDefault.combination ?? [],
      };
      return {
        ...prev,
        variants: [updatedDefault, ...prev.variants.slice(1)],
      };
    });
    setErrorBanner('');
  }, []);

  // Media upload handler
  const handleAddFiles = useCallback(
    (files: FileList) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const remainingSlots = 9 - mediaList.length;
      const fileArray = Array.from(files).slice(0, remainingSlots);
      const invalidFiles = fileArray.filter((f) => !allowedTypes.includes(f.type));
      if (invalidFiles.length > 0) {
        setErrorBanner('Chỉ hỗ trợ JPG, PNG hoặc WebP.');
      }

      const newItems: ProductMediaItem[] = fileArray.map((file, idx) => {
        const isAllowed = allowedTypes.includes(file.type);
        return {
          key: `local:${Date.now()}:${file.name}:${idx}`,
          altText: null,
          sortOrder: mediaList.length + idx,
          previewUrl: isAllowed ? URL.createObjectURL(file) : '',
          status: isAllowed ? ('ready' as const) : ('error' as const),
          file: isAllowed ? file : undefined,
          error: isAllowed ? undefined : 'Chỉ hỗ trợ JPG, PNG hoặc WebP.',
        };
      });

      setMediaList((prev) => [...prev, ...newItems]);
    },
    [mediaList.length],
  );

  const handleRemoveMedia = useCallback((index: number) => {
    setMediaList((prev) => {
      const target = prev[index];
      if (target?.previewUrl && target.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
    setSelectedMediaIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return Math.max(0, prev - 1);
      return prev;
    });
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === form.categoryId),
    [categories, form.categoryId],
  );

  const isMultiVariant = form.optionGroups.length > 0 && form.variants.length > 1;

  // Save / Publish
  const handleSave = useCallback(
    async (publish = false) => {
      setPending(true);
      setErrorBanner('');
      setSuccessBanner('');

      const validMedia = mediaList.filter((m) => m.status === 'ready');

      // If publish requested, check completeness:
      if (publish) {
        const missing: string[] = [];
        if (validMedia.length === 0) missing.push('ảnh sản phẩm');
        if (
          !form.packageLengthMm ||
          !form.packageWidthMm ||
          !form.packageHeightMm ||
          form.packageLengthMm <= 0 ||
          form.packageWidthMm <= 0 ||
          form.packageHeightMm <= 0
        ) {
          missing.push('kích thước kiện hàng');
        }
        if (missing.length > 0) {
          setSuccessBanner(`Chưa thể đăng bán. Hãy bổ sung: ${missing.join(', ')}.`);
          setPending(false);
          return;
        }
      }

      // Validation
      if (!form.name.trim()) {
        setErrorBanner('Vui lòng nhập tên sản phẩm.');
        setPending(false);
        return;
      }
      if (!form.categoryId) {
        setErrorBanner('Vui lòng chọn danh mục sản phẩm.');
        setPending(false);
        return;
      }

      try {
        // Stage any newly added files
        const stagedMedia = await Promise.all(
          validMedia.map(async (item, idx) => {
            if (item.file) {
              const staged = await stageSellerProductMedia(authenticatedFetch, item.file);
              return {
                assetId: staged.id,
                altText: item.altText ?? null,
                sortOrder: idx,
              };
            }
            return {
              imageId: item.imageId,
              assetId: item.assetId,
              altText: item.altText ?? null,
              sortOrder: idx,
            };
          }),
        );

        const payload: SellerProductUpsertRequest = {
          ...form,
          media: stagedMedia,
        };

        let savedProduct: SellerProductDetail;
        if (productId) {
          savedProduct = await updateSellerProduct(authenticatedFetch, productId, payload);
          setExistingProduct(savedProduct);
          setMediaList(
            savedProduct.media.map((m) => ({
              key: `image:${m.id}`,
              imageId: m.id,
              altText: m.altText,
              sortOrder: m.sortOrder,
              previewUrl: sellerProductMediaUrl(m.url),
              status: 'ready' as const,
            })),
          );
          setSuccessBanner('Đã cập nhật sản phẩm.');
        } else {
          savedProduct = await createSellerProduct(authenticatedFetch, payload);
          setExistingProduct(savedProduct);
          setMediaList(
            savedProduct.media.map((m) => ({
              key: `image:${m.id}`,
              imageId: m.id,
              altText: m.altText,
              sortOrder: m.sortOrder,
              previewUrl: sellerProductMediaUrl(m.url),
              status: 'ready' as const,
            })),
          );
          if (publish) {
            try {
              await transitionSellerProduct(authenticatedFetch, savedProduct.id, 'published');
            } catch {
              setSuccessBanner('Đã lưu nháp sản phẩm (chưa thể đăng bán do vi phạm hoặc quyền).');
              router.push(`/seller/products/${savedProduct.id}/edit`);
              return;
            }
          }
          router.push('/seller/products');
          return;
        }
      } catch (err) {
        setErrorBanner(errorMessage(err));
      } finally {
        setPending(false);
      }
    },
    [authenticatedFetch, form, mediaList, productId, router],
  );

  if (state.status !== 'authenticated') {
    return (
      <div className="seller-products-page">
        <div className="seller-pe-card" style={{ textAlign: 'center', padding: '48px' }}>
          <h2>Cần đăng nhập</h2>
          <p>Vui lòng đăng nhập để truy cập trang quản lý sản phẩm.</p>
        </div>
      </div>
    );
  }

  if (!isSeller) {
    return (
      <div className="seller-products-page">
        <div className="seller-pe-card seller-products-state-card">
          <h2>Chưa thể chỉnh sửa sản phẩm</h2>
          <p>Tài khoản cần có quyền Người bán và shop đã được phê duyệt.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="seller-products-page">
        <div className="seller-pe-card seller-products-state-card">
          <h2>Đang tải thông tin sản phẩm…</h2>
        </div>
      </div>
    );
  }

  if (productId && errorBanner && !existingProduct) {
    return (
      <div className="seller-products-page">
        <div className="seller-pe-card seller-products-state-card" role="alert">
          <h2>Không thể tải sản phẩm</h2>
          <p>{errorBanner}</p>
          <div className="seller-products-state-card__actions">
            <Link href="/seller/products" className="seller-pe-btn-cancel">
              Quay lại danh sách
            </Link>
            <button type="button" className="seller-pe-btn-save" onClick={() => router.refresh()}>
              Thử lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="seller-products-page" data-testid="seller-product-editor-page" aria-busy={pending}>
      {/* 1. Header with Breadcrumb & Actions */}
      <SellerProductEditorHeader
        productName={existingProduct?.name || form.name}
        isNew={isNew}
        pending={pending}
        isArchived={existingProduct?.lifecycle === 'archived'}
        onCancel={() => router.push('/seller/products')}
        onSave={handleSave}
      />

      {/* Notifications */}
      {errorBanner ? (
        <div
          role="alert"
          className="seller-products-banner seller-products-banner--error"
        >
          {errorBanner}
        </div>
      ) : null}

      {successBanner ? (
        <div
          role="status"
          className="seller-products-banner seller-products-banner--success"
        >
          {successBanner}
        </div>
      ) : null}

      {/* 2. Grid: Gallery (420px) + General Info Card (664px) */}
      <div className="seller-pe-grid">
        <SellerProductGalleryEditor
          mediaList={mediaList}
          readOnly={existingProduct?.lifecycle === 'archived'}
          selectedIndex={selectedMediaIndex}
          onSelectIndex={setSelectedMediaIndex}
          onAddFiles={handleAddFiles}
          onRemoveItem={handleRemoveMedia}
        />

        <SellerProductGeneralInfo
          form={form}
          existingProduct={existingProduct}
          categories={categories}
          isMultiVariant={isMultiVariant}
          readOnly={existingProduct?.lifecycle === 'archived'}
          onUpdateForm={handleUpdateForm}
          onUpdateDefaultVariant={handleUpdateDefaultVariant}
        />
      </div>

      {/* 3. Variants Section (if multi-variant or configuring option groups) */}
      <SellerProductVariantsEditor
        form={form}
        mediaList={mediaList}
        readOnly={existingProduct?.lifecycle === 'archived'}
        onUpdateForm={handleUpdateForm}
      />

      {/* 4. Tabs Section (Mô tả, Thông số kỹ thuật, Đánh giá) */}
      <SellerProductTabsSection
        form={form}
        existingProduct={existingProduct}
        selectedCategory={selectedCategory}
        readOnly={existingProduct?.lifecycle === 'archived'}
        onUpdateDescription={(text) => handleUpdateForm({ description: text })}
        onUpdateAttribute={(definitionId, value) => {
          const nextAttrs = form.attributes.filter((a) => a.definitionId !== definitionId);
          if (value) nextAttrs.push({ definitionId, value });
          handleUpdateForm({ attributes: nextAttrs });
        }}
      />
      {isNew ? (
        <div className="seller-pe-footer-actions" role="group" aria-label="Thao tác sản phẩm mới">
          <SellerProductEditorActions
            isNew
            pending={pending}
            isArchived={false}
            onCancel={() => router.push('/seller/products')}
            onSave={handleSave}
          />
        </div>
      ) : null}
    </div>
  );
}
