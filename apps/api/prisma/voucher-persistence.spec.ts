import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('marketplace voucher persistence', () => {
  const schema = readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    path.join(process.cwd(), 'prisma/migrations/20260814060000_marketplace_vouchers/migration.sql'),
    'utf8',
  );

  it('models definitions, product scopes, user counters, consumption, and audit', () => {
    for (const model of [
      'model Voucher {',
      'model VoucherProductScope {',
      'model VoucherUserUsage {',
      'model VoucherConsumption {',
      'model VoucherRedemption {',
    ]) {
      expect(schema).toContain(model);
    }
    expect(migration).toContain('CREATE TABLE "vouchers"');
    expect(migration).toContain('CREATE TABLE "voucher_product_scopes"');
    expect(migration).toContain('CREATE TABLE "voucher_user_usages"');
    expect(migration).toContain('CREATE TABLE "voucher_consumptions"');
    expect(migration).toContain('CREATE TABLE "voucher_redemptions"');
  });

  it('enforces canonical definitions, benefits, windows, and safe VND limits', () => {
    expect(migration).toContain('vouchers_code_format_check');
    expect(migration).toContain('vouchers_issuer_shop_check');
    expect(migration).toContain('vouchers_benefit_configuration_check');
    expect(migration).toContain('"percentage_basis_points" BETWEEN 1 AND 10000');
    expect(migration).toContain('"minimum_spend_minor" BETWEEN 0 AND 9007199254740991');
    expect(migration).toContain('vouchers_activity_window_check');
    expect(migration).toContain('"starts_at" < "ends_at"');
  });

  it('bounds counters and preserves redemption history with restrictive relations', () => {
    expect(migration).toContain('vouchers_usage_limits_check');
    expect(migration).toContain('"used_count" BETWEEN 0 AND "usage_limit"');
    expect(migration).toContain('voucher_redemptions_amounts_check');
    expect(migration).toContain(
      '"discount_minor" = "merchandise_discount_minor" + "shipping_discount_minor"',
    );
    expect(migration).toContain('REFERENCES "voucher_consumptions"("id") ON DELETE RESTRICT');
    expect(migration).toContain('REFERENCES "vouchers"("id") ON DELETE RESTRICT');
  });

  it('adds uniqueness and lookup indexes for preview and transactional use', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "vouchers_code_key"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "voucher_consumptions_purchase_reference_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "voucher_redemptions_consumption_id_voucher_id_key"',
    );
    expect(migration).toContain('voucher_user_usages_user_id_voucher_id_idx');
    expect(migration).toContain('vouchers_shop_id_is_enabled_starts_at_ends_at_idx');
  });
});
