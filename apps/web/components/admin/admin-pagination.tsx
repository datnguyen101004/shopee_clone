'use client';

import { ADMIN_PAGE_SIZE } from '@shopee-clone/contracts';

type AdminPaginationProps = {
  itemLabel: string;
  page: number;
  totalItems: number;
  totalPages: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
};

export function adminPaginationItems(
  currentPage: number,
  totalPages: number,
): (number | 'ellipsis')[] {
  if (totalPages <= 6) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (currentPage <= 4) return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  if (currentPage >= totalPages - 3) {
    return [
      1,
      'ellipsis',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

export function AdminPagination({
  itemLabel,
  page,
  totalItems,
  totalPages,
  disabled = false,
  onPageChange,
}: AdminPaginationProps) {
  const firstItem = totalItems === 0 ? 0 : (page - 1) * ADMIN_PAGE_SIZE + 1;
  const lastItem = Math.min(page * ADMIN_PAGE_SIZE, totalItems);

  return (
    <footer className="admin-list-footer admin-pagination">
      <span>
        Hiển thị {firstItem}–{lastItem} trong {totalItems} {itemLabel}
      </span>
      <nav className="admin-pagination__controls" aria-label={`Phân trang ${itemLabel}`}>
        <button
          type="button"
          className="admin-pagination__button"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Trước
        </button>
        {adminPaginationItems(page, totalPages).map((item, index) =>
          item === 'ellipsis' ? (
            <span
              className="admin-pagination__ellipsis"
              key={`ellipsis-${index}`}
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              type="button"
              className={`admin-pagination__button admin-pagination__page${
                item === page ? ' is-active' : ''
              }`}
              aria-current={item === page ? 'page' : undefined}
              aria-label={`Trang ${item}`}
              disabled={disabled}
              key={item}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          className="admin-pagination__button"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Sau
        </button>
      </nav>
    </footer>
  );
}
