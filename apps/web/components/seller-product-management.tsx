'use client';

import {
  generateSellerProductCombinations,
  isSellerProductUpsertRequest,
  type SellerProductCategory,
  type SellerProductDetail,
  type SellerProductLifecycle,
  type SellerProductMediaInput,
  type SellerProductMediaStageResponse,
  type SellerProductOptionInput,
  type SellerProductOptionValueMediaInput,
  type SellerProductUpsertRequest,
  type SellerProductVariantInput,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { RoleApiError } from '../lib/role-api';
import {
  createSellerProduct,
  deleteSellerProductDraft,
  fetchSellerProduct,
  fetchSellerProductCategories,
  fetchSellerProducts,
  stageSellerProductMedia,
  transitionSellerProduct,
  updateSellerProduct,
} from '../lib/seller-products-api';
import { marketplaceMediaUrl } from '../lib/marketplace-media-url';
import { useAuthSession } from './auth-session-provider';

const excludedSellerCategorySlugs = new Set(['mobile-accessories', 'kitchen-appliances']);

function sellerProductMediaUrl(value: string | null | undefined): string {
  return marketplaceMediaUrl(value);
}

const emptyVariant = (): SellerProductVariantInput => ({
  combination: [],
  priceMinor: 1,
  compareAtPriceMinor: null,
  stock: 1,
  weightGrams: 500,
  maxPurchaseQuantity: null,
  active: true,
});

const initial = (categoryId = ''): SellerProductUpsertRequest => ({
  name: '',
  description: '',
  categoryId,
  attributes: [],
  media: [],
  packageLengthMm: null,
  packageWidthMm: null,
  packageHeightMm: null,
  optionGroups: [],
  optionValueMedia: [],
  variants: [emptyVariant()],
});

const integer = (value: string, fallback: number | null = null) =>
  value === '' ? fallback : Number(value);

function formatInteger(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(
    Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)),
  );
}

