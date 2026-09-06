'use client';

import { Loader2 } from '@shopee-clone/ui';

interface FooterProps {
  filteredCount: number;
  totalLoadedCount: number;
  loading?: boolean;
  nextCursor: string | null;
  loadingMore: boolean;
  loadMoreError: string;
  onLoadMore: () => void;
}

export function SellerProductListFooter({
  filteredCount,
  totalLoadedCount,
  loading = false,
  nextCursor,
  loadingMore,
  loadMoreError,
  onLoadMore,
}: FooterProps) {
  return (
    <footer className="seller-pl-footer">
      <div className="seller-pl-footer__summary">
        Hiển thị <strong>{filteredCount}</strong> trong <strong>{totalLoadedCount}</strong> sản phẩm
        đã tải
      </div>

      <div className="seller-pl-footer__actions">
        {loading ? (
          <span className="seller-pl-footer__complete">Đang tải danh sách…</span>
        ) : nextCursor ? (
          <button
            type="button"
            className="seller-pl-btn-loadmore"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? (
              <>
                <Loader2 className="animate-spin" size={14} aria-hidden="true" /> Đang tải…
              </>
            ) : (
              'Tải thêm'
            )}
          </button>
        ) : (
          <span className="seller-pl-footer__complete">
            Đã tải hết danh sách theo trạng thái đã chọn
          </span>
        )}

        {loadMoreError ? (
          <div className="seller-pl-footer__error">
            {loadMoreError}{' '}
            <button
              type="button"
              onClick={onLoadMore}
              className="seller-pl-footer__retry"
            >
              Thử lại
            </button>
          </div>
        ) : null}
      </div>
    </footer>
  );
}
