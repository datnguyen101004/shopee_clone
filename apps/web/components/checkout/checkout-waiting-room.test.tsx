import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CheckoutWaitingRoom } from './checkout-waiting-room';

describe('CheckoutWaitingRoom', () => {
  it('renders WAITING state with disclaimer and leave queue button', async () => {
    const user = userEvent.setup();
    const handleLeave = vi.fn().mockResolvedValue(undefined);

    render(
      <CheckoutWaitingRoom
        status="WAITING"
        retryAfterSeconds={5}
        onPollStatus={vi.fn()}
        onLeaveQueue={handleLeave}
        onRejoinQueue={vi.fn()}
        onProceedToCheckout={vi.fn()}
      />
    );

    expect(screen.getByText('Phòng chờ thanh toán')).toBeInTheDocument();
    expect(screen.getByText(/Có nhiều người đang mua sắm/i)).toBeInTheDocument();

    const leaveBtn = screen.getByRole('button', { name: 'Rời hàng đợi' });
    await user.click(leaveBtn);
    expect(handleLeave).toHaveBeenCalled();
  });

  it('renders ADMITTED state with button to proceed without auto-submitting', async () => {
    const user = userEvent.setup();
    const handleProceed = vi.fn();

    render(
      <CheckoutWaitingRoom
        status="ADMITTED"
        retryAfterSeconds={0}
        onPollStatus={vi.fn()}
        onLeaveQueue={vi.fn()}
        onRejoinQueue={vi.fn()}
        onProceedToCheckout={handleProceed}
      />
    );

    expect(screen.getByText('Đã đến lượt thanh toán của bạn!')).toBeInTheDocument();
    const proceedBtn = screen.getByRole('button', { name: 'Tiếp tục vào thanh toán ngay' });
    await user.click(proceedBtn);
    expect(handleProceed).toHaveBeenCalled();
  });

  it('renders EXPIRED state with button to rejoin queue', async () => {
    const user = userEvent.setup();
    const handleRejoin = vi.fn().mockResolvedValue(undefined);

    render(
      <CheckoutWaitingRoom
        status="EXPIRED"
        retryAfterSeconds={0}
        onPollStatus={vi.fn()}
        onLeaveQueue={vi.fn()}
        onRejoinQueue={handleRejoin}
        onProceedToCheckout={vi.fn()}
      />
    );

    expect(screen.getByText('Hết thời gian truy cập lượt thanh toán')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: 'Xếp hàng lại' });
    await user.click(retryBtn);
    expect(handleRejoin).toHaveBeenCalled();
  });

  it('renders CLOSED state with explanation and return to cart button', () => {
    render(
      <CheckoutWaitingRoom
        status="CLOSED"
        retryAfterSeconds={0}
        onPollStatus={vi.fn()}
        onLeaveQueue={vi.fn()}
        onRejoinQueue={vi.fn()}
        onProceedToCheckout={vi.fn()}
      />
    );

    expect(screen.getByText('Phiên truy cập đã đóng')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quay lại giỏ hàng' })).toBeInTheDocument();
  });

  it('keeps the primary waiting-room action keyboard reachable', async () => {
    const user = userEvent.setup();
    render(
      <CheckoutWaitingRoom
        status="WAITING"
        retryAfterSeconds={5}
        onPollStatus={vi.fn()}
        onLeaveQueue={vi.fn()}
        onRejoinQueue={vi.fn()}
        onProceedToCheckout={vi.fn()}
      />,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Rời hàng đợi' })).toHaveFocus();
  });
});
