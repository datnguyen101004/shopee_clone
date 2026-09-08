'use client';

type SellerPaginationProps = {
  itemLabel: string;
  page: number;
  pageSize?: number;
  totalItems: number;
  totalPages: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
};

function paginationItems(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 6) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

export function SellerPagination({
  itemLabel,
  page,
  pageSize = 10,
  totalItems,
  totalPages,
  disabled = false,
  onPageChange,
}: SellerPaginationProps) {
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <footer className="seller-pagination">
      <span>Hiển thị {firstItem}–{lastItem} trong {totalItems} {itemLabel}</span>
      <nav className="seller-pagination__controls" aria-label={`Phân trang ${itemLabel}`}>
        <button type="button" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
          Trước
        </button>
        {paginationItems(page, totalPages).map((item, index) => item === 'ellipsis' ? (
          <span className="seller-pagination__ellipsis" key={`ellipsis-${index}`} aria-hidden="true">…</span>
        ) : (
          <button
            type="button"
            className={item === page ? 'is-active' : undefined}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`Trang ${item}`}
            disabled={disabled}
            key={item}
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        ))}
        <button type="button" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Sau
        </button>
      </nav>
    </footer>
  );
}
