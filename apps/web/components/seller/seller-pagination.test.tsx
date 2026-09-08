import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SellerPagination } from './seller-pagination';

describe('SellerPagination', () => {
  it('shows a compact 20-page range and changes pages accessibly', async () => {
    const onPageChange = vi.fn();
    render(
      <SellerPagination
        itemLabel="sản phẩm"
        page={1}
        totalItems={200}
        totalPages={20}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText('Hiển thị 1–10 trong 200 sản phẩm')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Trang 5' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trang 6' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang 20' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Trang 2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
