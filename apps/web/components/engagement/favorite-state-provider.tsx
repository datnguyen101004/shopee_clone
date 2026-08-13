'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getFavoriteStatus, setFavorite } from '../../lib/engagement-api';
import { useAuthSession } from '../auth-session-provider';

type FavoriteControlState = { isFavorite: boolean; pending: boolean; error: string | null };
type FavoriteContextValue = {
  authenticated: boolean;
  stateFor(productId: string): FavoriteControlState;
  toggle(productId: string): Promise<void>;
};

const idle = { isFavorite: false, pending: false, error: null };
const hydrating = { isFavorite: false, pending: true, error: null };
const FavoriteContext = createContext<FavoriteContextValue>({
  authenticated: false,
  stateFor: () => idle,
  toggle: async () => undefined,
});

export function FavoriteStateProvider({
  productIds,
  children,
}: {
  productIds: string[];
  children: ReactNode;
}) {
  const auth = useAuthSession();
  const ids = useMemo(() => [...new Set(productIds)].slice(0, 48), [productIds]);
  const authUserId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const sessionKey = authUserId ? `${authUserId}:${ids.join(',')}` : 'guest';
  const [snapshot, setSnapshot] = useState<{
    key: string;
    states: Record<string, FavoriteControlState>;
  }>({ key: '', states: {} });
  const states = useMemo(
    () => (snapshot.key === sessionKey ? snapshot.states : {}),
    [sessionKey, snapshot],
  );

  useEffect(() => {
    let active = true;
    if (auth.state.status !== 'authenticated' || ids.length === 0) {
      return () => {
        active = false;
      };
    }
    void getFavoriteStatus(ids, auth.authenticatedFetch)
      .then(({ items }) => {
        if (!active) return;
        setSnapshot({
          key: sessionKey,
          states: Object.fromEntries(
            items.map(({ productId, isFavorite }) => [
              productId,
              { isFavorite, pending: false, error: null },
            ]),
          ),
        });
      })
      .catch(() => {
        if (!active) return;
        setSnapshot({
          key: sessionKey,
          states: Object.fromEntries(
            ids.map((productId) => [
              productId,
              { ...idle, error: 'Chưa thể tải trạng thái yêu thích.' },
            ]),
          ),
        });
      });
    return () => {
      active = false;
    };
  }, [auth.authenticatedFetch, auth.state.status, ids, sessionKey]);

  const toggle = useCallback(
    async (productId: string) => {
      if (auth.state.status !== 'authenticated') return;
      const previous = states[productId] ?? idle;
      if (previous.pending) return;
      const next = !previous.isFavorite;
      const update = (state: FavoriteControlState) =>
        setSnapshot((current) => ({
          key: sessionKey,
          states: {
            ...(current.key === sessionKey ? current.states : {}),
            [productId]: state,
          },
        }));
      update({ isFavorite: next, pending: true, error: null });
      try {
        const confirmed = await setFavorite(productId, next, auth.authenticatedFetch);
        update({ isFavorite: confirmed.isFavorite, pending: false, error: null });
      } catch {
        update({
          ...previous,
          pending: false,
          error: 'Không thể cập nhật yêu thích. Vui lòng thử lại.',
        });
      }
    },
    [auth.authenticatedFetch, auth.state.status, sessionKey, states],
  );

  const value = useMemo<FavoriteContextValue>(
    () => ({
      authenticated: auth.state.status === 'authenticated',
      stateFor: (productId) =>
        states[productId] ?? (auth.state.status === 'authenticated' ? hydrating : idle),
      toggle,
    }),
    [auth.state.status, states, toggle],
  );
  return <FavoriteContext.Provider value={value}>{children}</FavoriteContext.Provider>;
}

export function useFavoriteState(productId: string) {
  const context = useContext(FavoriteContext);
  return {
    ...context.stateFor(productId),
    authenticated: context.authenticated,
    toggle: context.toggle,
  };
}
