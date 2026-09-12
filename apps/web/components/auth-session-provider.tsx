'use client';

import type {
  AuthSessionResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '@shopee-clone/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  loginAccount,
  logoutAccount,
  refreshAccountSession,
  registerAccount,
} from '../lib/auth-api';

export type AuthSessionState =
  | { status: 'loading'; user: null }
  | { status: 'guest'; user: null }
  | { status: 'authenticated'; user: AuthUser };

interface AuthSessionContextValue {
  state: AuthSessionState;
  login(input: LoginRequest): Promise<AuthSessionResponse>;
  register(input: RegisterRequest): Promise<AuthSessionResponse>;
  logout(): Promise<void>;
  restore(): Promise<AuthSessionResponse | null>;
  completeGoogleSignIn(): Promise<AuthSessionResponse | null>;
  authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  clickstreamFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  sessionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  synchronizeDisplayName(displayName: string): void;
}

const unavailable = async (): Promise<never> => {
  throw new Error('AuthSessionProvider is unavailable');
};

const AuthSessionContext = createContext<AuthSessionContextValue>({
  state: { status: 'guest', user: null },
  login: unavailable,
  register: unavailable,
  logout: async () => undefined,
  restore: async () => null,
  completeGoogleSignIn: async () => null,
  authenticatedFetch: unavailable,
  clickstreamFetch: unavailable,
  sessionFetch: unavailable,
  synchronizeDisplayName: () => undefined,
});

const CLICKSTREAM_RESTORE_WAIT_MS = 1_000;
const CLICKSTREAM_TOKEN_SKEW_MS = 5_000;

function waitForSessionRestore(
  pending: Promise<AuthSessionResponse | null>,
  timeoutMs: number,
): Promise<AuthSessionResponse | null | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    const finish = (session: AuthSessionResponse | null | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(session);
    };
    void pending.then(finish, () => finish(null));
  });
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthSessionState>({ status: 'loading', user: null });
  const accessToken = useRef<string | null>(null);
  const accessTokenExpiresAt = useRef<number | null>(null);
  const refreshInFlight = useRef<Promise<AuthSessionResponse | null> | null>(null);
  const generation = useRef(0);
  const status = useRef<AuthSessionState['status']>('loading');

  const acceptSession = useCallback((session: AuthSessionResponse) => {
    accessToken.current = session.accessToken;
    const expiresAt = Date.parse(session.expiresAt);
    accessTokenExpiresAt.current = Number.isNaN(expiresAt) ? null : expiresAt;
    status.current = 'authenticated';
    setState({ status: 'authenticated', user: session.user });
    return session;
  }, []);

  const becomeGuest = useCallback(() => {
    accessToken.current = null;
    accessTokenExpiresAt.current = null;
    status.current = 'guest';
    setState({ status: 'guest', user: null });
  }, []);

  const restore = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const requestGeneration = generation.current;
    const pending = refreshAccountSession()
      .then((session) => {
        if (generation.current !== requestGeneration) return null;
        return acceptSession(session);
      })
      .catch(() => {
        if (generation.current === requestGeneration) becomeGuest();
        return null;
      })
      .finally(() => {
        if (refreshInFlight.current === pending) refreshInFlight.current = null;
      });
    refreshInFlight.current = pending;
    return pending;
  }, [acceptSession, becomeGuest]);

  useEffect(() => {
    void restore();
  }, [restore]);

  const login = useCallback(
    async (input: LoginRequest) => acceptSession(await loginAccount(input)),
    [acceptSession],
  );

  const register = useCallback(
    async (input: RegisterRequest) => acceptSession(await registerAccount(input)),
    [acceptSession],
  );

  const logout = useCallback(async () => {
    generation.current += 1;
    becomeGuest();
    try {
      await logoutAccount();
    } catch {
      // Local state is intentionally cleared even if the server is unavailable.
    }
  }, [becomeGuest]);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const perform = (token: string | null) => {
        const headers = new Headers(init.headers);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        else headers.delete('Authorization');
        return fetch(input, { ...init, headers, credentials: 'include' });
      };
      if (!accessToken.current) await restore();
      const response = await perform(accessToken.current);
      if (response.status !== 401) return response;
      accessToken.current = null;
      accessTokenExpiresAt.current = null;
      const refreshed = await restore();
      if (!refreshed) return response;
      return perform(refreshed.accessToken);
    },
    [restore],
  );

  const sessionFetch = useCallback((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (accessToken.current) headers.set('Authorization', `Bearer ${accessToken.current}`);
    else headers.delete('Authorization');
    return fetch(input, { ...init, headers, credentials: 'include' });
  }, []);

  const clickstreamFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const tokenExpiresSoon =
        accessToken.current !== null &&
        accessTokenExpiresAt.current !== null &&
        accessTokenExpiresAt.current <= Date.now() + CLICKSTREAM_TOKEN_SKEW_MS;

      if (tokenExpiresSoon) {
        // The clickstream endpoint intentionally accepts anonymous events and
        // may downgrade an expired bearer to guest instead of returning 401.
        // Refresh just before expiry while the token is still in memory; if
        // that bounded refresh cannot complete, send without the stale bearer.
        const refreshed = await waitForSessionRestore(
          restore(),
          CLICKSTREAM_RESTORE_WAIT_MS,
        );
        if (refreshed) return authenticatedFetch(input, init);
        const headers = new Headers(init.headers);
        headers.delete('Authorization');
        return fetch(input, { ...init, headers, credentials: 'include' });
      }

      if (accessToken.current || status.current === 'guest') {
        return accessToken.current
          ? authenticatedFetch(input, init)
          : sessionFetch(input, init);
      }

      // Do not let clickstream delivery block indefinitely on auth. If the
      // shared restore has not completed quickly, preserve anonymous tracking
      // rather than dropping the event or issuing an unbounded refresh.
      const restored = await waitForSessionRestore(restore(), CLICKSTREAM_RESTORE_WAIT_MS);
      return restored ? authenticatedFetch(input, init) : sessionFetch(input, init);
    },
    [authenticatedFetch, restore, sessionFetch],
  );

  const synchronizeDisplayName = useCallback((displayName: string) => {
    setState((current) =>
      current.status === 'authenticated'
        ? { ...current, user: { ...current.user, displayName } }
        : current,
    );
  }, []);

  const value = useMemo(
    () => ({
      state,
      login,
      register,
      logout,
      restore,
      completeGoogleSignIn: restore,
      authenticatedFetch,
      clickstreamFetch,
      sessionFetch,
      synchronizeDisplayName,
    }),
    [
      authenticatedFetch,
      clickstreamFetch,
      login,
      logout,
      register,
      restore,
      sessionFetch,
      state,
      synchronizeDisplayName,
    ],
  );
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  return useContext(AuthSessionContext);
}
