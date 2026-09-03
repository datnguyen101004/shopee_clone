import { CHECKOUT_DRAFT_VERSION } from '@shopee-clone/contracts';
import { describe, expect, it } from 'vitest';

import {
  CHECKOUT_DRAFT_STORAGE_KEY,
  clearCheckoutDraft,
  readCheckoutDraft,
  writeCheckoutDraft,
} from './checkout-draft';
import { CheckoutSubmitIntent } from './checkout-intent';

const addressId = '00000000-0000-4000-8000-000000000001';
const shopA = '00000000-0000-4000-8000-000000000002';
const shopB = '00000000-0000-4000-8000-000000000003';

describe('checkout browser state', () => {
  it('stores only a versioned, canonical ID-only draft', () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    writeCheckoutDraft(adapter, {
      version: CHECKOUT_DRAFT_VERSION,
      cartVersion: 4,
      shippingAddressId: addressId,
      services: [
        { shopId: shopB, service: 'EXPRESS' },
        { shopId: shopA, service: 'STANDARD' },
      ],
    });
    expect(readCheckoutDraft(adapter)?.services.map(({ shopId }) => shopId)).toEqual([
      shopA,
      shopB,
    ]);
    expect(storage.get(CHECKOUT_DRAFT_STORAGE_KEY)).not.toContain('recipientName');
    expect(storage.get(CHECKOUT_DRAFT_STORAGE_KEY)).not.toContain('payableTotalMinor');
    clearCheckoutDraft(adapter);
    expect(readCheckoutDraft(adapter)).toBeNull();
  });

  it('rejects corrupt, stale-schema, and personal-data drafts', () => {
    for (const value of [
      '{',
      JSON.stringify({ version: 0 }),
      JSON.stringify({
        version: CHECKOUT_DRAFT_VERSION,
        cartVersion: 1,
        shippingAddressId: addressId,
        services: [],
        recipientName: 'Must not persist',
      }),
    ]) {
      expect(readCheckoutDraft({ getItem: () => value })).toBeNull();
    }
  });

  it('reuses a key after unknown outcomes and rotates only on edit or conflict', () => {
    const keys = ['00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012'];
    const intent = new CheckoutSubmitIntent(() => keys.shift()!);
    expect(intent.keyFor('same')).toBe('00000000-0000-4000-8000-000000000011');
    expect(intent.keyFor('same')).toBe('00000000-0000-4000-8000-000000000011');
    expect(intent.keyFor('edited')).toBe('00000000-0000-4000-8000-000000000012');
  });
});
