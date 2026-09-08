'use client';

import type {
  CartResponse,
  CheckoutPreviewRequest,
  CheckoutPreviewResponse,
  CheckoutShopNote,
  ShippingAddress,
  ShippingServiceCode,
  VoucherCodeSelection,
} from '@shopee-clone/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getShippingAddresses } from '../../lib/account-api';
import { CheckoutApiError, previewCheckout } from '../../lib/checkout-api';
import { readCheckoutDraft } from '../../lib/checkout-draft';
import { useAuthSession } from '../auth-session-provider';

export type CheckoutPreviewStatus =
  'loading' | 'missing-address' | 'stale' | 'ready' | 'blocked' | 'error';

export interface CheckoutPreviewState {
  status: CheckoutPreviewStatus;
  addresses: ShippingAddress[];
  addressId: string;
  services: Record<string, ShippingServiceCode>;
  vouchers: VoucherCodeSelection;
  notes: Record<string, string>;
  preview: CheckoutPreviewResponse | null;
  message: string;
  setAddress(addressId: string): void;
  setService(shopId: string, service: ShippingServiceCode): void;
  setNote(shopId: string, note: string): void;
  retry(): void;
  request: CheckoutPreviewRequest | null;
}

export function useCheckoutPreview(
  cart: CartResponse | null,
  refreshCart: () => Promise<CartResponse | null>,
  onAdmissionRequired?: (message?: string, retryAfterSeconds?: number) => void,
): CheckoutPreviewState {
  const auth = useAuthSession();
  const [status, setStatus] = useState<CheckoutPreviewStatus>('loading');
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [addressId, setAddressId] = useState('');
  const [services, setServices] = useState<Record<string, ShippingServiceCode>>({});
  const [vouchers, setVouchers] = useState<VoucherCodeSelection>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<CheckoutPreviewResponse | null>(null);
  const [message, setMessage] = useState('Đang chuẩn bị thanh toán…');
  const [retryGeneration, setRetryGeneration] = useState(0);
  const sequence = useRef(0);

  const selectedShopIds = useMemo(
    () =>
      (cart?.groups ?? [])
        .filter(({ selectedEligibleLineCount }) => selectedEligibleLineCount > 0)
        .map(({ shop }) => shop.id)
        .sort(),
    [cart],
  );

  useEffect(() => {
    if (auth.state.status !== 'authenticated') return;
    const requestSequence = ++sequence.current;
    queueMicrotask(() => {
      if (sequence.current === requestSequence) setStatus('loading');
    });
    void getShippingAddresses(auth.authenticatedFetch)
      .then(({ items }) => {
        if (sequence.current !== requestSequence) return;
        const draft = readCheckoutDraft(window.sessionStorage);
        setAddresses(items);
        setAddressId(
          items.some(({ id }) => id === draft?.shippingAddressId)
            ? draft!.shippingAddressId!
            : (items.find(({ isDefault }) => isDefault)?.id ?? items[0]?.id ?? ''),
        );
        setServices(
          Object.fromEntries(
            selectedShopIds.map((shopId) => [
              shopId,
              draft?.services.find((selection) => selection.shopId === shopId)?.service ??
                'STANDARD',
            ]),
          ),
        );
        setVouchers(draft?.vouchers ?? {});
        if (items.length === 0) {
          setStatus('missing-address');
          setMessage('Bạn cần thêm địa chỉ nhận hàng trước khi đặt đơn.');
        }
      })
      .catch(() => {
        if (sequence.current !== requestSequence) return;
        setStatus('error');
        setMessage('Không thể tải địa chỉ nhận hàng. Vui lòng thử lại.');
      });
  }, [auth.authenticatedFetch, auth.state.status, retryGeneration, selectedShopIds]);

  const serviceSelections = useMemo(
    () =>
      selectedShopIds.map((shopId) => ({
        shopId,
        service: services[shopId] ?? ('STANDARD' as const),
      })),
    [selectedShopIds, services],
  );
  const noteSelections = useMemo<CheckoutShopNote[]>(
    () =>
      selectedShopIds
        .map((shopId) => ({ shopId, note: notes[shopId]?.trim() ?? '' }))
        .filter(({ note }) => note.length > 0),
    [notes, selectedShopIds],
  );
  const request = useMemo<CheckoutPreviewRequest | null>(
    () =>
      addressId
        ? {
            shippingAddressId: addressId,
            services: serviceSelections,
            ...(Object.keys(vouchers).length ? { vouchers } : {}),
            ...(noteSelections.length ? { notes: noteSelections } : {}),
          }
        : null,
    [addressId, noteSelections, serviceSelections, vouchers],
  );
  const requestSignature = request ? JSON.stringify(request) : '';

  useEffect(() => {
    if (auth.state.status !== 'authenticated' || !cart || !request) return;
    const controller = new AbortController();
    const requestSequence = ++sequence.current;
    queueMicrotask(() => {
      if (sequence.current !== requestSequence) return;
      setStatus(preview ? 'stale' : 'loading');
      setMessage(
        preview ? 'Đang cập nhật lại tổng thanh toán…' : 'Đang xác nhận giá và phí vận chuyển…',
      );
    });
    void previewCheckout(request, cart.version, auth.authenticatedFetch, controller.signal)
      .then((result) => {
        if (sequence.current !== requestSequence) return;
        setPreview(result);
        setStatus(result.ready ? 'ready' : 'blocked');
        setMessage(
          result.ready
            ? 'Giá, ưu đãi và phí vận chuyển đã được máy chủ xác nhận.'
            : 'Hãy xử lý các thông tin còn thiếu trước khi đặt hàng.',
        );
      })
      .catch(async (error: unknown) => {
        if (sequence.current !== requestSequence) return;
        if (error instanceof CheckoutApiError && error.kind === 'aborted') return;
        if (error instanceof CheckoutApiError && error.status === 409) {
          setStatus('stale');
          setMessage('Giỏ hàng đã thay đổi. Đang tải lại dữ liệu mới nhất…');
          await refreshCart();
          return;
        }
        if (error instanceof CheckoutApiError && error.status === 404) {
          setStatus('missing-address');
          setMessage('Địa chỉ này không còn khả dụng. Hãy chọn địa chỉ khác.');
          return;
        }
        if (
          error instanceof CheckoutApiError &&
          (error.status === 428 ||
            error.problem?.type?.includes('admission') ||
            error.problem?.type?.includes('waiting-room'))
        ) {
          onAdmissionRequired?.(error.problem?.detail, 5);
          setStatus('blocked');
          setMessage('Đang chuyển bạn vào phòng chờ thanh toán…');
          return;
        }
        setStatus('error');
        setMessage('Chưa thể xác nhận đơn hàng. Vui lòng thử lại.');
      });
    return () => controller.abort();
    // requestSignature is the normalized semantic request and prevents object-identity loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    auth.authenticatedFetch,
    auth.state.status,
    cart,
    refreshCart,
    requestSignature,
    retryGeneration,
    onAdmissionRequired,
  ]);

  return {
    status,
    addresses,
    addressId,
    services,
    vouchers,
    notes,
    preview,
    message,
    setAddress: setAddressId,
    setService(shopId, service) {
      setServices((current) => ({ ...current, [shopId]: service }));
    },
    setNote(shopId, note) {
      setNotes((current) => ({ ...current, [shopId]: note }));
    },
    retry() {
      setRetryGeneration((current) => current + 1);
    },
    request,
  };
}
