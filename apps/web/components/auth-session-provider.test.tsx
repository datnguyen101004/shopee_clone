import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  loginAccount,
  logoutAccount,
  refreshAccountSession,
  registerAccount,
} from '../lib/auth-api';
import { AuthSessionProvider, useAuthSession } from './auth-session-provider';

vi.mock('../lib/auth-api', () => ({
  loginAccount: vi.fn(),
  logoutAccount: vi.fn(),
  refreshAccountSession: vi.fn(),
  registerAccount: vi.fn(),
}));

const session = {
  accessToken: 'header.payload.signature',
  expiresAt: '2026-08-12T12:15:00.000Z',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'buyer@example.com',
    displayName: 'Buyer Example',
    status: 'active' as const,
    roles: ['buyer'] as ['buyer'],
  },
};

function Probe() {
  const auth = useAuthSession();
  return (
    <div>
      <output>{auth.state.status}</output>
      <output>{auth.state.user?.displayName ?? 'No user'}</output>
      <button type="button" onClick={() => void auth.restore()}>
        Restore
      </button>
      <button
        type="button"
        onClick={() => void auth.login({ email: 'buyer@example.com', password: 'secret' })}
      >
        Login
      </button>
      <button type="button" onClick={() => void auth.logout()}>
        Logout
      </button>
      <button type="button" onClick={() => void auth.authenticatedFetch('/protected')}>
        Fetch
      </button>
      <button type="button" onClick={() => void auth.clickstreamFetch('/api/v1/clickstream/events')}>
        Clickstream
      </button>
      <button type="button" onClick={() => auth.synchronizeDisplayName('Buyer Renamed')}>
        Rename
      </button>
    </div>
  );
}

describe('AuthSessionProvider', () => {
  beforeEach(() => {
    vi.mocked(refreshAccountSession).mockReset();
    vi.mocked(loginAccount).mockReset();
    vi.mocked(registerAccount).mockReset();
    vi.mocked(logoutAccount).mockReset();
    vi.mocked(logoutAccount).mockResolvedValue();
  });

  it('restores only once in flight and never persists a credential', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    let resolveSession!: (value: typeof session) => void;
    vi.mocked(refreshAccountSession).mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(refreshAccountSession).toHaveBeenCalledTimes(1);
    resolveSession(session);
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByText('Buyer Renamed')).toBeInTheDocument();
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it('performs one guarded refresh/retry after a 401 and clears state on logout', async () => {
    vi.mocked(refreshAccountSession).mockResolvedValue(session);
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Fetch' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(refreshAccountSession).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByText('guest')).toBeInTheDocument();
    expect(logoutAccount).toHaveBeenCalledTimes(1);
    fetcher.mockRestore();
  });

  it('does not refresh repeatedly for a known guest clickstream session', async () => {
    vi.mocked(refreshAccountSession).mockRejectedValue(new Error('no session'));
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('guest')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Clickstream' }));
    await user.click(screen.getByRole('button', { name: 'Clickstream' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(refreshAccountSession).toHaveBeenCalledTimes(1);
    for (const [, init] of fetcher.mock.calls)
      expect(new Headers(init?.headers).get('Authorization')).toBeNull();
    fetcher.mockRestore();
  });

  it('waits for the initial restore before attaching the bearer to clickstream', async () => {
    let resolveSession!: (value: typeof session) => void;
    vi.mocked(refreshAccountSession).mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(refreshAccountSession).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Clickstream' }));
    expect(fetcher).not.toHaveBeenCalled();

    await act(async () => {
      resolveSession({ ...session, expiresAt: new Date(Date.now() + 60_000).toISOString() });
      await Promise.resolve();
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      `Bearer ${session.accessToken}`,
    );
    fetcher.mockRestore();
  });

  it('falls back to an anonymous event when initial restore exceeds the bounded wait', async () => {
    vi.useFakeTimers();
    let resolveSession!: (value: typeof session) => void;
    vi.mocked(refreshAccountSession).mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clickstream' }));
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBeNull();
    await act(async () => {
      resolveSession({ ...session, expiresAt: new Date(Date.now() + 60_000).toISOString() });
      await Promise.resolve();
    });
    fetcher.mockRestore();
    vi.useRealTimers();
  });

  it('refreshes an expiring in-memory token before sending clickstream', async () => {
    vi.mocked(refreshAccountSession).mockResolvedValue({
      ...session,
      expiresAt: new Date(Date.now() + 1_000).toISOString(),
    });
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Clickstream' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(refreshAccountSession).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      `Bearer ${session.accessToken}`,
    );
    fetcher.mockRestore();
  });
});
