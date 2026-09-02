import type { PaymentStatusResponse } from '@shopee-clone/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPaymentStatus, resolveVnpayPayment, settleVnpayReturn } from '../../lib/checkout-api';
import { useAuthSession } from '../auth-session-provider';
import { VnpayCallbackScreen } from './vnpay-callback-screen';

const { replace, router } = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace } };
});
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('../../lib/checkout-api', () => ({
  CheckoutApiError: class extends Error {},
  getPaymentStatus: vi.fn(),
  resolveVnpayPayment: vi.fn(),
  settleVnpayReturn: vi.fn(),
  retryPayment: vi.fn(),
}));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const buyerId = '00000000-0000-4000-8000-000000000001';
const purchaseReference = '00000000-0000-4000-8000-000000000002';
const paymentReference = '00000000-0000-4000-8000-000000000003';
const orderReference = '00000000-0000-4000-8000-000000000004';
const transactionReference = 'VNPAYATTEMPT123';

function payment(status: PaymentStatusResponse['status']): PaymentStatusResponse {
  return {
    paymentReference,
    purchaseReference,
    provider: 'VNPAY',
    paymentMethod: 'VNPAY',
    status,
    amountMinor: 122_000,
    currency: 'VND',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    nextAction: status === 'PENDING' ? 'WAIT' : 'DONE',
    instructions: null,
  };
}

describe('VnpayCallbackScreen', () => {
  const authenticatedFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: buyerId,
          email: 'buyer@example.test',
          displayName: 'Buyer',
          status: 'active',
          roles: ['buyer'],
        },
      },
      authenticatedFetch,
    } as never);
    vi.mocked(resolveVnpayPayment).mockResolvedValue({ paymentReference, purchaseReference });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls until IPN-backed PAID status and redirects to the buyer order detail', async () => {
    let currentStatus: PaymentStatusResponse['status'] = 'PENDING';
    vi.mocked(getPaymentStatus).mockImplementation(async () => ({
      ...payment(currentStatus),
      navigation: { kind: 'ORDER', orderReference },
    }));

    render(<VnpayCallbackScreen transactionReference={transactionReference} />);
    expect(await screen.findByRole('heading', { name: 'Đang chờ VNPAY xác nhận' })).toBeVisible();
    expect(replace).not.toHaveBeenCalled();

    currentStatus = 'PAID';
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/account/orders/${orderReference}`), {
      timeout: 3_000,
    });
    expect(vi.mocked(getPaymentStatus).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(resolveVnpayPayment).toHaveBeenCalledTimes(1);
  });

  it('settles a signed terminal cancellation returned by VNPAY before reading status', async () => {
    vi.mocked(settleVnpayReturn).mockResolvedValue({
      ...payment('CANCELLED'),
      navigation: { kind: 'ORDER', orderReference },
    });

    render(
      <VnpayCallbackScreen
        transactionReference={transactionReference}
        callbackFields={{
          vnp_TxnRef: transactionReference,
          vnp_ResponseCode: '24',
          vnp_SecureHash: 'a'.repeat(128),
        }}
      />,
    );

    await waitFor(() => expect(settleVnpayReturn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/account/orders/${orderReference}`));
    expect(getPaymentStatus).not.toHaveBeenCalled();
  });
});
