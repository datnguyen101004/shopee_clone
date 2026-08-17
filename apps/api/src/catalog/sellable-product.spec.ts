import { ProductModerationStatus, ProductStatus } from '../generated/prisma/enums';
import { isSellableProduct } from './sellable-product';

describe('isSellableProduct', () => {
  const product = { status: ProductStatus.ACTIVE, moderationStatus: ProductModerationStatus.ACTIVE, deletedAt: null };
  it('allows published active moderation only', () => {
    expect(isSellableProduct(product)).toBe(true);
    expect(isSellableProduct({ ...product, status: ProductStatus.HIDDEN })).toBe(false);
    expect(isSellableProduct({ ...product, moderationStatus: ProductModerationStatus.SUSPENDED })).toBe(false);
    expect(isSellableProduct({ ...product, deletedAt: new Date() })).toBe(false);
  });
});
