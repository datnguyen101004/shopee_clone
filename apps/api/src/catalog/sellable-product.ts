import { ProductModerationStatus, ProductStatus } from '../generated/prisma/enums';

export const sellableProductWhere = {
  status: ProductStatus.ACTIVE,
  moderationStatus: ProductModerationStatus.ACTIVE,
  deletedAt: null,
} as const;

export function isSellableProduct(product: {
  status: ProductStatus;
  moderationStatus?: ProductModerationStatus;
  deletedAt: Date | null;
}): boolean {
  return product.status === ProductStatus.ACTIVE &&
    (product.moderationStatus ?? ProductModerationStatus.ACTIVE) === ProductModerationStatus.ACTIVE &&
    product.deletedAt === null;
}
