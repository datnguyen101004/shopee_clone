import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { ShopOnboardingStatus, ShopStatus, UserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export const sellerShopSelect = {
  id: true,
  ownerId: true,
  slug: true,
  name: true,
  description: true,
  logoUrl: true,
  bannerUrl: true,
  location: true,
  contactPhone: true,
  contactEmail: true,
  pickupRecipientName: true,
  pickupPhoneNumber: true,
  pickupProvince: true,
  pickupDistrict: true,
  pickupWard: true,
  pickupAddressLine: true,
  returnRecipientName: true,
  returnPhoneNumber: true,
  returnProvince: true,
  returnDistrict: true,
  returnWard: true,
  returnAddressLine: true,
  status: true,
  onboardingStatus: true,
  onboardingReason: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export type SellerOnboardingTransaction = Prisma.TransactionClient;
export type PersistedSellerShop = NonNullable<
  Awaited<ReturnType<SellerOnboardingRepository['findOwnedLiveShop']>>
>;
export type PersistedDefaultAddress = NonNullable<
  Awaited<ReturnType<SellerOnboardingRepository['findDefaultShippingAddress']>>
>;

@Injectable()
export class SellerOnboardingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  transaction<T>(work: (transaction: SellerOnboardingTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  async lockOwner(transaction: SellerOnboardingTransaction, userId: string): Promise<boolean> {
    const rows = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT id FROM users WHERE id = $1 AND status = 'active' AND deleted_at IS NULL FOR UPDATE",
      userId,
    );
    return rows.length === 1;
  }

  findOwnedLiveShop(userId: string, transaction: SellerOnboardingTransaction = this.prisma) {
    return transaction.shop.findFirst({
      where: {
        ownerId: userId,
        deletedAt: null,
        owner: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      select: sellerShopSelect,
    });
  }

  findDefaultShippingAddress(
    userId: string,
    transaction: SellerOnboardingTransaction = this.prisma,
  ) {
    return transaction.shippingAddress.findFirst({
      where: { userId, deletedAt: null, isDefault: true },
      select: {
        recipientName: true,
        phoneNumber: true,
        province: true,
        district: true,
        ward: true,
        addressLine: true,
      },
    });
  }

  async findShopById(shopId: string, transaction: SellerOnboardingTransaction = this.prisma) {
    // Approval decisions must serialize on the shop row. Without this lock, two
    // administrators can both read `pending` and overwrite each other's decision.
    const locked = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM shops WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      shopId,
    );
    if (locked.length === 0) return null;
    return transaction.shop.findFirst({
      where: { id: shopId, deletedAt: null },
      select: sellerShopSelect,
    });
  }

  createShop(transaction: SellerOnboardingTransaction, data: Prisma.ShopUncheckedCreateInput) {
    return transaction.shop.create({ data, select: sellerShopSelect });
  }

  updateShop(
    transaction: SellerOnboardingTransaction,
    shopId: string,
    data: Prisma.ShopUncheckedUpdateInput,
  ) {
    return transaction.shop.update({ where: { id: shopId }, data, select: sellerShopSelect });
  }
}

export { ShopOnboardingStatus, ShopStatus };
