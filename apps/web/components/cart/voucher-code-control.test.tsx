import { VOUCHER_REJECTION_REASONS, type VoucherSelectionResult } from '@shopee-clone/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VoucherCodeControl, voucherRejectionMessage } from './voucher-code-control';

function rejected(reason: (typeof VOUCHER_REJECTION_REASONS)[number]): VoucherSelectionResult {
  return {
    code: 'EXPIRED-10K',
    slot: 'PLATFORM',
    shopId: null,
    status: 'REJECTED',
    name: 'Mã thử nghiệm',
    issuer: 'PLATFORM',
    benefitType: 'FIXED_AMOUNT',
    rejectionReason: reason,
    discountMinor: 0,
    merchandiseDiscountMinor: 0,
    shippingDiscountMinor: 0,
    allocations: [],
  };
}

describe('voucher code control', () => {
  it('normalizes on explicit keyboard apply and supports an accessible remove action', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { rerender } = render(
      <VoucherCodeControl label="Mã Shopee" pending={false} onApply={onApply} />,
    );
    const input = screen.getByRole('textbox', { name: /Mã Shopee/ });
    await user.type(input, ' platform-10 ');
    await user.keyboard('{Enter}');
    expect(onApply).toHaveBeenLastCalledWith('PLATFORM-10');

    rerender(
      <VoucherCodeControl
        label="Mã Shopee"
        appliedCode="PLATFORM-10"
        pending={false}
        result={{
          ...rejected('EXPIRED'),
          code: 'PLATFORM-10',
          status: 'APPLIED',
          rejectionReason: null,
          name: 'Giảm 10%',
          discountMinor: 10_000,
          merchandiseDiscountMinor: 10_000,
          allocations: [
            {
              shopId: '00000000-0000-4000-8000-000000000010',
              lineId: '00000000-0000-4000-8000-000000000020',
              amountMinor: 10_000,
            },
          ],
        }}
        onApply={onApply}
      />,
    );
    expect(screen.getByText(/Đã áp dụng Giảm 10%: giảm 10.000₫/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Bỏ mã' }));
    expect(onApply).toHaveBeenLastCalledWith(null);
  });

  it('rejects malformed local input without requesting a quote', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<VoucherCodeControl label="Mã Shopee" pending={false} onApply={onApply} />);
    await user.type(screen.getByRole('textbox', { name: /Mã Shopee/ }), 'bad code');
    await user.click(screen.getByRole('button', { name: 'Áp dụng' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Mã gồm 4–32 ký tự');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('provides safe Vietnamese copy for every stable rejection reason', () => {
    for (const reason of VOUCHER_REJECTION_REASONS) {
      expect(voucherRejectionMessage(reason)).toBeTruthy();
      expect(voucherRejectionMessage(reason)).not.toContain(reason);
    }
    render(
      <VoucherCodeControl
        label="Mã Shopee"
        appliedCode="EXPIRED-10K"
        result={rejected('EXPIRED')}
        pending={false}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Mã giảm giá đã hết hạn.');
  });
});
