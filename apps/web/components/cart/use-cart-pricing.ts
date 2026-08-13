'use client';

import type {
  CartResponse,
  PricingQuoteResponse,
  ShippingAddress,
  ShippingServiceCode,
} from '@shopee-clone/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getShippingAddresses } from '../../lib/account-api';
import { getPricingQuote, PricingApiError } from '../../lib/pricing-api';
import { useAuthSession } from '../auth-session-provider';

export type CartPricingStatus =
  'idle' | 'loading-addresses' | 'missing-address' | 'loading' | 'ready' | 'stale' | 'error';

export interface CartPricingState {
  status: CartPricingStatus;
  addresses: ShippingAddress[];
  selectedAddressId: string;
  services: Record<string, ShippingServiceCode>;
  quote: PricingQuoteResponse | null;
  message: string;
  setAddress(addressId: string): void;
  setService(shopId: string, service: ShippingServiceCode): void;
  retry(): void;
}

export function useCartPricing(
  cartResponse: CartResponse | null,
  refreshCart: () => Promise<CartResponse | null>,
): CartPricingState {
  const auth = useAuthSession();
  const [status, setStatus] = useState<CartPricingStatus>('idle');
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [serviceChoices, setServiceChoices] = useState<Record<string, ShippingServiceCode>>({});
  const [quote, setQuote] = useState<PricingQuoteResponse | null>(null);
  const [message, setMessage] = useState('');
  const [retryGeneration, setRetryGeneration] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    if (auth.state.status !== 'authenticated') {
      sequence.current += 1;
      // Logout is an external session transition; private quote state must be erased immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAddresses([]);
      setSelectedAddressId('');
      setServiceChoices({});
      setQuote(null);
      setMessage('');
      setStatus('idle');
      return;
    }

    const requestSequence = ++sequence.current;
    // Address loading is the external process synchronized by this effect.
    setStatus('loading-addresses');
    void getShippingAddresses(auth.sessionFetch)
      .then(({ items }) => {
        if (sequence.current !== requestSequence) return;
        setAddresses(items);
        setSelectedAddressId((current) => {
          if (items.some(({ id }) => id === current)) return current;
          return items.find(({ isDefault }) => isDefault)?.id ?? items[0]?.id ?? '';
        });
        if (items.length === 0) {
          setQuote(null);
          setStatus('missing-address');
          setMessage('Hãy thêm địa chỉ nhận hàng để xem phí vận chuyển và tổng thanh toán.');
        }
      })
      .catch(() => {
        if (sequence.current !== requestSequence) return;
        setStatus('error');
        setMessage('Không thể tải địa chỉ nhận hàng. Vui lòng thử lại.');
      });
  }, [auth.sessionFetch, auth.state.status, retryGeneration]);

  const selectedShopIds = useMemo(
    () =>
      (cartResponse?.groups ?? [])
        .filter(({ selectedEligibleLineCount }) => selectedEligibleLineCount > 0)
        .map(({ shop }) => shop.id)
        .sort(),
    [cartResponse],
  );

  const services = useMemo(
    () =>
      Object.fromEntries(
        selectedShopIds.map((shopId) => [shopId, serviceChoices[shopId] ?? 'STANDARD']),
      ),
    [selectedShopIds, serviceChoices],
  );

  const serviceSignature = selectedShopIds
    .map((shopId) => `${shopId}:${services[shopId] ?? 'STANDARD'}`)
    .join('|');

  useEffect(() => {
    if (
      auth.state.status !== 'authenticated' ||
      !cartResponse ||
      !selectedAddressId ||
      addresses.length === 0
    ) {
      return;
    }
    const controller = new AbortController();
    const requestSequence = ++sequence.current;
    // A quote request is the external process synchronized by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus((current) =>
      quote ? 'stale' : current === 'loading-addresses' ? current : 'loading',
    );
    setMessage(quote ? 'Đang cập nhật lại bảng giá…' : 'Đang tính phí vận chuyển…');
    const serviceSelections = selectedShopIds.map((shopId) => ({
      shopId,
      service: services[shopId] ?? 'STANDARD',
    }));
    void getPricingQuote(
      { shippingAddressId: selectedAddressId, services: serviceSelections },
      cartResponse.version,
      auth.sessionFetch,
      controller.signal,
    )
      .then((result) => {
        if (sequence.current !== requestSequence) return;
        setQuote(result);
        setStatus('ready');
        setMessage('Bảng giá và phí vận chuyển đã được máy chủ xác nhận.');
      })
      .catch(async (error: unknown) => {
        if (sequence.current !== requestSequence) return;
        if (error instanceof PricingApiError && error.kind === 'aborted') return;
        if (error instanceof PricingApiError && error.status === 409) {
          setStatus('stale');
          setMessage('Giỏ hàng đã thay đổi. Đang tải lại dữ liệu mới nhất…');
          await refreshCart();
          return;
        }
        setStatus('error');
        setMessage('Chưa thể xác nhận bảng giá. Tổng thanh toán hiện không khả dụng.');
      });
    return () => controller.abort();
    // services are represented by a stable semantic signature to avoid object-identity loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    addresses.length,
    auth.sessionFetch,
    auth.state.status,
    cartResponse,
    refreshCart,
    selectedAddressId,
    selectedShopIds,
    serviceSignature,
    retryGeneration,
  ]);

  return {
    status,
    addresses,
    selectedAddressId,
    services,
    quote,
    message,
    setAddress: setSelectedAddressId,
    setService(shopId, service) {
      setServiceChoices((current) => ({ ...current, [shopId]: service }));
    },
    retry() {
      setRetryGeneration((current) => current + 1);
    },
  };
}
