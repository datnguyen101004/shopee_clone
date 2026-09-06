'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { SellerProductLifecycle, SellerProductSummary } from '@shopee-clone/contracts';
import {
  deleteSellerProductDraft,
  fetchSellerProducts,
  transitionSellerProduct,
} from '../../lib/seller-products-api';
import { useAuthSession } from '../auth-session-provider';
import { errorMessage } from './seller-products-utils';
import { SellerProductListToolbar } from './seller-product-list-toolbar';
import { SellerProductTable } from './seller-product-table';
import { SellerProductListFooter } from './seller-product-list-footer';
import { SellerProductDeleteModal, SellerProductHideModal } from './seller-product-modals';

export function SellerProductList() {
  const { authenticatedFetch, state } = useAuthSession();
  const [items, setItems] = useState<SellerProductSummary[]>([]);
  const [lifecycle, setLifecycle] = useState<SellerProductLifecycle | undefined>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const requestVersionRef = useRef(0);

  // Modals & Action States
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogItem, setDeleteDialogItem] = useState<SellerProductSummary | null>(null);
  const [deleteDialogError, setDeleteDialogError] = useState('');
  const [hideDialogItem, setHideDialogItem] = useState<SellerProductSummary | null>(null);
  const [hideDialogError, setHideDialogError] = useState('');

  const isSeller = state.status === 'authenticated' && state.user.roles.includes('seller');

  // Load only the selected lifecycle. A version guard keeps a slower response
  // from an older filter from replacing the current table.
  const load = useCallback(
    (targetLifecycle?: SellerProductLifecycle) => {
      const requestVersion = ++requestVersionRef.current;
      setLoading(true);
      setLoadError('');
      setMessage('');
      setItems([]);
      setNextCursor(null);
      setLoadingMore(false);
      setLoadMoreError('');
      setSelectedCategory('');

      fetchSellerProducts(authenticatedFetch, { lifecycle: targetLifecycle })
        .then((page) => {
          if (requestVersion !== requestVersionRef.current) return;
          setItems(page.items);
          setNextCursor(page.nextCursor);
          setLoading(false);
        })
        .catch((err) => {
          if (requestVersion !== requestVersionRef.current) return;
          setLoadError(errorMessage(err));
          setLoading(false);
        });
    },
    [authenticatedFetch],
  );

  useEffect(() => {
    if (isSeller) {
      void Promise.resolve().then(() => load(lifecycle));
    }
  }, [isSeller, lifecycle, load]);

  // Load more with cursor
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const requestVersion = requestVersionRef.current;
    setLoadingMore(true);
    setLoadMoreError('');

    try {
      const page = await fetchSellerProducts(authenticatedFetch, {
        cursor: nextCursor,
        lifecycle,
      });
      // Deduplicate by id
      if (requestVersion !== requestVersionRef.current) return;
      setItems((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newUnique = page.items.filter((p) => !existingIds.has(p.id));
        return [...prev, ...newUnique];
      });
      setNextCursor(page.nextCursor);
    } catch {
      if (requestVersion === requestVersionRef.current) {
        setLoadMoreError('Không thể tải thêm sản phẩm.');
      }
    } finally {
      if (requestVersion === requestVersionRef.current) setLoadingMore(false);
    }
  }, [authenticatedFetch, lifecycle, nextCursor, loadingMore]);

  // Distinct category list from loaded items
  const loadedCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.categoryName) set.add(item.categoryName);
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered items (loaded only)
  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('vi-VN');
    return items.filter((item) => {
      if (selectedCategory && item.categoryName !== selectedCategory) {
        return false;
      }
      if (term) {
        const nameMatch = item.name.toLocaleLowerCase('vi-VN').includes(term);
        const slugMatch = item.slug.toLocaleLowerCase('vi-VN').includes(term);
        return nameMatch || slugMatch;
      }
      return true;
    });
  }, [items, searchTerm, selectedCategory]);

  const [deleteTrigger, setDeleteTrigger] = useState<HTMLElement | null>(null);
  const [hideTrigger, setHideTrigger] = useState<HTMLElement | null>(null);

  // Actions
  function handleRequestDelete(item: SellerProductSummary, trigger: HTMLElement) {
    setDeleteDialogError('');
    setDeleteDialogItem(item);
    setDeleteTrigger(trigger);
  }

  function handleCloseDelete() {
    setDeleteDialogItem(null);
    deleteTrigger?.focus();
  }

  async function handleConfirmDelete() {
    if (!deleteDialogItem) return;
    const item = deleteDialogItem;
    setDeletingId(item.id);
    setDeleteDialogError('');

    try {
      await deleteSellerProductDraft(authenticatedFetch, item.id);
      setItems((prev) => prev.filter((p) => p.id !== item.id));
      setDeleteDialogItem(null);
      setMessage('Đã xóa sản phẩm.');
    } catch (err) {
      setDeleteDialogError(errorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  function handleRequestHide(item: SellerProductSummary, trigger: HTMLElement) {
    setHideDialogError('');
    setHideDialogItem(item);
    setHideTrigger(trigger);
  }

  function handleCloseHide() {
    setHideDialogItem(null);
    hideTrigger?.focus();
  }

  async function handleConfirmHide() {
    if (!hideDialogItem || publishingId !== null) return;
    const item = hideDialogItem;
    setPublishingId(item.id);
    setHideDialogError('');

    try {
      await transitionSellerProduct(authenticatedFetch, item.id, 'hidden');
      setItems((prev) =>
        lifecycle === 'published'
          ? prev.filter((p) => p.id !== item.id)
          : prev.map((p) => (p.id === item.id ? { ...p, lifecycle: 'hidden' as const } : p)),
      );
      setHideDialogItem(null);
      setMessage('Đã ẩn sản phẩm.');
    } catch (err) {
      setHideDialogError(errorMessage(err));
    } finally {
      setPublishingId(null);
    }
  }

  async function handlePublish(productId: string) {
    setPublishingId(productId);
    setMessage('');

    try {
      await transitionSellerProduct(authenticatedFetch, productId, 'published');
      setItems((prev) =>
        lifecycle && lifecycle !== 'published'
          ? prev.filter((p) => p.id !== productId)
          : prev.map((p) => (p.id === productId ? { ...p, lifecycle: 'published' as const } : p)),
      );
      setMessage('Sản phẩm đã được đăng bán.');
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setPublishingId(null);
    }
  }

  if (state.status !== 'authenticated') {
    return (
      <div className="seller-products-page">
        <div className="seller-pe-card seller-products-state-card">
          <h2>Cần đăng nhập</h2>
          <p>Vui lòng đăng nhập để truy cập trang quản lý sản phẩm.</p>
          <Link href="/login" className="seller-pl-btn-add">
            Đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  if (!isSeller) {
    return (
      <div className="seller-products-page">
        <div className="seller-pe-card seller-products-state-card">
          <h2>Chưa thể quản lý sản phẩm</h2>
          <p>Tài khoản cần có quyền Người bán và shop đã được phê duyệt.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="seller-products-page" data-testid="seller-products-list-page">
      {/* Global Status Banner */}
      {message ? (
        <div role="alert" className="seller-products-banner seller-products-banner--info">
          {message}
        </div>
      ) : null}

      {/* Toolbar */}
      <SellerProductListToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        lifecycle={lifecycle}
        onLifecycleChange={setLifecycle}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={loadedCategories}
      />

      <div className="seller-pl-table-stack">
        <SellerProductTable
          items={filteredItems}
          loading={loading}
          error={loadError}
          onRetry={() => load(lifecycle)}
          hasLocalFilters={Boolean(searchTerm.trim() || selectedCategory)}
          onClearFilters={() => {
            setSearchTerm('');
            setSelectedCategory('');
          }}
          publishingId={publishingId}
          deletingId={deletingId}
          onRequestHide={handleRequestHide}
          onRequestDelete={handleRequestDelete}
          onPublish={handlePublish}
        />

        <SellerProductListFooter
          filteredCount={filteredItems.length}
          totalLoadedCount={items.length}
          loading={loading}
          nextCursor={nextCursor}
          loadingMore={loadingMore}
          loadMoreError={loadMoreError}
          onLoadMore={handleLoadMore}
        />
      </div>

      {/* Modals */}
      <SellerProductDeleteModal
        item={deleteDialogItem}
        pending={deletingId !== null}
        error={deleteDialogError}
        onConfirm={handleConfirmDelete}
        onCancel={handleCloseDelete}
      />

      <SellerProductHideModal
        item={hideDialogItem}
        pending={publishingId !== null}
        error={hideDialogError}
        onConfirm={handleConfirmHide}
        onCancel={handleCloseHide}
      />
    </div>
  );
}
