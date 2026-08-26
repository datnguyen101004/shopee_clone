import { ShopOnboardingStatus, ShopStatus } from '../generated/prisma/enums';
import { isSellableShop, sellableShopWhere } from './sellable-shop';

describe('sellable shop policy', () => {
  const approvedActive = {
    status: ShopStatus.ACTIVE,
    onboardingStatus: ShopOnboardingStatus.APPROVED,
    deletedAt: null,
  } as const;

  it('allows only approved active non-deleted shops', () => {
    expect(isSellableShop(approvedActive)).toBe(true);
    expect(isSellableShop({ ...approvedActive, status: ShopStatus.INACTIVE })).toBe(false);
    expect(isSellableShop({ ...approvedActive, status: ShopStatus.SUSPENDED })).toBe(false);
    expect(isSellableShop({ ...approvedActive, onboardingStatus: ShopOnboardingStatus.PENDING_APPROVAL })).toBe(false);
    expect(isSellableShop({ ...approvedActive, deletedAt: new Date() })).toBe(false);
  });

  it('exposes the same predicate to catalog, storefront, cart, and checkout queries', () => {
    expect(sellableShopWhere).toEqual({
      status: ShopStatus.ACTIVE,
      onboardingStatus: ShopOnboardingStatus.APPROVED,
      deletedAt: null,
    });
  });
});
