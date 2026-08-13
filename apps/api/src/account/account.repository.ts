import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { UserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const profileSelect = {
  id: true,
  email: true,
  displayName: true,
  phoneNumber: true,
  status: true,
  roleAssignments: { select: { role: true } },
} as const;

const addressSelect = {
  id: true,
  recipientName: true,
  phoneNumber: true,
  province: true,
  district: true,
  ward: true,
  addressLine: true,
  label: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AccountTransaction = Prisma.TransactionClient;
export type PersistedProfile = NonNullable<Awaited<ReturnType<AccountRepository['findProfile']>>>;
export type PersistedAddress = Awaited<ReturnType<AccountRepository['listAddresses']>>[number];

@Injectable()
export class AccountRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findProfile(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE, deletedAt: null },
      select: profileSelect,
    });
  }

  updateProfile(userId: string, data: { displayName?: string; phoneNumber?: string | null }) {
    return this.prisma.user.update({ where: { id: userId }, data, select: profileSelect });
  }

  listAddresses(userId: string) {
    return this.prisma.shippingAddress.findMany({
      where: { userId, deletedAt: null },
      select: addressSelect,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  transaction<T>(work: (transaction: AccountTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  async lockOwner(transaction: AccountTransaction, userId: string): Promise<boolean> {
    const rows = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT id FROM users WHERE id = $1 AND status = 'active' AND deleted_at IS NULL FOR UPDATE",
      userId,
    );
    return rows.length === 1;
  }

  findOwnedAddress(transaction: AccountTransaction, userId: string, addressId: string) {
    return transaction.shippingAddress.findFirst({
      where: { id: addressId, userId, deletedAt: null },
      select: addressSelect,
    });
  }

  listOwnedAddresses(transaction: AccountTransaction, userId: string) {
    return transaction.shippingAddress.findMany({
      where: { userId, deletedAt: null },
      select: addressSelect,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }
}
