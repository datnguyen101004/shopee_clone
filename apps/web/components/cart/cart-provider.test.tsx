import type { CartResponse } from '@shopee-clone/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as CartApiModule from '../../lib/cart-api';
import { addCartItem, getCart } from '../../lib/cart-api';
import { useAuthSession } from '../auth-session-provider';
import { CartProvider, useCart } from './cart-provider';

vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('../../lib/cart-api', async (importOriginal) => {
  const original = await importOriginal<typeof CartApiModule>();
  return { ...original, getCart: vi.fn(), addCartItem: vi.fn() };
});

const empty: CartResponse = {
  owner: 'authenticated',
  version: 0,
  groups: [],
  summary: {
    distinctLineCount: 0,
    selectedValidLineCount: 0,
    selectedValidQuantity: 0,
    selectedMerchandiseSubtotalMinor: 0,
  },
};

const buyer = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer',
  status: 'active' as const,
  roles: ['buyer' as const],
};

function Probe() {
  const cart = useCart();
  return (
    <div>
      <output>{`${cart.state.status}:${cart.state.cart?.summary.distinctLineCount ?? 0}`}</output>
      <button type="button" onClick={() => void cart.addItem('variant', 1)}>
        Add
      </button>
      <button type="button" onClick={() => void cart.refresh()}>
        Refresh
      </button>
      <p>{cart.message}</p>
    </div>
  );
}

describe('CartProvider', () => {
  const sessionFetch = vi.fn();
  let authState: ReturnType<typeof useAuthSession>['state'];

  beforeEach(() => {
    vi.clearAllMocks();
    authState = { status: 'guest', user: null };
    vi.mocked(useAuthSession).mockImplementation(
      () =>
        ({
          state: authState,
          sessionFetch,
          authenticatedFetch: sessionFetch,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          restore: vi.fn(),
          completeGoogleSignIn: vi.fn(),
          clickstreamFetch: sessionFetch,
          synchronizeDisplayName: vi.fn(),
        }) as ReturnType<typeof useAuthSession>,
    );
    vi.mocked(getCart).mockResolvedValue(empty);
    vi.mocked(addCartItem).mockResolvedValue({
      cart: { ...empty, version: 1, summary: { ...empty.summary, distinctLineCount: 1 } },
      adjustments: [],
    });
  });

  it('does not call private cart APIs for a guest', async () => {
    render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    await waitFor(() => expect(screen.getByText('unauthenticated:0')).toBeVisible());
    expect(getCart).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('loads the account cart once after authentication and keeps confirmed mutations', async () => {
    const user = userEvent.setup();
    authState = { status: 'authenticated', user: buyer };
    render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    await waitFor(() => expect(screen.getByText('ready:0')).toBeVisible());
    expect(getCart).toHaveBeenCalledTimes(1);
    expect(getCart).toHaveBeenCalledWith(sessionFetch);

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByText('ready:1')).toBeVisible());
    expect(addCartItem).toHaveBeenCalledWith('variant', 1, 0, sessionFetch);
  });

  it('clears private cart state immediately after logout', async () => {
    authState = { status: 'authenticated', user: buyer };
    const view = render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    await waitFor(() => expect(screen.getByText('ready:0')).toBeVisible());

    authState = { status: 'guest', user: null };
    view.rerender(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    await waitFor(() => expect(screen.getByText('unauthenticated:0')).toBeVisible());
    expect(getCart).toHaveBeenCalledTimes(1);
  });
});
