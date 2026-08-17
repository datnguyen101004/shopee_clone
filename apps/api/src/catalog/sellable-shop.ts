import { ShopOnboardingStatus, ShopStatus } from '../generated/prisma/enums';

export const sellableShopWhere = {
  status: ShopStatus.ACTIVE,
  onboardingStatus: ShopOnboardingStatus.APPROVED,
  deletedAt: null,
} as const;

export function isSellableShop(shop: {
  status: ShopStatus;
  onboardingStatus?: ShopOnboardingStatus;
  deletedAt: Date | null;
}): boolean {
  return (
    shop.status === ShopStatus.ACTIVE &&
    shop.deletedAt === null &&
    (shop.onboardingStatus ?? ShopOnboardingStatus.APPROVED) === ShopOnboardingStatus.APPROVED
  );
}

