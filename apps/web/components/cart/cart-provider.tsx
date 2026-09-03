'use client';

import type { CartAdjustment, CartMutationResponse, CartResponse } from '@shopee-clone/contracts';
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
  CartApiError,
  addCartItem,
  getCart,
  removeCartItem,
  setAllCartSelection,
  setCartLineSelection,
  setCartShopSelection,
  updateCartQuantity,
} from '../../lib/cart-api';
import { useAuthSession } from '../auth-session-provider';

type CartState =
  | { status: 'loading'; cart: null }
  | { status: 'unauthenticated'; cart: null }
  | { status: 'ready'; cart: CartResponse }
  | { status: 'error'; cart: CartResponse | null };

interface CartContextValue {
  state: CartState;
  pending: boolean;
  message: string;
  refresh(): Promise<CartResponse | null>;
  addItem(variantId: string, quantity: number): Promise<CartMutationResponse>;
  updateQuantity(lineId: string, quantity: number): Promise<CartMutationResponse>;
  removeItem(lineId: string): Promise<CartMutationResponse>;
  selectLine(lineId: string, selected: boolean): Promise<CartMutationResponse>;
  selectShop(shopId: string, selected: boolean): Promise<CartMutationResponse>;
  selectAll(selected: boolean): Promise<CartMutationResponse>;
}

const unavailable = async (): Promise<never> => {
  throw new Error('Authentication is required to use the cart');
};

const CartContext = createContext<CartContextValue>({
  state: { status: 'loading', cart: null },
  pending: false,
  message: '',
  refresh: async () => null,
  addItem: unavailable,
  updateQuantity: unavailable,
  removeItem: unavailable,
  selectLine: unavailable,
  selectShop: unavailable,
  selectAll: unavailable,
});

function adjustmentMessage(adjustments: CartAdjustment[]): string {
  return adjustments.map(({ message }) => message).join(' ');
}

export function CartProvider({ children }: { children: ReactNode }) {
  const auth = useAuthSession();
  const [state, setState] = useState<CartState>({ status: 'loading', cart: null });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const currentCart = useRef<CartResponse | null>(null);
  const operation = useRef<Promise<unknown> | null>(null);
  const loadedAuthKey = useRef('');

  const clearPrivateCart = useCallback(() => {
    currentCart.current = null;
    operation.current = null;
    setPending(false);
    setMessage('');
    setState({ status: 'unauthenticated', cart: null });
  }, []);

  const accept = useCallback((cart: CartResponse, nextMessage = '') => {
    currentCart.current = cart;
    setState({ status: 'ready', cart });
    setMessage(nextMessage);
    return cart;
  }, []);

  const refresh = useCallback(async () => {
    if (auth.state.status !== 'authenticated') {
      clearPrivateCart();
      return null;
    }
    try {
      return accept(await getCart(auth.sessionFetch));
    } catch {
      setState((current) => ({ status: 'error', cart: current.cart }));
      setMessage('Không thể tải giỏ hàng. Vui lòng thử lại.');
      return null;
    }
  }, [accept, auth.sessionFetch, auth.state.status, clearPrivateCart]);

  useEffect(() => {
    if (auth.state.status === 'loading') return;

    if (auth.state.status !== 'authenticated') {
      loadedAuthKey.current = 'unauthenticated';
      queueMicrotask(() => {
        if (loadedAuthKey.current === 'unauthenticated') clearPrivateCart();
      });
      return;
    }

    const key = `user:${auth.state.user.id}`;
    if (loadedAuthKey.current === key) return;
    loadedAuthKey.current = key;
    currentCart.current = null;
    queueMicrotask(() => {
      if (loadedAuthKey.current !== key) return;
      setMessage('');
      setState({ status: 'loading', cart: null });
      void refresh();
    });
  }, [auth.state, clearPrivateCart, refresh]);

  const mutate = useCallback(
    async (work: (cart: CartResponse) => Promise<CartMutationResponse>) => {
      if (auth.state.status !== 'authenticated') {
        throw new Error('Authentication is required to use the cart');
      }
      if (operation.current) throw new Error('Cart operation already pending');
      const cart = currentCart.current;
      if (!cart) throw new Error('Cart is not ready');

      setPending(true);
      setMessage('');
      const task = work(cart)
        .then((result) => {
          accept(result.cart, adjustmentMessage(result.adjustments));
          return result;
        })
        .catch(async (error: unknown) => {
          if (error instanceof CartApiError && error.status === 409) {
            await refresh();
            setMessage('Giỏ hàng đã thay đổi ở nơi khác. Dữ liệu mới nhất đã được tải lại.');
          } else {
            setMessage('Không thể cập nhật giỏ hàng. Dữ liệu đã xác nhận vẫn được giữ nguyên.');
          }
          throw error;
        })
        .finally(() => {
          operation.current = null;
          setPending(false);
        });
      operation.current = task;
      return task;
    },
    [accept, auth.state.status, refresh],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      state,
      pending,
      message,
      refresh,
      addItem: (variantId, quantity) =>
        mutate((cart) => addCartItem(variantId, quantity, cart.version, auth.sessionFetch)),
      updateQuantity: (lineId, quantity) =>
        mutate((cart) => updateCartQuantity(lineId, quantity, cart.version, auth.sessionFetch)),
      removeItem: (lineId) =>
        mutate((cart) => removeCartItem(lineId, cart.version, auth.sessionFetch)),
      selectLine: (lineId, selected) =>
        mutate((cart) => setCartLineSelection(lineId, selected, cart.version, auth.sessionFetch)),
      selectShop: (shopId, selected) =>
        mutate((cart) => setCartShopSelection(shopId, selected, cart.version, auth.sessionFetch)),
      selectAll: (selected) =>
        mutate((cart) => setAllCartSelection(selected, cart.version, auth.sessionFetch)),
    }),
    [auth.sessionFetch, message, mutate, pending, refresh, state],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
