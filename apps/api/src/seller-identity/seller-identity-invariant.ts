export interface SingleShopSellerInvariantReport {
  duplicateOwners: readonly unknown[];
  sellersWithoutApprovedShop: readonly unknown[];
  approvedOwnersWithoutSeller: readonly unknown[];
}

export function isSingleShopSellerInvariantValid(
  report: SingleShopSellerInvariantReport,
): boolean {
  return report.duplicateOwners.length === 0 && report.sellersWithoutApprovedShop.length === 0;
}
