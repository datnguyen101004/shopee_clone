import {
  CHECKOUT_DRAFT_VERSION,
  isCheckoutDraft,
  type CheckoutDraft,
} from '@shopee-clone/contracts';

export const CHECKOUT_DRAFT_STORAGE_KEY = 'shopee-clone.checkout-draft';

export function normalizeCheckoutDraft(draft: CheckoutDraft): CheckoutDraft | null {
  if (!isCheckoutDraft(draft)) return null;
  const services = [...draft.services].sort((left, right) =>
    left.shopId.localeCompare(right.shopId),
  );
  const shopCodes = [...(draft.vouchers?.shopCodes ?? [])].sort((left, right) =>
    left.shopId.localeCompare(right.shopId),
  );
  return {
    version: CHECKOUT_DRAFT_VERSION,
    cartVersion: draft.cartVersion,
    shippingAddressId: draft.shippingAddressId,
    services,
    ...(draft.vouchers
      ? {
          vouchers: {
            ...(draft.vouchers.platformCode ? { platformCode: draft.vouchers.platformCode } : {}),
            ...(shopCodes.length ? { shopCodes } : {}),
            ...(draft.vouchers.freeShippingCode
              ? { freeShippingCode: draft.vouchers.freeShippingCode }
              : {}),
          },
        }
      : {}),
  };
}

export function readCheckoutDraft(storage: Pick<Storage, 'getItem'>): CheckoutDraft | null {
  try {
    const serialized = storage.getItem(CHECKOUT_DRAFT_STORAGE_KEY);
    if (!serialized) return null;
    return normalizeCheckoutDraft(JSON.parse(serialized) as CheckoutDraft);
  } catch {
    return null;
  }
}

export function writeCheckoutDraft(
  storage: Pick<Storage, 'setItem'>,
  draft: CheckoutDraft,
): CheckoutDraft {
  const normalized = normalizeCheckoutDraft(draft);
  if (!normalized) throw new Error('Invalid checkout draft');
  storage.setItem(CHECKOUT_DRAFT_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearCheckoutDraft(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
}
