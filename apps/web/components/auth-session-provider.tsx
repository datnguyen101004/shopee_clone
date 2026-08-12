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
});

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthSessionState>({ status: 'loading', user: null });
  const accessToken = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<AuthSessionResponse | null> | null>(null);
  const generation = useRef(0);

  const acceptSession = useCallback((session: AuthSessionResponse) => {
    accessToken.current = session.accessToken;
    setState({ status: 'authenticated', user: session.user });
    return session;
  }, []);

  const becomeGuest = useCallback(() => {
    accessToken.current = null;
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
        return fetch(input, { ...init, headers, credentials: 'include' });
      };
      if (!accessToken.current) await restore();
      const response = await perform(accessToken.current);
      if (response.status !== 401) return response;
      accessToken.current = null;
      const refreshed = await restore();
      if (!refreshed) return response;
      return perform(refreshed.accessToken);
    },
    [restore],
  );

  const value = useMemo(
    () => ({
      state,
      login,
      register,
      logout,
      restore,
      completeGoogleSignIn: restore,
      authenticatedFetch,
    }),
    [authenticatedFetch, login, logout, register, restore, state],
  );
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  return useContext(AuthSessionContext);
}
