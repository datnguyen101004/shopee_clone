'use client';

import type {
  CartResponse,
  PricingQuoteResponse,
  ShippingAddress,
  ShippingServiceCode,
  VoucherCodeSelection,
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
  vouchers: VoucherCodeSelection;
  quote: PricingQuoteResponse | null;
  message: string;
  setAddress(addressId: string): void;
  setService(shopId: string, service: ShippingServiceCode): void;
  setPlatformVoucher(code: string | null): void;
  setShopVoucher(shopId: string, code: string | null): void;
  setFreeShippingVoucher(code: string | null): void;
  retry(): void;
}

export function useCartPricing(
  cartResponse: CartResponse | null,
  refreshCart: () => Promise<CartResponse | null>,
): CartPricingState {
  const auth = useAuthSession();
  const [status, setStatus] = useState<CartPricingStatus>('idle');
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [serviceChoices, setServiceChoices] = useState<Record<string, ShippingServiceCode>>({});
  const [voucherChoices, setVoucherChoices] = useState<VoucherCodeSelection>({});
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
      setAddressesLoaded(false);
      setSelectedAddressId('');
      setServiceChoices({});
      setVoucherChoices({});
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
        setAddressesLoaded(true);
        setSelectedAddressId((current) => {
          if (items.some(({ id }) => id === current)) return current;
          return items.find(({ isDefault }) => isDefault)?.id ?? items[0]?.id ?? '';
        });
        if (items.length === 0) {
          setVoucherChoices((current) => {
            if (!current.freeShippingCode) return current;
            const next = { ...current };
            delete next.freeShippingCode;
            return next;
          });
          setStatus('missing-address');
          setMessage('Đã tính giá hàng và voucher. Thêm địa chỉ để tính phí vận chuyển.');
        }
      })
      .catch(() => {
        if (sequence.current !== requestSequence) return;
        setAddressesLoaded(false);
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

  const vouchers = useMemo<VoucherCodeSelection>(() => {
    const selectedShopSet = new Set(selectedShopIds);
    const shopCodes = (voucherChoices.shopCodes ?? [])
      .filter(({ shopId }) => selectedShopSet.has(shopId))
      .sort((left, right) => left.shopId.localeCompare(right.shopId));
    return {
      ...(voucherChoices.platformCode ? { platformCode: voucherChoices.platformCode } : {}),
      ...(shopCodes.length ? { shopCodes } : {}),
      ...(voucherChoices.freeShippingCode
        ? { freeShippingCode: voucherChoices.freeShippingCode }
        : {}),
    };
  }, [selectedShopIds, voucherChoices]);

  const voucherSignature = [
    vouchers.platformCode ?? '',
    ...(vouchers.shopCodes ?? []).map(({ shopId, code }) => `${shopId}:${code}`),
    vouchers.freeShippingCode ?? '',
  ]
    .filter(Boolean)
    .join('|');

  useEffect(() => {
    if (auth.state.status !== 'authenticated' || !cartResponse || !addressesLoaded) {
      return;
    }
    const hasShippingAddress = Boolean(selectedAddressId && addresses.length > 0);
    const quoteVouchers: VoucherCodeSelection = hasShippingAddress
      ? vouchers
      : {
          ...(vouchers.platformCode ? { platformCode: vouchers.platformCode } : {}),
          ...(vouchers.shopCodes?.length ? { shopCodes: vouchers.shopCodes } : {}),
        };
    const quoteVoucherSignature = [
      quoteVouchers.platformCode ?? '',
      ...(quoteVouchers.shopCodes ?? []).map(({ shopId, code }) => `${shopId}:${code}`),
      quoteVouchers.freeShippingCode ?? '',
    ]
      .filter(Boolean)
      .join('|');
    const controller = new AbortController();
    const requestSequence = ++sequence.current;
    // A quote request is the external process synchronized by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus((current) =>
      hasShippingAddress
        ? quote
          ? 'stale'
          : current === 'loading-addresses'
            ? current
            : 'loading'
        : 'missing-address',
    );
    setMessage(
      hasShippingAddress
        ? quote
          ? 'Đang cập nhật lại bảng giá…'
          : 'Đang tính phí vận chuyển…'
        : 'Đang tính giá hàng và voucher…',
    );
    const serviceSelections = selectedShopIds.map((shopId) => ({
      shopId,
      service: services[shopId] ?? 'STANDARD',
    }));
    void getPricingQuote(
      {
        ...(hasShippingAddress
          ? { shippingAddressId: selectedAddressId, services: serviceSelections }
          : {}),
        ...(quoteVoucherSignature ? { vouchers: quoteVouchers } : {}),
      },
      cartResponse.version,
      auth.sessionFetch,
      controller.signal,
    )
      .then((result) => {
        if (sequence.current !== requestSequence) return;
        setQuote(result);
        setStatus(hasShippingAddress ? 'ready' : 'missing-address');
        setMessage(
          hasShippingAddress
            ? 'Bảng giá và phí vận chuyển đã được máy chủ xác nhận.'
            : 'Đã áp dụng voucher hàng hóa tốt nhất. Thêm địa chỉ để tính phí vận chuyển.',
        );
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
    addressesLoaded,
    auth.sessionFetch,
    auth.state.status,
    cartResponse,
    refreshCart,
    selectedAddressId,
    selectedShopIds,
    serviceSignature,
    voucherSignature,
    retryGeneration,
  ]);

  useEffect(() => {
    if ((status !== 'ready' && status !== 'missing-address') || !quote) return;
    const rejectedShopIds = new Set(
      quote.vouchers
        .filter((item) => item.slot === 'SHOP' && item.status === 'REJECTED' && item.shopId)
        .map((item) => item.shopId as string),
    );
    const shippingRejected = quote.vouchers.some(
      (item) => item.slot === 'FREE_SHIPPING' && item.status === 'REJECTED',
    );
    if (rejectedShopIds.size === 0 && !shippingRejected) return;
    // Clearing a rejected shop/shipping code is synchronized with the latest quote result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoucherChoices((current) => {
      const shopCodes = (current.shopCodes ?? []).filter(
        (item) => !rejectedShopIds.has(item.shopId),
      );
      const shopUnchanged = shopCodes.length === (current.shopCodes ?? []).length;
      const shippingUnchanged = !shippingRejected || !current.freeShippingCode;
      if (shopUnchanged && shippingUnchanged) return current;
      const next = { ...current };
      if (shopCodes.length) next.shopCodes = shopCodes;
      else delete next.shopCodes;
      if (shippingRejected) delete next.freeShippingCode;
      return next;
    });
  }, [quote, status]);

  return {
    status,
    addresses,
    selectedAddressId,
    services,
    vouchers,
    quote,
    message,
    setAddress: setSelectedAddressId,
    setService(shopId, service) {
      setServiceChoices((current) => ({ ...current, [shopId]: service }));
    },
    setPlatformVoucher(code) {
      setVoucherChoices((current) => {
        const next = { ...current };
        if (code) next.platformCode = code;
        else delete next.platformCode;
        return next;
      });
    },
    setShopVoucher(shopId, code) {
      setVoucherChoices((current) => {
        const shopCodes = (current.shopCodes ?? []).filter((item) => item.shopId !== shopId);
        if (code) shopCodes.push({ shopId, code });
        const next = { ...current };
        if (shopCodes.length) next.shopCodes = shopCodes;
        else delete next.shopCodes;
        return next;
      });
    },
    setFreeShippingVoucher(code) {
      if (!selectedAddressId) return;
      setVoucherChoices((current) => {
        const next = { ...current };
        if (code) next.freeShippingCode = code;
        else delete next.freeShippingCode;
        return next;
      });
    },
    retry() {
      setRetryGeneration((current) => current + 1);
    },
  };
}
