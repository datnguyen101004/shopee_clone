import { isSingleShopSellerInvariantValid } from './seller-identity-invariant';

describe('single-shop seller invariant report', () => {
  it('accepts a report with no duplicate owners or orphaned seller roles', () => {
    expect(
      isSingleShopSellerInvariantValid({
        duplicateOwners: [],
        sellersWithoutApprovedShop: [],
        approvedOwnersWithoutSeller: [{ ownerId: 'owner-1' }],
      }),
    ).toBe(true);
  });

  it('rejects duplicate ownership without mutating the report', () => {
    const report = {
      duplicateOwners: [{ ownerId: 'owner-1', shopIds: ['shop-1', 'shop-2'] }],
      sellersWithoutApprovedShop: [],
      approvedOwnersWithoutSeller: [],
    };
    expect(isSingleShopSellerInvariantValid(report)).toBe(false);
    expect(report.duplicateOwners).toHaveLength(1);
  });

  it('rejects a seller role that has no approved shop', () => {
    expect(
      isSingleShopSellerInvariantValid({
        duplicateOwners: [],
        sellersWithoutApprovedShop: [{ userId: 'seller-1', shopCount: 0 }],
        approvedOwnersWithoutSeller: [],
      }),
    ).toBe(false);
  });
});