function parseFormattedInteger(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

function configuredGroups(groups: SellerProductOptionInput[]): SellerProductOptionInput[] {
  return groups
    .map((group) => ({
      name: group.name.trim(),
      values: group.values.map((value) => value.trim()).filter(Boolean),
    }))
    .filter((group) => group.name.length > 0 && group.values.length > 0);
}

function variantsFor(groups: SellerProductOptionInput[], current: SellerProductVariantInput[]) {
  const combinations = generateSellerProductCombinations(configuredGroups(groups));
  const expected = combinations.length > 0 ? combinations : [[]];
  const retained = new Map(current.map((variant) => [variant.combination.join('\u001f'), variant]));
  return expected.map(
    (combination) => retained.get(combination.join('\u001f')) ?? { ...emptyVariant(), combination },
  );
}

function normalizeOptionGroups(groups: SellerProductOptionInput[]) {
  return configuredGroups(groups);
}

function toInput(product: SellerProductDetail): SellerProductUpsertRequest {
  return {
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    attributes: product.attributes,
    media: product.media.map(({ id, altText, sortOrder }) => ({ imageId: id, altText, sortOrder })),
    packageLengthMm: product.packageLengthMm,
    packageWidthMm: product.packageWidthMm,
    packageHeightMm: product.packageHeightMm,
    optionGroups: product.optionGroups,
    optionValueMedia: product.optionValueMedia ?? [],
    variants: product.variants.map((variant) => ({
      combination: variant.combination,
      priceMinor: variant.priceMinor,
      compareAtPriceMinor: variant.compareAtPriceMinor,
      stock: variant.stock,
      weightGrams: variant.weightGrams,
      maxPurchaseQuantity: variant.maxPurchaseQuantity,
      active: variant.active,
    })),
  };
}

type ProductMediaItem = SellerProductMediaInput & {
  key: string;
  previewUrl: string;
  status: 'uploading' | 'ready' | 'error';
  file?: File;
  error?: string;
};

function mediaItemFromExisting(media: SellerProductDetail['media'][number]): ProductMediaItem {
  return {
    key: `image:${media.id}`,
    imageId: media.id,
    altText: media.altText,
    sortOrder: media.sortOrder,
    previewUrl: sellerProductMediaUrl(media.url),
    status: 'ready',
  };
}

function mediaReferenceMatches(
  item: ProductMediaItem,
  reference: SellerProductOptionValueMediaInput['mediaRef'] | undefined,
): boolean {
  return Boolean(
    reference &&
    ((reference.assetId && item.assetId === reference.assetId) ||
      (reference.imageId && item.imageId === reference.imageId)),
  );
}

function errorMessage(error: unknown) {
  if (error instanceof RoleApiError) {
    if (error.status === 400 && error.problem?.invalidParameters?.length) {
      return `Thông tin chưa hợp lệ: ${error.problem.invalidParameters.join(', ')}.`;
    }
    if (error.status === 400 && error.problem?.detail) {
      return `Không thể lưu sản phẩm: ${error.problem.detail}`;
    }
    return error.status === 400
      ? 'Thông tin sản phẩm chưa hợp lệ. Hãy kiểm tra các trường được nhập.'
      : error.status === 403
        ? 'Tài khoản chưa có quyền seller hoặc shop chưa đủ điều kiện hoạt động.'
        : error.status === 404
          ? 'Sản phẩm không tồn tại hoặc không thuộc shop hiện tại.'
        : error.status === 409
          ? 'Sản phẩm hoặc mã định danh đang xung đột với dữ liệu hiện có.'
          : 'Không thể lưu sản phẩm. Hãy thử lại.';
  }
  return 'Không thể lưu sản phẩm. Hãy thử lại.';
}

type SellerProductListItem = Awaited<ReturnType<typeof fetchSellerProducts>>['items'][number];
type SellerProductDialogItem = Pick<SellerProductListItem, 'id' | 'name' | 'primaryMediaUrl'>;

function SellerProductDeleteDialog({
  item,
  pending,
  error,
  eyebrow = 'Xác nhận xóa',
  title,
  description,
  confirmLabel = 'Xóa sản phẩm',
  confirmTone = 'danger',
  restoreFocusElement,
  onCancel,
  onConfirm,
}: {
  item: SellerProductDialogItem | null;
  pending: boolean;
  error: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  confirmTone?: 'danger' | 'accent';
  restoreFocusElement?: HTMLElement | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [imageFailedKey, setImageFailedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!item) return;
    previousFocus.current = restoreFocusElement ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [item, restoreFocusElement]);
  if (!item) return null;
  const imageKey = `${item.id}:${item.primaryMediaUrl ?? ''}`;
  const imageFailed = imageFailedKey === imageKey;
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !pending) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <div className="seller-product-dialog-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="seller-product-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`seller-product-delete-title-${item.id}`}
        aria-describedby={`seller-product-delete-description-${item.id}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="seller-product-delete-dialog__media">
          {item.primaryMediaUrl && !imageFailed ? (
            <img src={sellerProductMediaUrl(item.primaryMediaUrl)} alt="" onError={() => setImageFailedKey(imageKey)} />
          ) : (
            <span aria-hidden="true">Ảnh</span>
          )}
        </div>
        <div className="seller-product-delete-dialog__content">
          <span className="operational-eyebrow">{eyebrow}</span>
          <h2 id={`seller-product-delete-title-${item.id}`}>{title ?? `Xóa “${item.name}”?`}</h2>
          <p id={`seller-product-delete-description-${item.id}`}>
            {description ?? 'Sản phẩm sẽ biến mất ngay khỏi Seller Center, giỏ hàng và trang mua sắm. Dữ liệu lịch sử được giữ lại; bản ghi không có lịch sử sẽ được dọn sau 7 ngày.'}
          </p>
          {error ? <p className="seller-product-delete-dialog__error" role="alert">{error}</p> : null}
          {pending ? <p className="seller-product-delete-dialog__progress" role="status" aria-live="polite">Đang xử lý…</p> : null}
          <div className="seller-product-delete-dialog__actions">
            <button ref={cancelRef} type="button" disabled={pending} onClick={onCancel}>Hủy</button>
            <button
              ref={confirmRef}
              type="button"
              className={
                confirmTone === 'accent'
                  ? 'seller-product-delete-dialog__accent'
                  : 'seller-product-delete-dialog__danger'
              }
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? 'Đang xử lý…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SellerProductItemImage({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [failed, setFailed] = useState(false);
  const resolved = src ? sellerProductMediaUrl(src) : '';
  if (!resolved || failed) {
    return (
      <div className="seller-product-image-fallback" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="#94a3b8">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
        </svg>
      </div>
    );
  }
  return <img src={resolved} alt={alt} onError={() => setFailed(true)} />;
}

export function SellerProductList() {
  const { authenticatedFetch, state } = useAuthSession();
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchSellerProducts>>['items']>([]);
  const [lifecycle, setLifecycle] = useState<SellerProductLifecycle | undefined>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogItem, setDeleteDialogItem] = useState<SellerProductListItem | null>(null);
  const [deleteDialogError, setDeleteDialogError] = useState('');
  const [deleteDialogTrigger, setDeleteDialogTrigger] = useState<HTMLElement | null>(null);
  const [hideDialogItem, setHideDialogItem] = useState<SellerProductListItem | null>(null);
  const [hideDialogError, setHideDialogError] = useState('');
  const [hideDialogTrigger, setHideDialogTrigger] = useState<HTMLElement | null>(null);
  const load = useCallback(
    (cursor?: string) => {
      void fetchSellerProducts(authenticatedFetch, { cursor, lifecycle })
        .then((page) => {
          setItems((current) => (cursor ? [...current, ...page.items] : page.items));
          setNextCursor(page.nextCursor);
        })
        .catch((error) => setMessage(errorMessage(error)));
    },
    [authenticatedFetch, lifecycle],
  );
  const canManage = state.status === 'authenticated' && state.user.roles.includes('seller');
  function requestHide(item: SellerProductListItem, trigger: HTMLElement) {
    setMessage('');
    setHideDialogError('');
    setHideDialogTrigger(trigger);
    setHideDialogItem(item);
  }
  async function confirmHide() {
    if (!hideDialogItem || publishingId !== null) return;
    setPublishingId(hideDialogItem.id);
    setHideDialogError('');
    try {
      await transitionSellerProduct(authenticatedFetch, hideDialogItem.id, 'hidden');
      setItems((current) =>
        current.map((item) => (item.id === hideDialogItem.id ? { ...item, lifecycle: 'hidden' } : item)),
      );
      setHideDialogItem(null);
      setMessage('Đã ẩn sản phẩm.');
    } catch (error) {
      setHideDialogError(errorMessage(error));
    } finally {
      setPublishingId(null);
    }
  }
  async function changeLifecycle(productId: string, next: 'published' | 'hidden') {
    setMessage('');
    setPublishingId(productId);
    try {
      await transitionSellerProduct(authenticatedFetch, productId, next);
      setItems((current) =>
        current.map((item) => (item.id === productId ? { ...item, lifecycle: next } : item)),
      );
      setMessage(next === 'published' ? 'Sản phẩm đã được đăng bán.' : 'Đã ẩn sản phẩm.');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPublishingId(null);
    }
  }
  function requestDelete(item: SellerProductListItem, trigger?: HTMLElement) {
    setDeleteDialogError('');
    setDeleteDialogTrigger(trigger ?? null);
    setDeleteDialogItem(item);
  }
  async function confirmDelete() {
    if (!deleteDialogItem) return;
    const item = deleteDialogItem;
    setMessage('');
    setDeletingId(item.id);
    try {
      await deleteSellerProductDraft(authenticatedFetch, item.id);
      setItems((current) => current.filter((product) => product.id !== item.id));
      setDeleteDialogItem(null);
      setMessage('Đã xóa sản phẩm.');
    } catch (error) {
      setDeleteDialogError(errorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }
  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);
  if (state.status !== 'authenticated')
    return (
      <section className="operational-panel">
        <h1>Cần đăng nhập</h1>
        <Link href="/login">Đăng nhập</Link>
      </section>
    );
  if (!state.user.roles.includes('seller'))
    return (
      <section className="operational-panel">
        <h1>Chưa thể quản lý sản phẩm</h1>
        <p>Shop cần được duyệt và tài khoản phải có quyền seller.</p>
      </section>
    );
  return (
    <section className="operational-panel seller-products-panel">
      <div className="seller-products-heading">
        <div>
          <span className="operational-eyebrow">Seller Center</span>
          <h1>Sản phẩm của tôi</h1>
          <p>Quản lý nháp, sản phẩm đang bán, ẩn và lưu trữ.</p>
        </div>
        <Link className="seller-product-primary" href="/seller/products/new">
          Thêm sản phẩm
        </Link>
      </div>
      <label className="seller-product-filter">
        Trạng thái{' '}
        <select
          value={lifecycle ?? ''}
          onChange={(event) =>
            setLifecycle((event.target.value || undefined) as SellerProductLifecycle | undefined)
          }
        >
          <option value="">Tất cả</option>
          <option value="draft">Bản nháp</option>
          <option value="published">Đang bán</option>
          <option value="hidden">Đã ẩn</option>
          <option value="archived">Đã lưu trữ</option>
        </select>
      </label>
      {message ? <p role="alert">{message}</p> : null}
      <div className="seller-product-list">
        {items.length === 0 ? (
          <p>Chưa có sản phẩm. Hãy tạo sản phẩm đầu tiên.</p>
        ) : (
          items.map((item) => (
            <div className="seller-product-row" key={item.id}>
              <Link className="seller-product-row-main" href={`/seller/products/${item.id}`}>
                <div>
                  <SellerProductItemImage src={item.primaryMediaUrl} alt="" />
                </div>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.categoryName} · {item.variantCount} biến thể · tồn {item.stockQuantity}
                  </small>
                </div>
              </Link>
              <div className="seller-product-row-actions">
                <b className={`seller-product-status seller-product-status--${item.lifecycle}`}>
                  {item.lifecycle === 'published'
                    ? 'Đang bán'
                    : item.lifecycle === 'hidden'
                      ? 'Đã ẩn'
                      : item.lifecycle === 'archived'
                        ? 'Đã lưu trữ'
                        : 'Bản nháp'}
                </b>
                <Link className="seller-product-row-action" href={`/seller/products/${item.id}/edit`}>
                  Cập nhật sản phẩm
                </Link>
                {item.lifecycle === 'draft' ? (
                  <div className="seller-product-row-draft-actions">
                    <button
                      className="seller-product-row-action seller-product-row-publish"
                      type="button"
                      disabled={publishingId !== null || deletingId !== null || item.moderationStatus === 'suspended'}
                      onClick={() => void changeLifecycle(item.id, 'published')}
                    >
                      {publishingId === item.id ? 'Đang đăng...' : 'Đăng bán'}
                    </button>
                    <button
                      className="seller-product-row-delete"
                      type="button"
                      title="Xóa sản phẩm nháp"
                      aria-label={`Xóa sản phẩm nháp ${item.name}`}
                      disabled={publishingId !== null || deletingId !== null}
                      onClick={(event) => requestDelete(item, event.currentTarget)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" width="18" height="18" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                      <span className="seller-product-visually-hidden">{deletingId === item.id ? 'Đang xóa' : 'Xóa'}</span>
                    </button>
                  </div>
                ) : null}
                {item.lifecycle === 'hidden' ? (
                  <button
                    className="seller-product-row-action seller-product-row-publish"
                    type="button"
                    disabled={publishingId !== null || deletingId !== null || item.moderationStatus === 'suspended'}
                    onClick={() => void changeLifecycle(item.id, 'published')}
                  >
                    {publishingId === item.id ? 'Đang đăng...' : 'Đăng bán'}
                  </button>
                ) : null}
                {item.lifecycle === 'published' ? (
                  <div className="seller-product-row-draft-actions">
                    <button
                      className="seller-product-row-hide"
                      type="button"
                      title="Ẩn sản phẩm"
                      aria-label={`Ẩn sản phẩm ${item.name}`}
                      disabled={publishingId !== null || deletingId !== null}
                      onClick={(event) => requestHide(item, event.currentTarget)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                      <span className="seller-product-visually-hidden">
                        {publishingId === item.id ? 'Đang ẩn' : 'Ẩn sản phẩm'}
                      </span>
                    </button>
                    <button
                      className="seller-product-row-delete"
                      type="button"
                      title="Xóa sản phẩm đang bán"
                      aria-label={`Xóa sản phẩm đang bán ${item.name}`}
                      disabled={publishingId !== null || deletingId !== null}
                      onClick={(event) => requestDelete(item, event.currentTarget)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" width="18" height="18" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                      <span className="seller-product-visually-hidden">{deletingId === item.id ? 'Đang xóa' : 'Xóa'}</span>
                    </button>
                  </div>
                ) : null}
                {item.lifecycle !== 'draft' && item.lifecycle !== 'published' ? (
                  <button
                    className="seller-product-row-delete"
                    type="button"
                    title="Xóa sản phẩm"
                    aria-label={`Xóa sản phẩm ${item.name}`}
                    disabled={publishingId !== null || deletingId !== null}
                    onClick={(event) => requestDelete(item, event.currentTarget)}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" width="18" height="18" fill="currentColor">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                    </svg>
                    <span className="seller-product-visually-hidden">{deletingId === item.id ? 'Đang xóa' : 'Xóa'}</span>
                  </button>
                ) : null}
                {item.moderationStatus === 'suspended' ? <small>Kiểm duyệt tạm ngưng</small> : null}
              </div>
            </div>
          ))
        )}
      </div>
      {nextCursor ? (
        <button type="button" className="seller-product-load-more" onClick={() => load(nextCursor)}>
          Tải thêm
        </button>
      ) : null}
      <SellerProductDeleteDialog item={deleteDialogItem} pending={deletingId !== null} error={deleteDialogError} restoreFocusElement={deleteDialogTrigger} onCancel={() => { if (!deletingId) setDeleteDialogItem(null); }} onConfirm={() => void confirmDelete()} />
      <SellerProductDeleteDialog
        item={hideDialogItem}
        pending={publishingId !== null}
        error={hideDialogError}
        restoreFocusElement={hideDialogTrigger}
        eyebrow="Xác nhận ẩn"
        title={hideDialogItem ? `Ẩn “${hideDialogItem.name}”?` : undefined}
        description="Sản phẩm sẽ biến mất khỏi trang mua sắm cho đến khi bạn đăng bán lại. Thông tin vẫn được giữ trong Seller Center."
        confirmLabel="Ẩn sản phẩm"
        confirmTone="accent"
        onCancel={() => { if (!publishingId) setHideDialogItem(null); }}
        onConfirm={() => void confirmHide()}
      />
    </section>
  );
}

export function SellerProductEditor({ productId }: { productId?: string }) {
  const { authenticatedFetch, state } = useAuthSession();
  const router = useRouter();
  const [categories, setCategories] = useState<SellerProductCategory[]>([]);
  const [form, setForm] = useState<SellerProductUpsertRequest>(initial());
  const [mediaItems, setMediaItems] = useState<ProductMediaItem[]>([]);
  const [optionMediaKeys, setOptionMediaKeys] = useState<Record<string, string>>({});
  const [product, setProduct] = useState<SellerProductDetail | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(Boolean(productId));
  const canManage = state.status === 'authenticated' && state.user.roles.includes('seller');
  const loadedKeyRef = useRef<string | null>(null);
  const loadingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canManage) {
      loadedKeyRef.current = null;
      loadingKeyRef.current = null;
      return;
    }
    const loadKey = productId ?? 'new';
    if (loadedKeyRef.current === loadKey || loadingKeyRef.current === loadKey) return;
    loadingKeyRef.current = loadKey;
    setLoadingProduct(Boolean(productId));
    void Promise.all([
      fetchSellerProductCategories(authenticatedFetch),
      productId ? fetchSellerProduct(authenticatedFetch, productId) : Promise.resolve(null),
    ])
      .then(([nextCategories, current]) => {
        if (loadingKeyRef.current !== loadKey) return;
        loadedKeyRef.current = loadKey;
        setLoadingProduct(false);
        setCategories(nextCategories);
        setProduct(current);
        setForm(
          current
            ? toInput(current)
            : initial(nextCategories.find((category) => category.isLeaf)?.id ?? ''),
        );
        setMediaItems(current ? current.media.map(mediaItemFromExisting) : []);
        setOptionMediaKeys({});
      })
      .catch((error) => {
        if (loadingKeyRef.current === loadKey) loadingKeyRef.current = null;
        setLoadingProduct(false);
        setMessage(errorMessage(error));
      });
  }, [authenticatedFetch, productId, canManage]);
  function optionMediaKey(groupIndex: number, value: string) {
    return `${groupIndex}\u001f${value}`;
  }
  const category = useMemo(
    () => categories.find((item) => item.id === form.categoryId) ?? null,
    [categories, form.categoryId],
  );
  function chooseCategory(categoryId: string) {
    const next = categories.find((item) => item.id === categoryId);
    setForm((current) => ({
      ...current,
      categoryId,
      attributes: (next?.attributes ?? [])
        .filter((attribute) => attribute.required)
        .map((attribute) => ({
          definitionId: attribute.id,
          value: attribute.allowedValues?.[0] ?? '',
        })),
    }));
  }
  function updateGroups(optionGroups: SellerProductOptionInput[]) {
    setForm((current) => ({
      ...current,
      optionGroups,
      variants: variantsFor(optionGroups, current.variants),
    }));
  }
  function addOptionGroup() {
    if (form.optionGroups.length < 2)
      updateGroups([...form.optionGroups, { name: '', values: [''] }]);
  }
  function removeOptionGroup(index: number) {
    setForm((current) => {
      const nextGroups = current.optionGroups.filter((_group, groupIndex) => groupIndex !== index);
      const nextMappings =
        index === 0
          ? []
          : (current.optionValueMedia ?? []).filter(
              (entry) => entry.groupIndex === 0 && nextGroups[0]?.values.includes(entry.value),
            );
      return {
        ...current,
        optionGroups: nextGroups,
        optionValueMedia: nextMappings,
        variants: variantsFor(nextGroups, current.variants),
      };
    });
    if (index === 0) {
      setOptionMediaKeys({});
    } else {
      setOptionMediaKeys((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => !key.startsWith(`${index}\u001f`)),
        ),
      );
    }
  }
  function updateGroupName(index: number, name: string) {
    setForm((current) => ({
      ...current,
      optionGroups: current.optionGroups.map((group, groupIndex) =>
        groupIndex === index ? { ...group, name } : group,
      ),
    }));
  }
  function updateGroupValue(groupIndex: number, valueIndex: number, value: string) {
    const previous = form.optionGroups[groupIndex]?.values[valueIndex] ?? '';
    updateGroups(
      form.optionGroups.map((group, currentGroupIndex) =>
        currentGroupIndex === groupIndex
          ? {
              ...group,
              values: group.values.map((item, currentValueIndex) =>
                currentValueIndex === valueIndex ? value : item,
              ),
            }
          : group,
      ),
    );
    if (groupIndex === 0 && previous !== value) {
      setForm((current) => ({
        ...current,
        optionValueMedia: (current.optionValueMedia ?? []).map((entry) =>
          entry.groupIndex === 0 && entry.value === previous ? { ...entry, value } : entry,
        ),
      }));
      setOptionMediaKeys((current) => {
        const previousKey = optionMediaKey(groupIndex, previous);
        const nextKey = optionMediaKey(groupIndex, value);
        if (!current[previousKey]) return current;
        const next = { ...current, [nextKey]: current[previousKey]! };
        delete next[previousKey];
        return next;
      });
    }
  }
  function addGroupValue(groupIndex: number) {
    updateGroups(
      form.optionGroups.map((group, currentGroupIndex) =>
        currentGroupIndex === groupIndex ? { ...group, values: [...group.values, ''] } : group,
      ),
    );
  }
  function removeGroupValue(groupIndex: number, valueIndex: number) {
    const removed = form.optionGroups[groupIndex]?.values[valueIndex] ?? '';
    updateGroups(
      form.optionGroups.map((group, currentGroupIndex) =>
        currentGroupIndex === groupIndex
          ? {
              ...group,
              values:
                group.values.length > 1
                  ? group.values.filter(
                      (_item, currentValueIndex) => currentValueIndex !== valueIndex,
                    )
                  : [''],
            }
          : group,
      ),
    );
    if (groupIndex === 0) {
      setForm((current) => ({
        ...current,
        optionValueMedia: (current.optionValueMedia ?? []).filter(
          (entry) => !(entry.groupIndex === 0 && entry.value === removed),
        ),
      }));
      setOptionMediaKeys((current) => {
        const next = { ...current };
        delete next[optionMediaKey(groupIndex, removed)];
        return next;
      });
    }
  }
  function updateVariant(index: number, patch: Partial<SellerProductVariantInput>) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, position) =>
        position === index ? { ...variant, ...patch } : variant,
      ),
    }));
  }
  function updateMediaItem(key: string, patch: Partial<ProductMediaItem>) {
    setMediaItems((items) =>
      items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }
  function removeMediaItem(key: string) {
    const removed = mediaItems.find((item) => item.key === key);
    if (removed?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
    setMediaItems((items) => items.filter((item) => item.key !== key));
    if (removed)
      setForm((current) => ({
        ...current,
        optionValueMedia: (current.optionValueMedia ?? []).map((entry) =>
          mediaReferenceMatches(removed, entry.mediaRef) ? { ...entry, mediaRef: null } : entry,
        ),
      }));
    setOptionMediaKeys((current) =>
      Object.fromEntries(Object.entries(current).filter(([, mediaKey]) => mediaKey !== key)),
    );
  }
  function reorderMedia(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= mediaItems.length) return;
    setMediaItems((items) => {
      const next = [...items];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next.map((item, sortOrder) => ({ ...item, sortOrder }));
    });
  }
  function mediaUploadError(error: unknown) {
    return error instanceof RoleApiError && error.status === 413
      ? 'Ảnh vượt quá 5 MB.'
      : error instanceof RoleApiError && error.status === 403
        ? 'Liên kết upload S3 đã hết hạn hoặc không còn hợp lệ. Hãy bấm lưu lại để tạo liên kết mới.'
      : 'Không thể tải ảnh lên khi lưu sản phẩm.';
  }
  function hasPendingMediaUploads(items = mediaItems) {
    return items.some((item) => Boolean(item.file) && !item.imageId);
  }
  async function stagePendingMedia(): Promise<ProductMediaItem[]> {
    if (!hasPendingMediaUploads()) return mediaItems;
    const nextItems = [...mediaItems];
    for (let index = 0; index < nextItems.length; index += 1) {
      const item = nextItems[index]!;
      // Local files are re-uploaded on every save attempt. A previous attempt
      // may have left an expired or unattached assetId behind; relying on it
      // would make every retry fail with seller-product-media-unavailable.
      if (!item.file || item.imageId) continue;
      updateMediaItem(item.key, { status: 'uploading', error: undefined });
      try {
        const staged: SellerProductMediaStageResponse = await stageSellerProductMedia(
          authenticatedFetch,
          item.file,
        );
        nextItems[index] = {
          ...item,
          assetId: staged.id,
          status: 'ready',
          error: undefined,
        };
      } catch (error) {
        nextItems[index] = { ...item, status: 'error', error: mediaUploadError(error) };
        setMediaItems(nextItems);
        throw error;
      }
    }
    setMediaItems(nextItems);
    return nextItems;
  }
  function selectMedia(files: FileList | null) {
    if (!files) return;
    const remaining = Math.max(0, 9 - mediaItems.length);
    if (files.length > remaining) setMessage('Mỗi sản phẩm chỉ có thể dùng tối đa 9 ảnh duy nhất.');
    const selected = Array.from(files).slice(0, remaining);
    for (const file of selected) {
      const key = `local:${crypto.randomUUID()}`;
      const previewUrl = URL.createObjectURL(file);
      const item: ProductMediaItem = {
        key,
        assetId: undefined,
        altText: null,
        sortOrder: mediaItems.length,
        previewUrl,
        status: 'ready',
        file,
      };
      setMediaItems((items) => [...items, item]);
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size < 1 ||
        file.size > 5 * 1024 * 1024
      ) {
        updateMediaItem(key, {
          status: 'error',
          error:
            file.size > 5 * 1024 * 1024 ? 'Ảnh vượt quá 5 MB.' : 'Chỉ hỗ trợ JPG, PNG hoặc WebP.',
        });
        continue;
      }
    }
  }
  function retryMediaItem(item: ProductMediaItem) {
    if (item.file) updateMediaItem(item.key, { status: 'ready', error: undefined });
  }
  function setOptionValueImage(groupIndex: number, value: string, mediaKey: string | null) {
    if (groupIndex !== 0) return;
    const selected = mediaKey ? mediaItems.find((item) => item.key === mediaKey) : undefined;
    setOptionMediaKeys((current) => {
      const key = optionMediaKey(groupIndex, value);
      if (!mediaKey) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: mediaKey };
    });
    setForm((current) => {
      const mappings = [...(current.optionValueMedia ?? [])];
      const existing = mappings.findIndex(
        (entry) => entry.groupIndex === groupIndex && entry.value === value,
      );
      const mediaRef = selected?.assetId
        ? { assetId: selected.assetId }
        : selected?.imageId
          ? { imageId: selected.imageId }
          : null;
      const next = { groupIndex, value, mediaRef };
      if (existing >= 0) mappings[existing] = next;
      else mappings.push(next);
      return { ...current, optionValueMedia: mappings };
    });
  }
  async function save(publish = false) {
    setMessage('');
    setPending(true);
    const creating = !product;
    let createdProduct: SellerProductDetail | null = null;
    let mediaStageFailed = false;
    try {
      const needsUpload = hasPendingMediaUploads();
      let stagedItems: ProductMediaItem[];
      if (needsUpload) {
        setMessage(
          creating
            ? 'Đang lưu ảnh sản phẩm trước khi tạo sản phẩm...'
            : 'Đang tải ảnh mới lên...',
        );
        try {
          stagedItems = await stagePendingMedia();
        } catch (error) {
          mediaStageFailed = true;
          throw error;
        }
        setMessage(creating ? 'Ảnh đã được lưu. Đang tạo sản phẩm...' : 'Ảnh đã được lưu. Đang cập nhật sản phẩm...');
      } else {
        stagedItems = mediaItems;
        setMessage(creating ? 'Đang tạo sản phẩm...' : 'Đang cập nhật sản phẩm...');
      }
      const media = stagedItems
        .filter((item) => item.status === 'ready')
        .map((item, sortOrder) => ({
          ...(item.url ? { url: item.url } : {}),
          ...(item.assetId ? { assetId: item.assetId } : {}),
          ...(item.imageId ? { imageId: item.imageId } : {}),
          altText: item.altText,
          sortOrder,
        }));
      const optionValueMedia = (form.optionValueMedia ?? []).map((entry) => {
        const selectedKey = optionMediaKeys[optionMediaKey(entry.groupIndex, entry.value)];
        const selected = selectedKey
          ? stagedItems.find((item) => item.key === selectedKey)
          : undefined;
        return {
          ...entry,
          mediaRef: selected?.assetId
            ? { assetId: selected.assetId }
            : selected?.imageId
              ? { imageId: selected.imageId }
              : entry.mediaRef,
        };
      });
      const payload = {
        ...form,
        optionGroups: normalizeOptionGroups(form.optionGroups),
        optionValueMedia,
        media,
      };
      if (!isSellerProductUpsertRequest(payload)) {
        setMessage(
          'Hãy điền tên, danh mục, thông tin đóng gói, biến thể và ít nhất một ảnh hợp lệ trước khi đăng bán.',
        );
        return;
      }
      if (publish) {
        const missing: string[] = [];
        if (payload.media.length === 0) missing.push('ảnh sản phẩm');
        if (
          [payload.packageLengthMm, payload.packageWidthMm, payload.packageHeightMm].some(
            (dimension) => dimension === null,
          )
        ) {
          missing.push('kích thước kiện hàng');
        }
        if (!payload.variants.some((variant) => variant.active && variant.weightGrams > 0)) {
          missing.push('ít nhất một biến thể hợp lệ');
        }
        if (missing.length) {
          setMessage(`Chưa thể đăng bán. Hãy bổ sung: ${missing.join(', ')}.`);
          return;
        }
      }
      const next = product
        ? await updateSellerProduct(authenticatedFetch, product.id, payload)
        : await createSellerProduct(authenticatedFetch, payload);
      if (creating) createdProduct = next;
      const transitioned = publish
        ? await transitionSellerProduct(authenticatedFetch, next.id, 'published')
        : next;
      setProduct(transitioned);
      setForm(toInput(transitioned));
      mediaItems.forEach((item) => {
        if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
      });
      setMediaItems(transitioned.media.map(mediaItemFromExisting));
      setOptionMediaKeys({});
      if (creating) {
        router.push('/seller/products');
        return;
      }
      setMessage(publish ? 'Sản phẩm đã được đăng bán.' : 'Đã cập nhật sản phẩm.');
    } catch (error) {
      if (createdProduct) {
        mediaItems.forEach((item) => {
          if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        });
        setProduct(createdProduct);
        setForm(toInput(createdProduct));
        setMediaItems(createdProduct.media.map(mediaItemFromExisting));
        setOptionMediaKeys({});
        setMessage(
          `Đã lưu bản nháp nhưng chưa đăng bán. ${mediaStageFailed ? mediaUploadError(error) : errorMessage(error)}`,
        );
      } else {
        setMessage(mediaStageFailed ? mediaUploadError(error) : errorMessage(error));
      }
    } finally {
      setPending(false);
    }
  }
  if (state.status !== 'authenticated' || !state.user.roles.includes('seller'))
    return (
      <section className="operational-panel">
        <h1>Cần quyền seller</h1>
        <Link href="/seller/shop">Mở hồ sơ shop</Link>
      </section>
    );
  if (productId && loadingProduct)
    return (
      <section className="operational-panel seller-product-loading" aria-live="polite">
        <span className="operational-eyebrow">Seller Center</span>
        <h1>Đang tải sản phẩm</h1>
        <p>Đang lấy thông tin sản phẩm đã lưu...</p>
      </section>
    );
  return (
    <section className="operational-panel seller-product-editor">
      <div className="seller-products-heading">
        <div>
          <span className="operational-eyebrow">Seller Center</span>
          <h1>{product ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}</h1>
        </div>
        <Link href="/seller/products">Quay lại danh sách</Link>
      </div>
      {product?.moderationStatus === 'suspended' ? (
        <p className="seller-product-warning">
          Sản phẩm đang bị kiểm duyệt tạm ngưng; bạn không thể tự mở bán.
        </p>
      ) : null}
      <div className="seller-product-form">
        <label>
          Tên sản phẩm
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Danh mục
          <select value={form.categoryId} onChange={(event) => chooseCategory(event.target.value)}>
            <option value="">Chọn danh mục</option>
            {categories
              .filter((item) => item.isLeaf && !excludedSellerCategorySlugs.has(item.slug))
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="seller-product-wide">
          Mô tả
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
        <div className="seller-product-wide seller-product-system-identifiers">
          <strong>Slug và SKU được hệ thống tự sinh</strong>
          <span>
            {product
              ? `Slug: ${product.slug}`
              : 'Slug sẽ được tạo sau khi lưu theo tên sản phẩm và thời điểm đăng.'}
          </span>
          <span>SKU của từng biến thể cũng được tạo tự động, người bán không cần nhập.</span>
        </div>
        <div className="seller-product-wide seller-product-attributes">
          {category?.attributes.map((attribute) => {
            const current =
              form.attributes.find((item) => item.definitionId === attribute.id)?.value ?? '';
            return (
              <label key={attribute.id}>
                {attribute.label}
                {attribute.required ? ' *' : ''}
                {attribute.allowedValues ? (
                  <select
                    value={current}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        attributes: [
                          ...form.attributes.filter((item) => item.definitionId !== attribute.id),
                          { definitionId: attribute.id, value: event.target.value },
                        ],
                      })
                    }
                  >
                    <option value="">Chọn</option>
                    {attribute.allowedValues.map((value) => (
                      <option value={value} key={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={current}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        attributes: [
                          ...form.attributes.filter((item) => item.definitionId !== attribute.id),
                          { definitionId: attribute.id, value: event.target.value },
                        ],
                      })
                    }
                  />
                )}
              </label>
            );
          })}
        </div>
        <fieldset className="seller-product-wide seller-product-media-fieldset">
          <legend>
            Ảnh sản phẩm <small>JPG/PNG/WebP, tối đa 9 ảnh, 5 MB/ảnh</small>
          </legend>
          <label className="seller-product-file-picker">
            Chọn ảnh từ máy
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => {
                void selectMedia(event.target.files);
                event.currentTarget.value = '';
              }}
            />
          </label>
          <p className="seller-product-help">
            {product
              ? 'Ảnh mới chỉ được tải lên khi bạn nhấn Cập nhật. Ảnh hiện có được giữ nguyên nếu bạn không thay đổi.'
              : 'Ảnh chỉ được tải lên khi bạn nhấn Lưu nháp hoặc Đăng bán.'}
          </p>
          <div className="seller-product-media-grid">
            {mediaItems.map((item, index) => (
              <article className="seller-product-media-card" key={item.key}>
                <img src={item.previewUrl} alt={`Ảnh sản phẩm ${index + 1}`} />
                <div>
                  <strong>Ảnh {index + 1}</strong>
                  <small>
                    {item.status === 'uploading'
                      ? 'Đang tải lên…'
                      : item.status === 'error'
                        ? item.error
                        : 'Đã sẵn sàng'}
                  </small>
                </div>
                <div className="seller-product-media-actions">
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`Đưa ảnh ${index + 1} lên`}
                    onClick={() => reorderMedia(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === mediaItems.length - 1}
                    aria-label={`Đưa ảnh ${index + 1} xuống`}
                    onClick={() => reorderMedia(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Xóa ảnh ${index + 1}`}
                    onClick={() => removeMediaItem(item.key)}
                  >
                    ×
                  </button>
                  {item.status === 'error' ? (
                    <button type="button" onClick={() => void retryMediaItem(item)}>
                      Thử lại
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {mediaItems.length === 0 ? (
            <p className="seller-product-help">
              Chưa có ảnh. Hãy chọn ít nhất một ảnh để đăng sản phẩm.
            </p>
          ) : null}
        </fieldset>
        <fieldset className="seller-product-wide">
          <legend>Kích thước kiện hàng (mm)</legend>
          {(['packageLengthMm', 'packageWidthMm', 'packageHeightMm'] as const).map((key) => (
            <label key={key}>
              {key === 'packageLengthMm' ? 'Dài' : key === 'packageWidthMm' ? 'Rộng' : 'Cao'}
              <input
                type="number"
                min="1"
                value={form[key] ?? ''}
                onChange={(event) => setForm({ ...form, [key]: integer(event.target.value) })}
              />
            </label>
          ))}
        </fieldset>
        <fieldset className="seller-product-wide seller-product-classification">
          <legend>
            Phân loại hàng <small>Không bắt buộc</small>
          </legend>
          <p className="seller-product-help">
            <strong>Phân loại hàng</strong> là lựa chọn người mua sẽ chọn, như Màu sắc hoặc Kích cỡ.
            Mỗi <strong>giá trị</strong> (Đỏ, Xanh, M, L) sẽ kết hợp thành một{' '}
            <strong>biến thể</strong> để quản lý tồn kho riêng. Ảnh chỉ gán ở nhóm đầu và sẽ dùng
            chung cho các biến thể cùng giá trị đó.
          </p>
          {form.optionGroups.map((group, groupIndex) => (
            <div className="seller-product-option-group" key={`group-${groupIndex}`}>
              <div className="seller-product-option-heading">
                <label>
                  Nhóm phân loại {groupIndex + 1}
                  <input
                    aria-label={`Tên nhóm phân loại ${groupIndex + 1}`}
                    placeholder={groupIndex === 0 ? 'Ví dụ: Màu sắc' : 'Ví dụ: Kích cỡ'}
                    value={group.name}
                    onChange={(event) => updateGroupName(groupIndex, event.target.value)}
                  />
                </label>
                <button type="button" onClick={() => removeOptionGroup(groupIndex)}>
                  Xóa nhóm
                </button>
              </div>
              <div className="seller-product-values">
                <span>Giá trị phân loại</span>
                {group.values.map((value, valueIndex) => {
                  const mapping = form.optionValueMedia?.find(
                    (entry) => entry.groupIndex === groupIndex && entry.value === value,
                  );
                  const selectedMediaKey =
                    optionMediaKeys[optionMediaKey(groupIndex, value)] ??
                    mediaItems.find((item) => mediaReferenceMatches(item, mapping?.mediaRef))
                      ?.key ??
                    '';
                  return (
                    <div
                      className={`seller-product-value-row${
                        groupIndex === 0 ? ' seller-product-value-row-with-image' : ''
                      }`}
                      key={`value-${groupIndex}-${valueIndex}`}
                    >
                      <input
                        aria-label={`Giá trị ${groupIndex + 1}-${valueIndex + 1}`}
                        placeholder={groupIndex === 0 ? 'Đỏ' : 'M'}
                        value={value}
                        onChange={(event) =>
                          updateGroupValue(groupIndex, valueIndex, event.target.value)
                        }
                      />
                      {groupIndex === 0 ? (
                        <select
                          aria-label={`Ảnh cho giá trị ${groupIndex + 1}-${valueIndex + 1}`}
                          value={selectedMediaKey}
                          onChange={(event) => {
                            setOptionValueImage(groupIndex, value, event.target.value || null);
                          }}
                        >
                          <option value="">Không chọn ảnh</option>
                          {mediaItems
                            .filter((item) => item.status === 'ready')
                            .map((item) => (
                              <option
                                key={item.key}
                                value={item.key}
                              >{`Ảnh ${mediaItems.indexOf(item) + 1}`}</option>
                            ))}
                        </select>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Xóa giá trị ${groupIndex + 1}-${valueIndex + 1}`}
                        onClick={() => removeGroupValue(groupIndex, valueIndex)}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="seller-product-add"
                  onClick={() => addGroupValue(groupIndex)}
                >
                  + Thêm giá trị
                </button>
              </div>
            </div>
          ))}
          {form.optionGroups.length < 2 ? (
            <button
              type="button"
              className="seller-product-add seller-product-add-group"
              onClick={addOptionGroup}
            >
              + Thêm nhóm phân loại
            </button>
          ) : null}
        </fieldset>
        <fieldset className="seller-product-wide seller-product-variants-fieldset">
          <legend>Biến thể và tồn kho</legend>
          <p className="seller-product-help">
            Biến thể được sinh tự động từ các nhóm phân loại. Ví dụ Màu sắc Đỏ/Xanh kết hợp Kích cỡ
            M/L sẽ tạo 4 dòng; hãy nhập tồn kho riêng cho từng dòng.
          </p>
          <div className="seller-product-variants">
            {form.variants.map((variant, index) => (
              <div
                className="seller-product-variant"
                key={variant.combination.join('|') || 'default'}
              >
                <div>
                  <strong>{variant.combination.join(' · ') || 'Mặc định'}</strong>
                  <small>SKU tự sinh sau khi lưu</small>
                  {variant.imageUrl ? (
                    <img className="seller-product-variant-image" src={variant.imageUrl} alt="" />
                  ) : null}
                </div>
                <label>
                  Giá bán
                  <input
                    aria-label={`Giá bán ${variant.combination.join(' ') || 'mặc định'}`}
                    type="text"
                    inputMode="numeric"
                    value={formatInteger(variant.priceMinor)}
                    onChange={(event) =>
                      updateVariant(index, {
                        priceMinor: parseFormattedInteger(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Tồn kho
                  <input
                    aria-label={`Tồn kho ${variant.combination.join(' ') || 'mặc định'}`}
                    type="text"
                    inputMode="numeric"
                    value={formatInteger(variant.stock)}
                    onChange={(event) =>
                      updateVariant(index, { stock: parseFormattedInteger(event.target.value) })
                    }
                  />
                </label>
                <label>
                  Khối lượng (g)
                  <input
                    aria-label={`Khối lượng ${variant.combination.join(' ') || 'mặc định'}`}
                    type="number"
                    min="1"
                    value={variant.weightGrams}
                    onChange={(event) =>
                      updateVariant(index, { weightGrams: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="seller-product-actions">
        {product ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => router.push('/seller/products')}
            >
              Hủy
            </button>
            <button
              className="seller-product-primary"
              type="button"
              disabled={pending || product.lifecycle === 'archived'}
              onClick={() => void save(false)}
            >
              {pending ? 'Đang cập nhật…' : 'Cập nhật'}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={pending} onClick={() => void save(false)}>
              Lưu nháp
            </button>
            <button
              className="seller-product-primary"
              type="button"
              disabled={pending}
              onClick={() => void save(true)}
            >
              Đăng bán
            </button>
          </>
        )}
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
