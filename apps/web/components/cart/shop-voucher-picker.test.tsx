import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ShopVoucherPicker } from './shop-voucher-picker';

const options = [
  {
    code: 'SHOP-15',
    name: 'Giảm 15% sản phẩm La Vie',
    minimumSpendMinor: 100_000,
    estimatedDiscountMinor: 30_000,
    remainingCount: 7,
  },
  {
    code: 'SHOP-10K',
    name: 'Giảm 10.000đ',
    minimumSpendMinor: 0,
    estimatedDiscountMinor: 10_000,
    remainingCount: 3,
  },
];

describe('shop voucher picker', () => {
  it('lists eligible shop vouchers instead of requiring a typed code', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ShopVoucherPicker
        label="Mã giảm giá của Sample Shop"
        options={options}
        pending={false}
        onApply={onApply}
      />,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mã giảm giá của Sample Shop' }));
    const option = screen.getByRole('option', { name: /SHOP-15/ });
    expect(option).toHaveTextContent('Còn 7 lượt');
    expect(option.querySelector('.shop-voucher-ticket__remaining')).toHaveTextContent('Còn 7 lượt');
    await user.click(screen.getByRole('option', { name: /SHOP-15/ }));
    expect(onApply).toHaveBeenCalledWith('SHOP-15');
  });

  it('shows an empty field when no voucher currently qualifies', async () => {
    const user = userEvent.setup();
    render(
      <ShopVoucherPicker
        label="Mã giảm giá của Sample Shop"
        appliedCode={undefined}
        options={[]}
        pending={false}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Mã giảm giá của Sample Shop' })).toHaveTextContent(
      /Chọn voucher phù hợp/,
    );
    await user.click(screen.getByRole('button', { name: 'Mã giảm giá của Sample Shop' }));
    expect(screen.getByText('Chưa có voucher phù hợp với đơn hiện tại.')).toBeVisible();
  });
});
