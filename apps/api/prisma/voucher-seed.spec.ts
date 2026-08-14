import { readFileSync } from 'node:fs';
import path from 'node:path';

import { seedExpectedCounts, seedVoucherCodes, seedVoucherFixtureIds } from './seed-data';

describe('deterministic voucher seed fixtures', () => {
  it('keeps stable canonical identities and expected persistence counts', () => {
    expect(Object.values(seedVoucherCodes)).toEqual([
      'PLATFORM-50K',
      'PLATFORM-10',
      'SHOP-15',
      'FREESHIP-30K',
      'EXPIRED-10K',
      'FUTURE-10K',
      'EXHAUSTED-10K',
      'USED-10K',
    ]);
    expect(new Set(Object.values(seedVoucherFixtureIds)).size).toBe(
      Object.values(seedVoucherFixtureIds).length,
    );
    expect(seedExpectedCounts).toMatchObject({
      vouchers: 8,
      voucherProductScopes: 1,
      voucherUserUsages: 2,
      voucherConsumptions: 2,
      voucherRedemptions: 2,
      products: 1_378,
      variants: 1_377,
    });
  });

  it('declares active, boundary, used, and exhausted fixtures in the seed implementation', () => {
    const source = readFileSync(path.join(process.cwd(), 'prisma/seed.ts'), 'utf8');
    for (const key of [
      'platformFixed',
      'platformPercentage',
      'shopPercentage',
      'freeShipping',
      'expired',
      'future',
      'exhausted',
      'buyerUsed',
    ]) {
      expect(source).toContain(`seedVoucherFixtureIds.${key}`);
    }
    expect(source).toContain('voucherProductScope.deleteMany');
    expect(source).toContain('voucherUserUsage.upsert');
    expect(source).toContain('voucherConsumption.upsert');
    expect(source).toContain('voucherRedemption.upsert');
  });
});
