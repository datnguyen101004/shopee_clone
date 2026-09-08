'use client';

import { SellerPagination } from '../seller/seller-pagination';

interface FooterProps {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

export function SellerProductListFooter({
  page,
  pageSize,
  totalItems,
  totalPages,
  loading = false,
  onPageChange,
}: FooterProps) {
  return <SellerPagination itemLabel="sản phẩm" page={page} pageSize={pageSize} totalItems={totalItems} totalPages={totalPages} disabled={loading} onPageChange={onPageChange} />;
}
